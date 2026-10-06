import type { StorageState } from "./useStorageState";
import type { Notify, SetState } from "../types";
import { useEffect } from "react";
import { INITIAL_STORAGE_RESTORE_TIMEOUT_MS, STORAGE_QUARANTINE_KEY } from "./constants";
import { type StudySet, STORAGE_KEY, parseStoredSetsText, serializeStudySets, seedSets } from "../../model";
import { readBrowserStudySnapshot, migrateLegacyBrowserStudySets, getBrowserStorageEstimate } from "../../browserStorage";
import {
  supportsProjectFolderStorage,
  getStoredDirectoryHandle,
  getFolderPermission,
  readSetsFromFolder,
  writeSetsToFolder,
} from "../../fileStorage";

export function useStorageHydration(state: StorageState, setToast: Notify, setActiveSetId: SetState<string>) {
  const {
    setSets,
    setHydrated,
    setStorageMode,
    setStorageWriteState,
    setBrowserStorageBlocked,
    setFolderName,
    setStorageUsage,
    directoryHandleRef,
    folderFileTextRef,
    folderGenerationRef,
    browserRevisionRef,
    deletedSetIdsRef,
  } = state;

  useEffect(() => {
    let cancelled = false;
    let initialSetsCommitted = false;
    let browserReadFailed = false;
    let fallbackBlockedBrowserStorage = false;
    let restoredFolder = false;

    const restoreTimeout = window.setTimeout(() => {
      if (cancelled) return;
      setHydrated(true);
      if (!initialSetsCommitted && !browserReadFailed) {
        fallbackBlockedBrowserStorage = true;
        setBrowserStorageBlocked(true);
        setStorageWriteState("error");
        setToast({
          message:
            "保存先の確認に時間がかかったため、画面を先に表示しました。自動上書きは停止しています",
          tone: "error",
        });
      }
    }, INITIAL_STORAGE_RESTORE_TIMEOUT_MS);

    function commitInitialSets(nextSets: StudySet[]) {
      if (cancelled || initialSetsCommitted) return;
      initialSetsCommitted = true;
      setSets(nextSets);
      if (nextSets[0]) setActiveSetId(nextSets[0].id);
      setHydrated(true);
    }

    async function hydrateData() {
      let nextSets: StudySet[] | null = null;
      let browserSnapshotExists = false;

      const browserSnapshot = await readBrowserStudySnapshot();
      if (cancelled) return;
      if (browserSnapshot.status === "valid") {
        nextSets = browserSnapshot.snapshot.sets;
        browserRevisionRef.current = browserSnapshot.snapshot.revision;
        deletedSetIdsRef.current = new Set(
          browserSnapshot.snapshot.deletedSetIds,
        );
        browserSnapshotExists = true;
      } else if (browserSnapshot.status === "missing") {
        // One-time migration path from the original localStorage format.
        try {
          const storedText = localStorage.getItem(STORAGE_KEY);
          if (storedText !== null) {
            const parsed = parseStoredSetsText(storedText);
            if (parsed.status === "valid") {
              nextSets = parsed.sets;
              const migrated = await migrateLegacyBrowserStudySets(parsed.sets);
              browserRevisionRef.current = migrated.revision;
              browserSnapshotExists = true;
            } else {
              browserReadFailed = true;
              try {
                localStorage.setItem(STORAGE_QUARANTINE_KEY, storedText);
              } catch {
                // Keep the original legacy value untouched when quarantine is full.
              }
              setBrowserStorageBlocked(true);
              setStorageWriteState("error");
              setToast({
                message:
                  "破損または過大な旧ブラウザー保存を保護し、自動上書きを停止しました",
                tone: "error",
              });
            }
          }
        } catch {
          browserReadFailed = true;
          setBrowserStorageBlocked(true);
          setStorageWriteState("error");
          setToast({
            message: "ブラウザー内の保存データを読み取れませんでした",
            tone: "error",
          });
        }
      } else {
        browserReadFailed = true;
        setBrowserStorageBlocked(true);
        setStorageWriteState("error");
        setToast({
          message:
            browserSnapshot.status === "invalid"
              ? "ブラウザー保存の構造異常を検知し、自動上書きを停止しました"
              : "ブラウザー保存領域を利用できないため、自動上書きを停止しました",
          tone: "error",
        });
      }

      if (nextSets) {
        await Promise.resolve();
        commitInitialSets(nextSets);
      }

      if (!supportsProjectFolderStorage()) {
        if (!cancelled) setStorageMode("unsupported");
      } else {
        try {
          const handle = await getStoredDirectoryHandle();
          if (handle && !cancelled) {
            directoryHandleRef.current = handle;
            folderGenerationRef.current += 1;
            setFolderName(handle.name);
            const permission = await getFolderPermission(handle);
            if (permission === "granted") {
              const folderFile = await readSetsFromFolder(handle);
              if (folderFile.status === "valid") {
                if (nextSets === null) {
                  nextSets = folderFile.sets;
                  folderFileTextRef.current = folderFile.text;
                  restoredFolder = true;
                  setStorageMode("folder");
                  setStorageWriteState("saved");
                } else {
                  const browserText = serializeStudySets(nextSets, true);
                  if (browserText === folderFile.text) {
                    folderFileTextRef.current = folderFile.text;
                    restoredFolder = true;
                    setStorageMode("folder");
                    setStorageWriteState("saved");
                  } else {
                    // Do not silently pick a winner when both durable copies
                    // exist and differ. Keep the browser copy visible and stop
                    // folder writes until the user explicitly reconnects.
                    folderFileTextRef.current = folderFile.text;
                    setStorageMode("blocked");
                    setStorageWriteState("error");
                    setToast({
                      message:
                        "ブラウザー保存と sets.json の内容差を検知したため、フォルダー同期を停止しました",
                      tone: "warning",
                    });
                  }
                }
              } else if (folderFile.status === "missing") {
                const initialSets = nextSets ?? seedSets;
                folderFileTextRef.current = await writeSetsToFolder(
                  handle,
                  initialSets,
                  { createIfMissing: true, createBackup: false },
                );
                nextSets = initialSets;
                restoredFolder = true;
                setStorageMode("folder");
                setStorageWriteState("saved");
              } else {
                setStorageMode("blocked");
                setStorageWriteState("error");
                setToast({
                  message:
                    folderFile.status === "invalid-json" ||
                      folderFile.status === "invalid-data" ||
                      folderFile.status === "too-large"
                      ? "既存の sets.json を読み取れないため、上書きを停止しました"
                      : "プロジェクトの sets.json を読み取れませんでした",
                  tone: "error",
                });
              }
            } else {
              setStorageMode("permission");
            }
          }
        } catch {
          if (!cancelled) setStorageMode("browser");
        }
      }

      if (cancelled) return;
      const resolvedSets = nextSets ?? seedSets;
      if (!browserReadFailed && !browserSnapshotExists) {
        try {
          const migrated = await migrateLegacyBrowserStudySets(resolvedSets);
          browserRevisionRef.current = migrated.revision;
        } catch {
          browserReadFailed = true;
          setBrowserStorageBlocked(true);
          setStorageWriteState("error");
        }
      }
      if (!initialSetsCommitted) commitInitialSets(resolvedSets);
      if (fallbackBlockedBrowserStorage && !browserReadFailed) {
        setBrowserStorageBlocked(false);
        setStorageWriteState(restoredFolder ? "saved" : "idle");
      }
      void getBrowserStorageEstimate().then((estimate) => {
        if (!cancelled) setStorageUsage(estimate);
      });
      window.clearTimeout(restoreTimeout);
      setHydrated(true);
    }

    void hydrateData();
    return () => {
      cancelled = true;
      window.clearTimeout(restoreTimeout);
    };
  }, [
    browserRevisionRef,
    deletedSetIdsRef,
    directoryHandleRef,
    folderFileTextRef,
    folderGenerationRef,
    setActiveSetId,
    setBrowserStorageBlocked,
    setFolderName,
    setHydrated,
    setSets,
    setStorageMode,
    setStorageUsage,
    setStorageWriteState,
    setToast,
  ]);
}
