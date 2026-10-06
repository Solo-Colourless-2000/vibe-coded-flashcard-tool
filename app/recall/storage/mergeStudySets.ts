import type { StudySet } from "../../model.ts";
import { timestamp } from "../shared/setHelpers.ts";

export function mergeStudySets(
  browserSets: StudySet[],
  folderSets: StudySet[],
  deletedSetIds: ReadonlySet<string> = new Set(),
): StudySet[] {
  const merged = new Map<string, StudySet>();
  for (const set of browserSets) merged.set(set.id, set);
  const now = Date.now();
  const futureToleranceMs = 5 * 60 * 1000;
  const safeTimestamp = (value: string) => {
    const parsed = timestamp(value);
    return parsed <= now + futureToleranceMs ? parsed : 0;
  };

  for (const folderSet of folderSets) {
    if (deletedSetIds.has(folderSet.id)) continue;
    const current = merged.get(folderSet.id);
    if (!current) {
      merged.set(folderSet.id, folderSet);
      continue;
    }
    if (JSON.stringify(current) === JSON.stringify(folderSet)) continue;
    // With bounded timestamps, newest durable copy wins for the same ID.
    // Browser wins ties so a reconnect never changes data without evidence.
    if (safeTimestamp(folderSet.updatedAt) > safeTimestamp(current.updatedAt)) {
      merged.set(folderSet.id, folderSet);
    }
  }
  return Array.from(merged.values()).sort(
    (a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt),
  );
}
