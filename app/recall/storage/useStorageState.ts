import { useState, useRef, useEffect } from "react";
import { type StudySet, seedSets } from "../../model";
import type { StorageMode, StorageWriteState, BackupRestoreCandidate } from "../types";
import type { RecallDirectoryHandle } from "../../fileStorage";

export function useStorageState() {
  const [sets, setSets] = useState<StudySet[]>(seedSets);
  const [hydrated, setHydrated] = useState(false);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("browser");
  const [storageWriteState, setStorageWriteState] =
    useState<StorageWriteState>("idle");
  const [browserStorageBlocked, setBrowserStorageBlocked] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [storageTransitioning, setStorageTransitioning] = useState(false);
  const [explicitSaveInProgress, setExplicitSaveInProgress] = useState(false);
  const [storageUsage, setStorageUsage] = useState<{
    quota?: number;
    usage?: number;
    persisted?: boolean;
  }>({});
  const [browserBackupSummary, setBrowserBackupSummary] = useState<{
    count: number;
    latestSavedAt?: string;
  }>({ count: 0 });
  const [backupRestoreCandidate, setBackupRestoreCandidate] =
    useState<BackupRestoreCandidate | null>(null);
  const directoryHandleRef = useRef<RecallDirectoryHandle | null>(null);
  const folderWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const folderFileTextRef = useRef<string | undefined>(undefined);
  const folderGenerationRef = useRef(0);
  const folderSaveRequestRef = useRef(0);
  const browserRevisionRef = useRef<string | null>(null);
  const deletedSetIdsRef = useRef<Set<string>>(new Set());
  const browserSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const browserSaveGenerationRef = useRef(0);
  const explicitlyPersistedSetsRef = useRef<StudySet[] | null>(null);
  const latestSetsRef = useRef(sets);

  useEffect(() => { latestSetsRef.current = sets; }, [sets]);

  return {
    sets,
    setSets,
    hydrated,
    setHydrated,
    storageDialogOpen,
    setStorageDialogOpen,
    storageMode,
    setStorageMode,
    storageWriteState,
    setStorageWriteState,
    browserStorageBlocked,
    setBrowserStorageBlocked,
    folderName,
    setFolderName,
    storageTransitioning,
    setStorageTransitioning,
    explicitSaveInProgress,
    setExplicitSaveInProgress,
    storageUsage,
    setStorageUsage,
    browserBackupSummary,
    setBrowserBackupSummary,
    backupRestoreCandidate,
    setBackupRestoreCandidate,
    directoryHandleRef,
    folderWriteQueueRef,
    folderFileTextRef,
    folderGenerationRef,
    folderSaveRequestRef,
    browserRevisionRef,
    deletedSetIdsRef,
    browserSaveQueueRef,
    browserSaveGenerationRef,
    explicitlyPersistedSetsRef,
    latestSetsRef,
  };
}

export type StorageState = ReturnType<typeof useStorageState>;
