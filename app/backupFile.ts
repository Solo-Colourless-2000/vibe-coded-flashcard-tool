import {
  isSafeIdentifier,
  parseStoredSetsText,
  serializeStudySets,
  type StudySet,
} from "./model.ts";
import { MAX_STORED_JSON_CHARS } from "./securityLimits.ts";

const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_APP_VERSION = "0.2.1";
const MAX_BACKUP_FILE_CHARS = MAX_STORED_JSON_CHARS + 2_000_000;
export const MAX_BACKUP_FILE_BYTES = MAX_STORED_JSON_CHARS * 4 + 2_000_000;
const MAX_JSON_NESTING = 64;

export type RecallBackup = {
  schemaVersion: 1;
  appVersion: string;
  exportedAt: string;
  sets: StudySet[];
  deletedSetIds: string[];
};

export type RecallBackupParseResult =
  | { status: "valid"; backup: RecallBackup }
  | { status: "invalid-json" | "invalid-data" | "too-large" };

function hasExcessiveJsonNesting(value: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      depth += 1;
      if (depth > MAX_JSON_NESTING) return true;
    } else if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
  return false;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function uniqueSafeIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 2_000) return null;
  if (!value.every(isSafeIdentifier)) return null;
  const ids = value as string[];
  return new Set(ids).size === ids.length ? ids : null;
}

export function serializeRecallBackup(
  sets: StudySet[],
  deletedSetIds: string[],
): string {
  const setsText = serializeStudySets(sets);
  const parsedSets = parseStoredSetsText(setsText);
  if (parsedSets.status !== "valid") throw new Error("backup_sets_invalid");
  const normalizedDeletedSetIds = uniqueSafeIds(deletedSetIds);
  if (!normalizedDeletedSetIds) throw new Error("backup_deleted_ids_invalid");

  const backup: RecallBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: BACKUP_APP_VERSION,
    exportedAt: new Date().toISOString(),
    sets: parsedSets.sets,
    deletedSetIds: normalizedDeletedSetIds,
  };
  const serialized = JSON.stringify(backup, null, 2) + "\n";
  if (serialized.length > MAX_BACKUP_FILE_CHARS) {
    throw new Error("backup_too_large");
  }
  return serialized;
}

export function parseRecallBackup(value: string): RecallBackupParseResult {
  if (value.length > MAX_BACKUP_FILE_CHARS) return { status: "too-large" };
  if (hasExcessiveJsonNesting(value)) return { status: "invalid-data" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { status: "invalid-json" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "invalid-data" };
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.schemaVersion !== BACKUP_SCHEMA_VERSION ||
    typeof record.appVersion !== "string" ||
    record.appVersion.length < 1 ||
    record.appVersion.length > 80 ||
    !isIsoTimestamp(record.exportedAt)
  ) {
    return { status: "invalid-data" };
  }
  const deletedSetIds = uniqueSafeIds(record.deletedSetIds);
  if (!deletedSetIds) return { status: "invalid-data" };

  let setsText: string;
  try {
    setsText = JSON.stringify(record.sets);
  } catch {
    return { status: "invalid-data" };
  }
  const sets = parseStoredSetsText(setsText);
  if (sets.status !== "valid") {
    return {
      status: sets.status === "too-large" ? "too-large" : "invalid-data",
    };
  }

  return {
    status: "valid",
    backup: {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: record.appVersion,
      exportedAt: record.exportedAt,
      sets: sets.sets,
      deletedSetIds,
    },
  };
}
