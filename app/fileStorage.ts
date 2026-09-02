import {
  parseStoredSetsText,
  serializeStudySets,
  type StudySet,
} from "./model.ts";
import { MAX_STORED_FILE_BYTES } from "./securityLimits.ts";

type RecallPermissionMode = "read" | "readwrite";

type RecallPermissionDescriptor = {
  mode: RecallPermissionMode;
};

type RecallWritable = {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

type RecallFileHandle = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<RecallWritable>;
};

export type ProjectSetsFileReadResult =
  | { status: "missing" }
  | { status: "valid"; sets: StudySet[]; text: string }
  | { status: "invalid-json"; text: string }
  | { status: "invalid-data"; text: string }
  | { status: "too-large" }
  | { status: "conflict"; text: string }
  | { status: "error"; error: unknown };

export type WriteSetsToFolderOptions = {
  createIfMissing?: boolean;
  expectedText?: string;
  createBackup?: boolean;
};

type BlockingProjectSetsFileReadResult = Exclude<
  ProjectSetsFileReadResult,
  { status: "valid" }
>;

export class ProjectSetsFileStateError extends Error {
  readonly fileState: BlockingProjectSetsFileReadResult;

  constructor(fileState: BlockingProjectSetsFileReadResult) {
    super("project_sets_file_" + fileState.status.replaceAll("-", "_"));
    this.name = "ProjectSetsFileStateError";
    this.fileState = fileState;
  }
}

export type RecallDirectoryHandle = {
  kind: "directory";
  name: string;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<RecallDirectoryHandle>;
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<RecallFileHandle>;
  queryPermission: (
    descriptor: RecallPermissionDescriptor,
  ) => Promise<PermissionState>;
  requestPermission: (
    descriptor: RecallPermissionDescriptor,
  ) => Promise<PermissionState>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: RecallPermissionMode;
      startIn?: string;
    }) => Promise<RecallDirectoryHandle>;
  }
}

const DATABASE_NAME = "recall-file-storage-v1";
const STORE_NAME = "directory-handles";
const HANDLE_KEY = "project-folder";
const DATA_DIRECTORY = "recall-data";
const DATA_FILE = "sets.json";
const LEGACY_BACKUP_FILE = "sets.backup.json";
const BACKUP_PREFIX = "sets.backup.";
const BACKUP_GENERATIONS = 5;
const INDEXED_DB_OPEN_TIMEOUT_MS = 2_500;
const INDEXED_DB_TRANSACTION_TIMEOUT_MS = 4_000;
const FILE_OPERATION_TIMEOUT_MS = 8_000;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorCode: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(errorCode));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function fileOperation<T>(promise: Promise<T>, label: string): Promise<T> {
  return withTimeout(promise, FILE_OPERATION_TIMEOUT_MS, `file_${label}_timeout`);
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexed_db_unavailable"));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DATABASE_NAME, 1);
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("indexed_db_open_timeout"));
    }, INDEXED_DB_OPEN_TIMEOUT_MS);
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      reject(error);
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(database);
    };
    request.onerror = () =>
      rejectOnce(request.error ?? new Error("indexed_db_open_failed"));
    request.onblocked = () => rejectOnce(new Error("indexed_db_open_blocked"));
  });
}

async function withDatabase<T>(
  operation: (database: IDBDatabase) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("indexed_db_request_failed"));
  });
}

function waitForTransaction(
  transaction: IDBTransaction,
  timeoutCode = "indexed_db_transaction_timeout",
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      if (error === undefined) resolve();
      else reject(error);
    };
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        transaction.abort();
      } catch {
        // The transaction may have completed between the timeout and abort.
      }
      reject(new Error(timeoutCode));
    }, INDEXED_DB_TRANSACTION_TIMEOUT_MS);

    transaction.oncomplete = () => finish();
    transaction.onerror = () =>
      finish(transaction.error ?? new Error("indexed_db_transaction_failed"));
    transaction.onabort = () =>
      finish(transaction.error ?? new Error("indexed_db_transaction_aborted"));
  });
}

function updateStoredDirectoryHandle(
  update: (store: IDBObjectStore) => void,
): Promise<void> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    try {
      update(transaction.objectStore(STORE_NAME));
      await waitForTransaction(transaction);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Preserve the original update or transaction error.
      }
      throw error;
    }
  });
}

export function supportsProjectFolderStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function" &&
    typeof indexedDB !== "undefined"
  );
}

export async function chooseProjectFolder(): Promise<RecallDirectoryHandle> {
  if (!window.showDirectoryPicker) {
    throw new Error("folder_picker_unsupported");
  }
  return window.showDirectoryPicker({
    id: "recall-project-folder",
    mode: "readwrite",
  });
}

