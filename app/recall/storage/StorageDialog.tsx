import type { StudyStorage } from "./useStudyStorage";
import { useRef } from "react";
import { ModalDialog } from "../shared/ModalDialog";
import { LockKeyhole, X, AlertTriangle, Download, Upload } from "lucide-react";

type Props = { storage: StudyStorage };
export function StorageDialog({ storage }: Props) {
  const { storageDialogOpen, setStorageDialogOpen, browserStorageBlocked, storageMode,
    storageWriteState, folderName, storageUsage, storageTransitioning, explicitSaveInProgress,
    makeBrowserStoragePersistent, browserBackupSummary, handleBackupFileSelection,
    exportRecallBackupFile, restoreLatestBrowserBackup, recoverBrowserStorage,
    disconnectProjectFolder, connectProjectFolder } = storage;
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  // Restore confirmation replaces settings so one focus trap owns the background.
  // Cancelling the confirmation reveals settings again without changing its state.
  if (!storageDialogOpen || storage.backupRestoreCandidate) return null;
  return (
    <ModalDialog labelledBy="storage-title" className="storage-dialog" onClose={() => setStorageDialogOpen(false)}>
      <header>
        <div className="storage-icon">
          <LockKeyhole size={21} />
        </div>
        <button
          aria-label="保存先設定を閉じる"
          className="icon-button"
          data-dialog-initial
          onClick={() => setStorageDialogOpen(false)}
          type="button"
        >
          <X size={17} />
        </button>
      </header>
      <span className="eyebrow">LOCAL STORAGE</span>
      <h2 id="storage-title">セットデータの保存先</h2>
      <p>
        ブラウザー内の予備コピーに加え、選択したプロジェクトフォルダー内へJSONファイルを保存できます。
      </p>

      {browserStorageBlocked && (
        <p className="inline-error" role="alert">
          <AlertTriangle size={15} />
          ブラウザー保存の破損または競合を検知し、自動上書きを停止しています。現在表示中の内容を確認してから復旧してください。
        </p>
      )}

      <div className={"storage-status " + storageMode}>
        <strong>
          {browserStorageBlocked && storageMode === "browser"
            ? "ブラウザー保存を保護停止中"
            : storageMode === "folder"
              ? "プロジェクトフォルダーへ保存中"
              : storageMode === "permission"
                ? "フォルダーへの再許可が必要"
                : storageMode === "unsupported"
                  ? "このブラウザーはフォルダー保存に未対応"
                  : storageMode === "blocked"
                    ? "既存の sets.json を保護して停止中"
                    : "ブラウザー内へ保存中"}
        </strong>
        <code>
          {storageMode === "folder" ||
            storageMode === "permission" ||
            storageMode === "blocked"
            ? folderName + "/recall-data/sets.json"
            : "Browser storage / IndexedDB"}
        </code>
        <small>
          {browserStorageBlocked
            ? storageMode === "folder"
              ? "フォルダー同期は継続していますが、ブラウザー内の予備コピーは競合保護のため停止中です。"
              : "検出した元データは上書きしていません。内容を確認後、明示的に復旧してください。"
            : storageMode === "folder"
              ? storageWriteState === "saving"
                ? "最新データを書き込んでいます。"
                : storageWriteState === "error"
                  ? "書き込みに失敗しました。フォルダーの権限を確認してください。"
                  : "最新データと同期済みです。"
              : storageMode === "blocked"
                ? "壊れたデータや読み取りエラーを上書きしません。sets.jsonを確認するか、別の保存先を選んでください。"
                : "プロジェクト保存を設定しても、ブラウザー内の予備コピーは維持されます。"}
        </small>
        {(storageUsage.usage !== undefined ||
          storageUsage.quota !== undefined) && (
            <small role="status">
              ブラウザー使用量:{" "}
              {storageUsage.usage === undefined
                ? "不明"
                : (storageUsage.usage / 1_048_576).toFixed(1) + " MiB"}
              {storageUsage.quota === undefined
                ? ""
                : " / " +
                (storageUsage.quota / 1_048_576).toFixed(1) +
                " MiB"}
              {storageUsage.persisted === undefined
                ? ""
                : storageUsage.persisted
                  ? "・永続ストレージ"
                  : "・標準ストレージ"}
            </small>
          )}
      </div>
      {storageUsage.persisted === false && (
        <button
          className="text-button storage-persistence-action"
          disabled={storageTransitioning || explicitSaveInProgress}
          onClick={() => void makeBrowserStoragePersistent()}
          type="button"
        >
          ブラウザーの永続ストレージを要求
        </button>
      )}
      <p className="storage-guidance">
        フォルダー保存は従来どおり任意の場所を選べます。安全性を高めるため、他の重要ファイルを含まないTOTAL
        RECALL専用フォルダーの利用を推奨します。
      </p>

      {browserBackupSummary.count > 0 && (
        <p className="storage-backup-summary">
          ブラウザー予備コピー: {browserBackupSummary.count} 世代
          {browserBackupSummary.latestSavedAt
            ? "（最新: " +
            new Intl.DateTimeFormat("ja-JP", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(browserBackupSummary.latestSavedAt)) +
            "）"
            : ""}
        </p>
      )}

      <input
        accept="application/json,.json"
        hidden
        onChange={(event) => void handleBackupFileSelection(event)}
        ref={backupFileInputRef}
        type="file"
      />

      <div className="storage-actions">
        <button
          className="secondary-button"
          disabled={storageTransitioning || explicitSaveInProgress}
          onClick={exportRecallBackupFile}
          type="button"
        >
          <Download aria-hidden="true" size={15} />
          バックアップを書き出す
        </button>
        <button
          className="secondary-button"
          disabled={storageTransitioning || explicitSaveInProgress}
          onClick={() => backupFileInputRef.current?.click()}
          type="button"
        >
          <Upload aria-hidden="true" size={15} />
          バックアップから復元
        </button>
        {browserBackupSummary.count > 0 && (
          <button
            className="secondary-button"
            disabled={storageTransitioning || explicitSaveInProgress}
            onClick={() => void restoreLatestBrowserBackup()}
            type="button"
          >
            最新の予備コピーを復元
          </button>
        )}
        {browserStorageBlocked && (
          <button
            className="secondary-button"
            disabled={storageTransitioning || explicitSaveInProgress}
            onClick={() => void recoverBrowserStorage()}
            type="button"
          >
            元データを隔離して復旧
          </button>
        )}
        {(storageMode === "folder" || storageMode === "blocked") && (
          <button
            className="text-button danger-text"
            disabled={
              storageTransitioning ||
              storageWriteState === "saving" ||
              explicitSaveInProgress
            }
            onClick={() => void disconnectProjectFolder()}
            type="button"
          >
            フォルダー保存を解除
          </button>
        )}
        {storageMode !== "unsupported" && (
          <button
            className="secondary-button"
            disabled={
              storageTransitioning ||
              storageWriteState === "saving" ||
              explicitSaveInProgress
            }
            onClick={() =>
              void connectProjectFolder(storageMode === "permission")
            }
            type="button"
          >
            {storageMode === "folder"
              ? "保存先を変更"
              : storageMode === "permission"
                ? "アクセスを再許可"
                : storageMode === "blocked"
                  ? "別の保存先を選択"
                  : "保存先フォルダーを選択"}
          </button>
        )}
        <button
          className="primary-button"
          onClick={() => setStorageDialogOpen(false)}
          type="button"
        >
          完了
        </button>
      </div>
    </ModalDialog>
  );
}
