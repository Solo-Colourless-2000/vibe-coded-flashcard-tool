import { readBrowserDraft, saveBrowserDraft } from "../../browserStorage";
import { DRAFT_KEY } from "../../model";
import { validDraftFromStorage } from "./draft";
import type { EditorDraft } from "../types";

export async function loadStoredDraft(): Promise<EditorDraft | null> {
  const indexedDraft = validDraftFromStorage(await readBrowserDraft());
  if (indexedDraft) return indexedDraft;
  try {
    const legacy = validDraftFromStorage(localStorage.getItem(DRAFT_KEY));
    if (legacy) {
      await saveBrowserDraft(JSON.stringify(legacy));
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // The migrated IndexedDB copy is already durable.
      }
    }
    return legacy;
  } catch {
    return null;
  }
}