export async function storeDirectoryHandle(
  handle: RecallDirectoryHandle,
): Promise<void> {
  await updateStoredDirectoryHandle((store) => store.put(handle, HANDLE_KEY));
}

function isDirectoryHandle(value: unknown): value is RecallDirectoryHandle {
  if (!value || typeof value !== "object") return false;
  const handle = value as Record<string, unknown>;
  return (
    handle.kind === "directory" &&
    typeof handle.name === "string" &&
    typeof handle.getDirectoryHandle === "function" &&
    typeof handle.getFileHandle === "function" &&
    typeof handle.queryPermission === "function" &&
    typeof handle.requestPermission === "function"
  );
}

export async function getStoredDirectoryHandle(): Promise<RecallDirectoryHandle | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const handle = await withDatabase(async (database) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(HANDLE_KEY);
      const [stored] = await Promise.all([
        requestValue(request),
        waitForTransaction(transaction, "indexed_db_read_timeout"),
      ]);
      return (stored as RecallDirectoryHandle | undefined) ?? null;
    });
    return isDirectoryHandle(handle) ? handle : null;
  } catch {
    return null;
  }
}

export async function clearStoredDirectoryHandle(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await updateStoredDirectoryHandle((store) => store.delete(HANDLE_KEY));
}

export async function getFolderPermission(
  handle: RecallDirectoryHandle,
): Promise<PermissionState> {
  return fileOperation(handle.queryPermission({ mode: "readwrite" }), "permission_query");
}

export async function requestFolderPermission(
  handle: RecallDirectoryHandle,
): Promise<PermissionState> {
  const current = await getFolderPermission(handle);
  if (current === "granted") return current;
  return fileOperation(handle.requestPermission({ mode: "readwrite" }), "permission_request");
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "NotFoundError"
  );
}

async function getDataDirectory(
  handle: RecallDirectoryHandle,
  create: boolean,
): Promise<RecallDirectoryHandle> {
  return fileOperation(
    handle.getDirectoryHandle(DATA_DIRECTORY, create ? { create: true } : undefined),
    "directory_access",
  );
}

async function getFileHandle(
  directory: RecallDirectoryHandle,
  name: string,
  create: boolean,
): Promise<RecallFileHandle> {
  return fileOperation(
    directory.getFileHandle(name, create ? { create: true } : undefined),
    "handle_access",
  );
}

async function readTextFile(fileHandle: RecallFileHandle): Promise<string> {
  const file = await fileOperation(fileHandle.getFile(), "get_file");
  if (file.size > MAX_STORED_FILE_BYTES) throw new Error("file_too_large");
  return fileOperation(file.text(), "read");
}

export async function readSetsFromFolder(
  handle: RecallDirectoryHandle,
): Promise<ProjectSetsFileReadResult> {
  let directory: RecallDirectoryHandle;
  try {
    directory = await getDataDirectory(handle, false);
  } catch (error) {
    return isNotFoundError(error)
      ? { status: "missing" }
      : { status: "error", error };
  }

  let fileHandle: RecallFileHandle;
  try {
    fileHandle = await getFileHandle(directory, DATA_FILE, false);
  } catch (error) {
    return isNotFoundError(error)
      ? { status: "missing" }
      : { status: "error", error };
  }

  let text: string;
  try {
    text = await readTextFile(fileHandle);
  } catch (error) {
    return error instanceof Error && error.message === "file_too_large"
      ? { status: "too-large" }
      : { status: "error", error };
  }

  const parsed = parseStoredSetsText(text);
  if (parsed.status === "valid") {
    return { status: "valid", sets: parsed.sets, text };
  }
  return { status: parsed.status, text };
}

