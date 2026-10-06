import type { StorageState } from "./useStorageState";
import type { Notify } from "../types";
import { type StudySet, STORAGE_KEY } from "../../model";
import { saveBrowserStudySnapshot, BrowserStorageConflictError } from "../../browserStorage";
import { STORAGE_REVISION_KEY } from "./constants";
import { ProjectSetsFileStateError, writeSetsToFolder } from "../../fileStorage";
import { withFolderWriteLock } from "./folderWriteLock";
import { useCallback, useEffect } from "react";

export function usePersistence(state: StorageState, setToast: Notify) {
  const {
    sets,
    hydrated,
    storageMode,
    setStorageMode,
    setStorageWriteState,
    browserStorageBlocked,
    setBrowserStorageBlocked,
    setExplicitSaveInProgress,
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
  } = state;

  const reportBrowserStorageFailure = useCallback((message: string) => {
    setBrowserStorageBlocked(true);
    setStorageWriteState("error");
    setToast({ message, tone: "error" });
  }, [setBrowserStorageBlocked, setStorageWriteState, setToast]);

  const queueBrowserSave = useCallback((
    nextSets: StudySet[],
    options: { createBackup?: boolean; coalesce?: boolean } = {},
  ): Promise<void> => {
    const requestId = browserSaveGenerationRef.current + 1;
    browserSaveGenerationRef.current = requestId;
    const coalesce = options.coalesce !== false;

    const task = browserSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (coalesce && requestId !== browserSaveGenerationRef.current) return;
        const snapshot = await saveBrowserStudySnapshot(nextSets, {
          expectedRevision: browserRevisionRef.current,
          createBackup: options.createBackup === true,
          deletedSetIds: Array.from(deletedSetIdsRef.current),
        });
        browserRevisionRef.current = snapshot.revision;
        try {
          localStorage.setItem(STORAGE_REVISION_KEY, snapshot.revision);
        } catch {
          // The IndexedDB commit is already durable. The tiny revision key is
          // only a cross-tab fallback for browsers without BroadcastChannel.
        }
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("recall-browser-storage-v2");
          channel.postMessage({ revision: snapshot.revision });
          channel.close();
        }
      });
    browserSaveQueueRef.current = task;
    return task;
  }, [browserSaveGenerationRef, browserSaveQueueRef, browserRevisionRef, deletedSetIdsRef]);

  const handleFolderWriteFailure = useCallback((error: unknown) => {
    setStorageWriteState("error");
    if (error instanceof ProjectSetsFileStateError) {
      setStorageMode("blocked");
      setToast({
        message:
          error.fileState.status === "conflict"
            ? "外部変更を検知したため、sets.json の上書きを停止しました"
            : "sets.json を保護するため、フォルダーへの上書きを停止しました",
        tone: "error",
      });
    } else {
      setToast({
        message: "フォルダーへ安全に保存できませんでした",
        tone: "error",
      });
    }
  }, [setStorageWriteState, setStorageMode, setToast]);

  const queueFolderSave = useCallback((
    nextSets: StudySet[],
    options: { createBackup?: boolean; coalesce?: boolean } = {},
  ): Promise<void> => {
    const handle = directoryHandleRef.current;
    if (!handle || storageMode !== "folder") return Promise.resolve();

    const storageGeneration = folderGenerationRef.current;
    const requestId = folderSaveRequestRef.current + 1;
    folderSaveRequestRef.current = requestId;
    const coalesce = options.coalesce !== false;
    setStorageWriteState("saving");

    const task = folderWriteQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (storageGeneration !== folderGenerationRef.current) return;
        if (coalesce && requestId !== folderSaveRequestRef.current) return;
        const text = await withFolderWriteLock(() =>
          writeSetsToFolder(handle, nextSets, {
            expectedText: folderFileTextRef.current,
            createBackup: options.createBackup === true,
          }),
        );
        if (storageGeneration !== folderGenerationRef.current) return;
        folderFileTextRef.current = text;
      })
      .then(() => {
        if (
          storageGeneration === folderGenerationRef.current &&
          (!coalesce || requestId === folderSaveRequestRef.current)
        ) {
          setStorageWriteState("saved");
        }
      })
      .catch((error: unknown) => {
        if (storageGeneration === folderGenerationRef.current) {
          handleFolderWriteFailure(error);
        }
        throw error;
      });
    folderWriteQueueRef.current = task;
    return task;
  }, [
    directoryHandleRef,
    storageMode,
    folderGenerationRef,
    folderSaveRequestRef,
    setStorageWriteState,
    folderWriteQueueRef,
    folderFileTextRef,
    handleFolderWriteFailure,
  ]);

  async function persistSetsForExplicitAction(nextSets: StudySet[], deletedSetIds?: ReadonlySet<string>): Promise<{
    browserBackupWarning: boolean;
    folderWarning: boolean;
  }> {
    const previousDeletedSetIds = new Set(deletedSetIdsRef.current);
    if (deletedSetIds) deletedSetIdsRef.current = new Set(deletedSetIds);
    setExplicitSaveInProgress(true);
    let browserBackupWarning = false;
    let folderWarning = false;
    let browserSaved = false;
    let folderSaved = false;
    try {
      if (!browserStorageBlocked) {
        try {
          await queueBrowserSave(nextSets, {
            createBackup: true,
            coalesce: false,
          });
          browserSaved = true;
        } catch (error) {
          browserBackupWarning = true;
          if (error instanceof BrowserStorageConflictError) {
            reportBrowserStorageFailure(
              "別タブの変更を検知したため、ブラウザー保存を停止しました",
            );
          } else {
            reportBrowserStorageFailure(
              "ブラウザー内に安全に保存できないため、自動保存を停止しました",
            );
          }
        }
      }

      if (storageMode === "folder" && directoryHandleRef.current) {
        try {
          await queueFolderSave(nextSets, {
            createBackup: true,
            coalesce: false,
          });
          folderSaved = true;
        } catch (error) {
          folderWarning = true;
          if (!browserSaved) throw error;
        }
      }

      if (!browserSaved && !folderSaved) {
        throw new Error("no_durable_storage_available");
      }
      explicitlyPersistedSetsRef.current = nextSets;
      return { browserBackupWarning, folderWarning };
    } catch (error) {
      deletedSetIdsRef.current = previousDeletedSetIds;
      throw error;
    } finally {
      setExplicitSaveInProgress(false);
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    if (explicitlyPersistedSetsRef.current === sets) {
      explicitlyPersistedSetsRef.current = null;
      return;
    }

    if (!browserStorageBlocked) {
      void queueBrowserSave(sets, {
        createBackup: false,
        coalesce: true,
      }).catch((error: unknown) => {
        if (error instanceof BrowserStorageConflictError) {
          reportBrowserStorageFailure(
            "別タブまたは別アプリによる変更を検知し、ブラウザー保存を停止しました",
          );
        } else {
          reportBrowserStorageFailure(
            "ブラウザー内に保存できないため、自動保存を停止しました",
          );
        }
      });
    }

    if (storageMode === "folder" && directoryHandleRef.current) {
      void queueFolderSave(sets, { createBackup: false, coalesce: true }).catch(
        () => undefined,
      );
    }
  }, [
    sets,
    hydrated,
    storageMode,
    browserStorageBlocked,
    queueBrowserSave,
    queueFolderSave,
    reportBrowserStorageFailure,
    directoryHandleRef,
    explicitlyPersistedSetsRef,
  ]);

  useEffect(() => {
    if (!hydrated) return;

    function blockForExternalRevision(revision: unknown) {
      if (
        typeof revision !== "string" ||
        revision === browserRevisionRef.current
      )
        return;
      setBrowserStorageBlocked(true);
      setStorageWriteState("error");
      setToast({
        message:
          "別タブによる保存変更を検知し、データ保護のため自動保存を停止しました",
        tone: "error",
      });
    }

    function handleExternalStorageChange(event: StorageEvent) {
      if (event.storageArea !== localStorage) return;
      if (event.key === STORAGE_REVISION_KEY) {
        blockForExternalRevision(event.newValue);
      } else if (event.key === STORAGE_KEY && event.newValue !== null) {
        // Detect an older TOTAL RECALL build writing the legacy full-data key.
        setBrowserStorageBlocked(true);
        setStorageWriteState("error");
        setToast({
          message:
            "旧バージョンまたは別タブによる保存変更を検知し、自動保存を停止しました",
          tone: "error",
        });
      }
    }

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("recall-browser-storage-v2")
        : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const value = event.data;
        if (value && typeof value === "object" && "revision" in value) {
          blockForExternalRevision((value as { revision?: unknown }).revision);
        }
      };
    }

    window.addEventListener("storage", handleExternalStorageChange);
    return () => {
      window.removeEventListener("storage", handleExternalStorageChange);
      channel?.close();
    };
  }, [hydrated, browserRevisionRef, setBrowserStorageBlocked, setStorageWriteState, setToast]);

  useEffect(() => {
    if (!hydrated) return;
    function flushWhenHidden() {
      if (document.visibilityState !== "hidden") return;
      const currentSets = latestSetsRef.current;
      if (!browserStorageBlocked) {
        void queueBrowserSave(currentSets, {
          createBackup: false,
          coalesce: false,
        }).catch(() => undefined);
      }
    }
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", flushWhenHidden);
  }, [hydrated, browserStorageBlocked, latestSetsRef, queueBrowserSave]);

  return { queueBrowserSave, persistSetsForExplicitAction };
}

export type Persistence = ReturnType<typeof usePersistence>;
