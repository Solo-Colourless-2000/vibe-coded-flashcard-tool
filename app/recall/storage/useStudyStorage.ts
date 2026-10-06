import type { Notify, SetState } from "../types";
import type { StudySet } from "../../model";
import { useStorageState } from "./useStorageState";
import { usePersistence } from "./usePersistence";
import { useStorageHydration } from "./useStorageHydration";
import { useFolderStorage } from "./useFolderStorage";
import { useBackupManagement } from "./useBackupManagement";

type Options = {
  setToast: Notify;
  setActiveSetId: SetState<string>;
  onBackupRestored: (sets: StudySet[]) => void;
};

export function useStudyStorage({ setToast, setActiveSetId, onBackupRestored }: Options) {
  const state = useStorageState();
  const persistence = usePersistence(state, setToast);
  useStorageHydration(state, setToast, setActiveSetId);
  const folder = useFolderStorage(state, persistence, setToast);
  const backups = useBackupManagement(state, persistence, setToast, setActiveSetId, onBackupRestored);
  const {
    sets, setSets, hydrated, storageDialogOpen, setStorageDialogOpen,
    storageMode, storageWriteState, browserStorageBlocked, folderName,
    storageTransitioning, explicitSaveInProgress, storageUsage,
    browserBackupSummary, backupRestoreCandidate, setBackupRestoreCandidate,
  } = state;
  return {
    sets, setSets, hydrated, storageDialogOpen, setStorageDialogOpen,
    storageMode, storageWriteState, browserStorageBlocked, folderName,
    storageTransitioning, explicitSaveInProgress, storageUsage,
    browserBackupSummary, backupRestoreCandidate, setBackupRestoreCandidate,
    persistSetsForExplicitAction: persistence.persistSetsForExplicitAction,
    persistDeletion: (remaining: StudySet[], id: string) => persistence.persistSetsForExplicitAction(remaining, new Set([...state.deletedSetIdsRef.current, id])),
    ...folder, ...backups,
  };
}

export type StudyStorage = ReturnType<typeof useStudyStorage>;