async function writeTextFile(
  fileHandle: RecallFileHandle,
  text: string,
): Promise<void> {
  const writable = await fileOperation(fileHandle.createWritable(), "create_writable");
  try {
    await fileOperation(writable.write(text), "write");
    await fileOperation(writable.close(), "close");
  } catch (error) {
    try {
      if (writable.abort) await fileOperation(writable.abort(), "abort");
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}

async function readOptionalBackup(
  directory: RecallDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    const fileHandle = await getFileHandle(directory, name, false);
    const text = await readTextFile(fileHandle);
    return parseStoredSetsText(text).status === "valid" ? text : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function writeAndVerifyBackup(
  directory: RecallDirectoryHandle,
  name: string,
  text: string,
): Promise<void> {
  const handle = await getFileHandle(directory, name, true);
  await writeTextFile(handle, text);
  const verified = await readTextFile(handle);
  if (verified !== text || parseStoredSetsText(verified).status !== "valid") {
    throw new Error("project_backup_verification_failed");
  }
}

async function rotateBackups(
  directory: RecallDirectoryHandle,
  currentText: string,
): Promise<void> {
  const previous: Array<string | null> = [];
  for (let generation = 1; generation < BACKUP_GENERATIONS; generation += 1) {
    previous.push(
      await readOptionalBackup(directory, `${BACKUP_PREFIX}${generation}.json`),
    );
  }
  for (let generation = BACKUP_GENERATIONS; generation >= 2; generation -= 1) {
    const older = previous[generation - 2];
    if (older !== null) {
      await writeAndVerifyBackup(
        directory,
        `${BACKUP_PREFIX}${generation}.json`,
        older,
      );
    }
  }
  await writeAndVerifyBackup(directory, `${BACKUP_PREFIX}1.json`, currentText);
  // Preserve the historical filename for existing manual recovery instructions.
  await writeAndVerifyBackup(directory, LEGACY_BACKUP_FILE, currentText);
}

async function restoreMainFile(
  handle: RecallDirectoryHandle,
  directory: RecallDirectoryHandle,
  backupText: string,
): Promise<boolean> {
  try {
    const fileHandle = await getFileHandle(directory, DATA_FILE, true);
    await writeTextFile(fileHandle, backupText);
    const verification = await readSetsFromFolder(handle);
    return verification.status === "valid" && verification.text === backupText;
  } catch {
    return false;
  }
}

export async function writeSetsToFolder(
  handle: RecallDirectoryHandle,
  sets: StudySet[],
  options: WriteSetsToFolderOptions = {},
): Promise<string> {
  const serialized = serializeStudySets(sets, true);
  if (new TextEncoder().encode(serialized).byteLength > MAX_STORED_FILE_BYTES) {
    throw new Error("project_sets_file_too_large");
  }

  const initial = await readSetsFromFolder(handle);
  if (initial.status !== "valid") {
    if (!(initial.status === "missing" && options.createIfMissing === true)) {
      throw new ProjectSetsFileStateError(initial);
    }
  } else if (
    options.expectedText !== undefined &&
    initial.text !== options.expectedText
  ) {
    throw new ProjectSetsFileStateError({
      status: "conflict",
      text: initial.text,
    });
  } else if (initial.text === serialized) {
    return serialized;
  }

  const create = initial.status === "missing";
  const directory = await getDataDirectory(handle, create);
  let backupText: string | null = null;

  if (initial.status === "valid") {
    // Re-check immediately before any backup or main-file mutation. This closes
    // the previous race where a stale backup could be written before conflict detection.
    const latestBeforeBackup = await readSetsFromFolder(handle);
    if (
      latestBeforeBackup.status !== "valid" ||
      latestBeforeBackup.text !== initial.text
    ) {
      throw new ProjectSetsFileStateError(
        latestBeforeBackup.status === "valid"
          ? { status: "conflict", text: latestBeforeBackup.text }
          : latestBeforeBackup,
      );
    }
    backupText = latestBeforeBackup.text;

    if (options.createBackup !== false) {
      await rotateBackups(directory, backupText);
      // A third check prevents the backup work itself from hiding a concurrent
      // external edit. A conflict leaves the external main file untouched.
      const latestAfterBackup = await readSetsFromFolder(handle);
      if (
        latestAfterBackup.status !== "valid" ||
        latestAfterBackup.text !== backupText
      ) {
        throw new ProjectSetsFileStateError(
          latestAfterBackup.status === "valid"
            ? { status: "conflict", text: latestAfterBackup.text }
            : latestAfterBackup,
        );
      }
    }
  } else {
    // Creating the data directory can race with another process creating
    // sets.json. Re-read before asking for a create-capable file handle so a
    // newly appeared file is never treated as our empty destination.
    const latestBeforeCreate = await readSetsFromFolder(handle);
    if (latestBeforeCreate.status !== "missing") {
      throw new ProjectSetsFileStateError(
        latestBeforeCreate.status === "valid"
          ? { status: "conflict", text: latestBeforeCreate.text }
          : latestBeforeCreate,
      );
    }
  }

  const fileHandle = await getFileHandle(directory, DATA_FILE, create);
  await writeTextFile(fileHandle, serialized);
  const verification = await readSetsFromFolder(handle);
  if (verification.status === "valid" && verification.text === serialized) {
    return serialized;
  }

  // If another valid version appeared after our write, treat it as a conflict
  // and never overwrite it during rollback.
  if (verification.status === "valid") {
    throw new ProjectSetsFileStateError({
      status: "conflict",
      text: verification.text,
    });
  }

  if (backupText !== null) {
    const restored = await restoreMainFile(handle, directory, backupText);
    if (!restored) throw new Error("project_sets_file_rollback_failed");
  }
  throw new Error("project_sets_file_verification_failed");
}
