import {
  isSafeIdentifier,
  parseStoredSetsText,
  serializeStudySets,
  type StudySet,
} from "./model";

const DATABASE_NAME = "recall-browser-storage-v2";
const SNAPSHOT_STORE = "snapshots";
const BACKUP_STORE = "backups";
const DRAFT_STORE = "drafts";
const CURRENT_KEY = "current";
const DATABASE_VERSION = 2;
const OPEN_TIMEOUT_MS = 2_500;
const TRANSACTION_TIMEOUT_MS = 5_000;
const MAX_BACKUPS = 5;

export type BrowserStudySnapshot = {
  revision: string;
  savedAt: string;
  sets: StudySet[];
  deletedSetIds: string[];
};

export type BrowserSnapshotReadResult =
  | { status: "missing" }
  | { status: "valid"; snapshot: BrowserStudySnapshot }
  | { status: "invalid" }
  | { status: "unavailable"; error: unknown };

export class BrowserStorageConflictError extends Error {
  constructor() {
    super("browser_storage_conflict");
    this.name = "BrowserStorageConflictError";
  }
}

let revisionFallbackCounter = 0;

function makeRevision(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint32Array(4));
    return `rev_${Array.from(bytes, (value) => value.toString(36)).join("_")}`;
  }
  revisionFallbackCounter += 1;
  return `rev_${Date.now().toString(36)}_${revisionFallbackCounter.toString(36)}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(code));
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

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexed_db_unavailable"));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("indexed_db_open_timeout"));
    }, OPEN_TIMEOUT_MS);
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      reject(error);
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE);
      }
      if (!database.objectStoreNames.contains(BACKUP_STORE)) {
        database.createObjectStore(BACKUP_STORE, { autoIncrement: true });
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE);
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

async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>): Promise<T> {
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
    request.onerror = () => reject(request.error ?? new Error("indexed_db_request_failed"));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
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
      reject(new Error("indexed_db_transaction_timeout"));
    }, TRANSACTION_TIMEOUT_MS);

    transaction.oncomplete = () => finish();
    transaction.onerror = () =>
      finish(transaction.error ?? new Error("indexed_db_transaction_failed"));
    transaction.onabort = () =>
      finish(transaction.error ?? new Error("indexed_db_transaction_aborted"));
  });
}


function isReasonableIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) return false;
  return time <= Date.now() + 5 * 60 * 1000;
}

function validateSnapshot(value: unknown): BrowserStudySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<BrowserStudySnapshot>;
  if (
    typeof record.revision !== "string" ||
    record.revision.length < 1 ||
    record.revision.length > 160 ||
    !isReasonableIsoTimestamp(record.savedAt) ||
    !Array.isArray(record.sets)
  ) {
    return null;
  }
  try {
    const serialized = serializeStudySets(record.sets as StudySet[]);
    const parsed = parseStoredSetsText(serialized);
    if (parsed.status !== "valid") return null;
    const deletedSetIds = record.deletedSetIds === undefined ? [] : record.deletedSetIds;
    if (
      !Array.isArray(deletedSetIds) ||
      deletedSetIds.length > 2_000 ||
      !deletedSetIds.every(isSafeIdentifier) ||
      new Set(deletedSetIds).size !== deletedSetIds.length
    ) {
      return null;
    }
    return {
      revision: record.revision,
      savedAt: record.savedAt,
      sets: parsed.sets,
      deletedSetIds,
    };
  } catch {
    return null;
  }
}

export async function readBrowserStudySnapshot(): Promise<BrowserSnapshotReadResult> {
  try {
    const raw = await withDatabase(async (database) => {
      const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
      const value = await requestValue(
        transaction.objectStore(SNAPSHOT_STORE).get(CURRENT_KEY),
      );
      await waitForTransaction(transaction);
      return value;
    });
    if (raw === undefined) return { status: "missing" };
    const snapshot = validateSnapshot(raw);
    return snapshot ? { status: "valid", snapshot } : { status: "invalid" };
  } catch (error) {
    return { status: "unavailable", error };
  }
}

async function pruneBackups(store: IDBObjectStore): Promise<void> {
  const keys = await requestValue(store.getAllKeys());
  if (keys.length <= MAX_BACKUPS) return;
  const deleteCount = keys.length - MAX_BACKUPS;
  for (const key of keys.slice(0, deleteCount)) store.delete(key);
}

export async function saveBrowserStudySnapshot(
  sets: StudySet[],
  options: {
    expectedRevision?: string | null;
    createBackup?: boolean;
    deletedSetIds?: string[];
  } = {},
): Promise<BrowserStudySnapshot> {
  // Validate before beginning the transaction so invalid application state is never persisted.
  const serialized = serializeStudySets(sets);
  const parsed = parseStoredSetsText(serialized);
  if (parsed.status !== "valid") throw new Error("invalid_browser_snapshot");

  const normalizedDeletedSetIds = (options.deletedSetIds ?? [])
    .filter(isSafeIdentifier)
    .filter((id, index, values) => values.indexOf(id) === index)
    .slice(-2_000);
  const snapshot: BrowserStudySnapshot = {
    revision: makeRevision(),
    savedAt: new Date().toISOString(),
    sets: parsed.sets,
    deletedSetIds: normalizedDeletedSetIds,
  };

  return withDatabase(async (database) => {
    const transaction = database.transaction(
      [SNAPSHOT_STORE, BACKUP_STORE],
      "readwrite",
    );
    const snapshots = transaction.objectStore(SNAPSHOT_STORE);
    const backups = transaction.objectStore(BACKUP_STORE);
    const currentRaw = await requestValue(snapshots.get(CURRENT_KEY));
    const current = currentRaw === undefined ? null : validateSnapshot(currentRaw);
    if (options.deletedSetIds === undefined && current) {
      snapshot.deletedSetIds = current.deletedSetIds;
    }

    if (
      options.expectedRevision !== undefined &&
      (current?.revision ?? null) !== options.expectedRevision
    ) {
      transaction.abort();
      throw new BrowserStorageConflictError();
    }

    if (options.createBackup && current) {
      backups.add(current);
      await pruneBackups(backups);
    }
    snapshots.put(snapshot, CURRENT_KEY);
    await waitForTransaction(transaction);
    return snapshot;
  });
}

export async function migrateLegacyBrowserStudySets(
  sets: StudySet[],
): Promise<BrowserStudySnapshot> {
  const current = await readBrowserStudySnapshot();
  if (current.status === "valid") return current.snapshot;
  if (current.status !== "missing") {
    throw new Error("browser_storage_migration_unavailable");
  }
  return saveBrowserStudySnapshot(sets, { expectedRevision: null, createBackup: false });
}

export async function readBrowserStudyBackups(): Promise<BrowserStudySnapshot[]> {
  return withDatabase(async (database) => {
    const transaction = database.transaction(BACKUP_STORE, "readonly");
    const values = await requestValue(transaction.objectStore(BACKUP_STORE).getAll());
    await waitForTransaction(transaction);
    return values
      .map(validateSnapshot)
      .filter((value): value is BrowserStudySnapshot => value !== null)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  });
}


export async function readBrowserDraft(): Promise<string | null> {
  try {
    return await withDatabase(async (database) => {
      const transaction = database.transaction(DRAFT_STORE, "readonly");
      const value = await requestValue(transaction.objectStore(DRAFT_STORE).get("current"));
      await waitForTransaction(transaction);
      return typeof value === "string" ? value : null;
    });
  } catch {
    return null;
  }
}

export async function saveBrowserDraft(serialized: string): Promise<void> {
  await withDatabase(async (database) => {
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).put(serialized, "current");
    await waitForTransaction(transaction);
  });
}

export async function clearBrowserDraft(): Promise<void> {
  await withDatabase(async (database) => {
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).delete("current");
    await waitForTransaction(transaction);
  });
}

export async function getBrowserStorageEstimate(): Promise<{
  quota?: number;
  usage?: number;
  persisted?: boolean;
}> {
  if (typeof navigator === "undefined" || !navigator.storage) return {};
  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate?.().catch(() => undefined) ?? Promise.resolve(undefined),
    navigator.storage.persisted?.().catch(() => false) ?? Promise.resolve(false),
  ]);
  return {
    quota: estimate?.quota,
    usage: estimate?.usage,
    persisted,
  };
}

export async function requestBrowserStoragePersistence(): Promise<boolean | undefined> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return undefined;
  try {
    return await withTimeout(
      navigator.storage.persist(),
      3_000,
      "storage_persist_timeout",
    );
  } catch {
    return false;
  }
}
