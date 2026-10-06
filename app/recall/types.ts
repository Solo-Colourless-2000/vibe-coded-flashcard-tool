import type { RecallBackup } from "../backupFile";
import type { Flashcard, StudySet } from "../model";

import type { Dispatch, SetStateAction } from "react";
export type View = "home" | "sets" | "editor" | "study" | "flashcards";
export type StudyPhase =
  | "ready"
  | "question"
  | "retype"
  | "correct"
  | "batch-complete"
  | "complete";
export type StudyScreen = "ready" | "active" | "complete";
export type StorageMode =
  | "browser"
  | "folder"
  | "permission"
  | "unsupported"
  | "blocked";
export type StorageWriteState = "idle" | "saving" | "saved" | "error";
export type ToastTone = "success" | "info" | "warning" | "error";

export type ToastNotice = {
  message: string;
  tone: ToastTone;
};

export type BackupRestoreCandidate = {
  fileName: string;
  backup: RecallBackup;
};

export type EditorDraft = {
  setId?: string;
  title: string;
  description: string;
  cards: Flashcard[];
};

export type SetState<T> = Dispatch<SetStateAction<T>>;
export type Notify = SetState<ToastNotice | null>;
export type PersistResult = { browserBackupWarning: boolean; folderWarning: boolean };
export type PersistStudySets = (sets: StudySet[], deletedSetIds?: ReadonlySet<string>) => Promise<PersistResult>;
export type SetActions = {
  startNewSet: (restoreDraft?: boolean) => Promise<void>;
  startImportingSet: () => Promise<void>;
  editSet: (set: StudySet) => Promise<void>;
  openStudy: (setId: string) => void;
  openFlashcards: (setId: string) => void;
  openSets: () => void;
};
