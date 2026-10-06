import type { StorageState } from "./useStorageState";
import type { Persistence } from "./usePersistence";
import type { Notify } from "../types";
import {
  supportsProjectFolderStorage,
  chooseProjectFolder,
  requestFolderPermission,
  readSetsFromFolder,
  storeDirectoryHandle,
  writeSetsToFolder,
  ProjectSetsFileStateError,
  clearStoredDirectoryHandle,
} from "../../fileStorage";
import { mergeStudySets } from "./mergeStudySets";
import { withFolderWriteLock } from "./folderWriteLock";
import {
  readBrowserStudySnapshot,
  BrowserStorageConflictError,
  saveBrowserStudySnapshot,
  requestBrowserStoragePersistence,
  getBrowserStorageEstimate,
} from "../../browserStorage";
import { STORAGE_REVISION_KEY } from "./constants";

export function useFolderStorage(state: StorageState, persistence: Persistence, setToast: Notify) {
  const {
    sets,
    setSets,
    setStorageMode,
    setStorageWriteState,
    browserStorageBlocked,
    setBrowserStorageBlocked,
    setFolderName,
    storageTransitioning,
    setStorageTransitioning,
    setStorageUsage,
    directoryHandleRef,
    folderWriteQueueRef,
    folderFileTextRef,
    folderGenerationRef,
    folderSaveRequestRef,
    browserRevisionRef,
    deletedSetIdsRef,
    explicitlyPersistedSetsRef,
  } = state;

  const { queueBrowserSave } = persistence;

  async function connectProjectFolder(reuseStoredHandle: boolean) {
    if (storageTransitioning) return;
    if (!supportsProjectFolderStorage()) {
      setStorageMode("unsupported");
      setStorageWriteState("error");
      return;
    }

    setStorageTransitioning(true);
    setStorageWriteState("saving");
    try {
      // Let any write already using the previous handle finish before changing
      // the storage generation. This prevents old closures from writing after
      // a destination switch.
      await folderWriteQueueRef.current.catch(() => undefined);
      const handle =
        reuseStoredHandle && directoryHandleRef.current
          ? directoryHandleRef.current
          : await chooseProjectFolder();
      const permission = await requestFolderPermission(handle);

      if (permission !== "granted") {
        setStorageMode("permission");
        setStorageWriteState("error");
        return;
      }

      const folderFile = await readSetsFromFolder(handle);
      if (
        folderFile.status === "invalid-json" ||
        folderFile.status === "invalid-data" ||
        folderFile.status === "too-large" ||
        folderFile.status === "error"
      ) {
        directoryHandleRef.current = handle;
        setFolderName(handle.name);
        setStorageMode("blocked");
        setStorageWriteState("error");
        setToast({
          message:
            folderFile.status === "error"
              ? "プロジェクトの sets.json を読み取れませんでした"
              : folderFile.status === "too-large"
                ? "sets.json が安全上限を超えているため、上書きを停止しました"
                : "既存の sets.json を読み取れないため、上書きを停止しました",
          tone: "error",
        });
        return;
      }

      const mergedSets =
        folderFile.status === "valid"
          ? mergeStudySets(sets, folderFile.sets, deletedSetIdsRef.current)
          : sets;
      // Persist the capability before mutating files. A later file failure can
      // then be retried without leaving an unremembered side effect.
      await storeDirectoryHandle(handle);
      directoryHandleRef.current = handle;
      folderGenerationRef.current += 1;
      folderSaveRequestRef.current += 1;
      setFolderName(handle.name);

      let writtenText: string;
      if (folderFile.status === "missing") {
        writtenText = await withFolderWriteLock(() =>
          writeSetsToFolder(handle, mergedSets, {
            createIfMissing: true,
            createBackup: false,
          }),
        );
      } else {
        writtenText = await withFolderWriteLock(() =>
          writeSetsToFolder(handle, mergedSets, {
            expectedText: folderFile.text,
            createBackup: true,
          }),
        );
      }
      folderFileTextRef.current = writtenText;

      let browserBackupWarning = false;
      if (!browserStorageBlocked) {
        try {
          await queueBrowserSave(mergedSets, {
            createBackup: true,
            coalesce: false,
          });
        } catch {
          browserBackupWarning = true;
          setBrowserStorageBlocked(true);
        }
      }
      explicitlyPersistedSetsRef.current = mergedSets;
      setSets(mergedSets);
      setStorageMode("folder");
      setStorageWriteState("saved");
      setToast({
        message: browserBackupWarning
          ? "フォルダー保存を有効にしました。ブラウザー予備保存は停止中です"
          : "プロジェクトフォルダーへの保存を有効にしました",
        tone: browserBackupWarning ? "warning" : "success",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStorageWriteState("idle");
        return;
      }
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
          message: "フォルダーへ保存できませんでした",
          tone: "error",
        });
      }
    } finally {
      setStorageTransitioning(false);
    }
  }

  async function disconnectProjectFolder() {
    if (storageTransitioning) return;
    setStorageTransitioning(true);
    try {
      // Ensure a durable browser copy exists before abandoning the folder.
      if (browserStorageBlocked) {
        const current = await readBrowserStudySnapshot();
        if (
          current.status === "valid" &&
          current.snapshot.revision !== browserRevisionRef.current
        ) {
          throw new BrowserStorageConflictError();
        }
        if (current.status !== "valid" && current.status !== "missing") {
          throw new Error("browser_storage_unavailable");
        }
        const snapshot = await saveBrowserStudySnapshot(sets, {
          expectedRevision:
            current.status === "valid" ? current.snapshot.revision : null,
          createBackup: true,
          deletedSetIds: Array.from(deletedSetIdsRef.current),
        });
        browserRevisionRef.current = snapshot.revision;
        try {
          localStorage.setItem(STORAGE_REVISION_KEY, snapshot.revision);
        } catch {
          // IndexedDB is already committed.
        }
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("recall-browser-storage-v2");
          channel.postMessage({ revision: snapshot.revision });
          channel.close();
        }
        setBrowserStorageBlocked(false);
      }
      folderGenerationRef.current += 1;
      folderSaveRequestRef.current += 1;
      await folderWriteQueueRef.current.catch(() => undefined);
      await clearStoredDirectoryHandle();
      directoryHandleRef.current = null;
      folderFileTextRef.current = undefined;
      setFolderName("");
      setStorageMode("browser");
      setStorageWriteState("idle");
      setToast({
        message:
          "ブラウザー内保存へ切り替えました。ブラウザー設定の権限は必要に応じて取り消してください",
        tone: "info",
      });
    } catch {
      setToast({
        message:
          "安全なブラウザー保存を確認できないため、フォルダー接続を維持しました",
        tone: "error",
      });
    } finally {
      setStorageTransitioning(false);
    }
  }

  async function makeBrowserStoragePersistent() {
    const persisted = await requestBrowserStoragePersistence();
    const estimate = await getBrowserStorageEstimate();
    setStorageUsage(estimate);
    setToast({
      message:
        persisted === true
          ? "ブラウザーへ永続ストレージを要求しました"
          : persisted === undefined
            ? "このブラウザーは永続ストレージ要求に対応していません"
            : "永続ストレージは許可されませんでした。外部バックアップも併用してください",
      tone: persisted === true ? "success" : "info",
    });
  }

  return { connectProjectFolder, disconnectProjectFolder, makeBrowserStoragePersistent };
}
