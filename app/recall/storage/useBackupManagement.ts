import type { StorageState } from "./useStorageState";
import type { Persistence } from "./usePersistence";
import type { Notify, SetState } from "../types";
import { type StudySet, STORAGE_KEY } from "../../model";
import { useEffect, type ChangeEvent } from "react";
import {
  readBrowserStudyBackups,
  readBrowserStudySnapshot,
  saveBrowserStudySnapshot,
  BrowserStorageConflictError,
  clearBrowserDraft,
} from "../../browserStorage";
import { STORAGE_REVISION_KEY, STORAGE_QUARANTINE_KEY } from "./constants";
import { serializeRecallBackup, MAX_BACKUP_FILE_BYTES, parseRecallBackup } from "../../backupFile";
import { makeBackupDownloadName, readBackupFileText } from "./backupFiles";

export function useBackupManagement(
  state: StorageState,
  persistence: Persistence,
  setToast: Notify,
  setActiveSetId: SetState<string>,
  onBackupRestored: (sets: StudySet[]) => void,
) {
  const {
    sets,
    setSets,
    storageDialogOpen,
    setStorageDialogOpen,
    storageMode,
    setStorageWriteState,
    setBrowserStorageBlocked,
    storageTransitioning,
    setStorageTransitioning,
    explicitSaveInProgress,
    setBrowserBackupSummary,
    backupRestoreCandidate,
    setBackupRestoreCandidate,
    browserRevisionRef,
    deletedSetIdsRef,
    explicitlyPersistedSetsRef,
  } = state;

  const { persistSetsForExplicitAction } = persistence;

  useEffect(() => {
    if (!storageDialogOpen) return;
    let cancelled = false;
    void readBrowserStudyBackups()
      .then((backups) => {
        if (cancelled) return;
        setBrowserBackupSummary({
          count: backups.length,
          latestSavedAt: backups[0]?.savedAt,
        });
      })
      .catch(() => {
        if (!cancelled) setBrowserBackupSummary({ count: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [storageDialogOpen, setBrowserBackupSummary]);

  async function restoreLatestBrowserBackup() {
    if (storageTransitioning || explicitSaveInProgress) return;
    setStorageTransitioning(true);
    try {
      const backups = await readBrowserStudyBackups();
      const latest = backups[0];
      if (!latest) {
        setToast({
          message: "復元できるブラウザー予備コピーがありません",
          tone: "info",
        });
        return;
      }
      const current = await readBrowserStudySnapshot();
      const expectedRevision =
        current.status === "valid"
          ? current.snapshot.revision
          : current.status === "missing"
            ? null
            : undefined;
      const restored = await saveBrowserStudySnapshot(latest.sets, {
        expectedRevision,
        createBackup: current.status === "valid",
        deletedSetIds: latest.deletedSetIds,
      });
      browserRevisionRef.current = restored.revision;
      deletedSetIdsRef.current = new Set(restored.deletedSetIds);
      explicitlyPersistedSetsRef.current = restored.sets;
      setSets(restored.sets);
      setActiveSetId((currentId) =>
        restored.sets.some((set) => set.id === currentId)
          ? currentId
          : (restored.sets[0]?.id ?? ""),
      );
      setBrowserStorageBlocked(false);
      setStorageWriteState(storageMode === "folder" ? "saved" : "idle");
      try {
        localStorage.setItem(STORAGE_REVISION_KEY, restored.revision);
      } catch {
        // IndexedDB is already committed.
      }
      setToast({
        message: "最新のブラウザー予備コピーを復元しました",
        tone: "success",
      });
      const refreshed = await readBrowserStudyBackups();
      setBrowserBackupSummary({
        count: refreshed.length,
        latestSavedAt: refreshed[0]?.savedAt,
      });
    } catch (error) {
      setToast({
        message:
          error instanceof BrowserStorageConflictError
            ? "別タブの変更を検知したため、予備コピーの復元を停止しました"
            : "ブラウザー予備コピーを復元できませんでした",
        tone: "error",
      });
    } finally {
      setStorageTransitioning(false);
    }
  }

  function exportRecallBackupFile() {
    try {
      const serialized = serializeRecallBackup(
        sets,
        Array.from(deletedSetIdsRef.current),
      );
      const url = URL.createObjectURL(
        new Blob([serialized], { type: "application/json;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = makeBackupDownloadName();
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setToast({
        message: "TOTAL RECALLバックアップを書き出しました",
        tone: "success",
      });
    } catch {
      setToast({
        message: "バックアップを書き出せませんでした",
        tone: "error",
      });
    }
  }

  async function handleBackupFileSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setToast({
        message: "バックアップファイルが安全な上限を超えています",
        tone: "error",
      });
      return;
    }
    try {
      const parsed = parseRecallBackup(await readBackupFileText(file));
      if (parsed.status !== "valid") {
        setToast({
          message:
            parsed.status === "too-large"
              ? "バックアップファイルが安全な上限を超えています"
              : "TOTAL RECALLバックアップとして検証できないファイルです",
          tone: "error",
        });
        return;
      }
      setBackupRestoreCandidate({ fileName: file.name, backup: parsed.backup });
    } catch {
      setToast({
        message: "バックアップファイルを読み取れませんでした",
        tone: "error",
      });
    }
  }

  async function confirmBackupRestore() {
    const candidate = backupRestoreCandidate;
    if (!candidate || explicitSaveInProgress || storageTransitioning) return;
    try {
      const result = await persistSetsForExplicitAction(candidate.backup.sets, new Set(candidate.backup.deletedSetIds));
      setSets(candidate.backup.sets);
      setActiveSetId(candidate.backup.sets[0]?.id ?? "");
      try {
        await clearBrowserDraft();
      } catch {
        // Restored set data is already durable; a stale draft is ignored below.
      }
      setBackupRestoreCandidate(null);
      setStorageDialogOpen(false);
      onBackupRestored(candidate.backup.sets);
      setToast({
        message: result.folderWarning
          ? "バックアップはブラウザーへ復元しましたが、フォルダー同期に失敗しました"
          : result.browserBackupWarning
            ? "バックアップはフォルダーへ復元しましたが、ブラウザー予備保存は停止中です"
            : "TOTAL RECALLバックアップを復元しました",
        tone:
          result.folderWarning || result.browserBackupWarning
            ? "warning"
            : "success",
      });
    } catch {
      setToast({
        message:
          "安全な保存先へ書き込めないため、バックアップ復元を中止しました",
        tone: "error",
      });
    }
  }

  async function recoverBrowserStorage() {
    try {
      const legacyText = localStorage.getItem(STORAGE_KEY);
      if (legacyText !== null) {
        try {
          localStorage.setItem(STORAGE_QUARANTINE_KEY, legacyText);
        } catch {
          // Recovery no longer depends on duplicating the legacy value in the
          // same quota-limited storage area.
        }
      }
      const snapshot = await saveBrowserStudySnapshot(sets, {
        createBackup: true,
        deletedSetIds: Array.from(deletedSetIdsRef.current),
      });
      browserRevisionRef.current = snapshot.revision;
      try {
        localStorage.setItem(STORAGE_REVISION_KEY, snapshot.revision);
      } catch {
        // IndexedDB is the durable primary store.
      }
      setBrowserStorageBlocked(false);
      setStorageWriteState(storageMode === "folder" ? "saved" : "idle");
      setToast({
        message: "現在の表示内容を新しいブラウザー保存領域へ安全に復旧しました",
        tone: "success",
      });
    } catch {
      setBrowserStorageBlocked(true);
      setStorageWriteState("error");
      setToast({
        message: "ブラウザー保存を復旧できませんでした",
        tone: "error",
      });
    }
  }

  return {
    restoreLatestBrowserBackup,
    exportRecallBackupFile,
    handleBackupFileSelection,
    confirmBackupRestore,
    recoverBrowserStorage,
  };
}
