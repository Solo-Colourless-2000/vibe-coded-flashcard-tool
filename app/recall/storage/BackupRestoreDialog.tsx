import type { StudyStorage } from "./useStudyStorage";
import { ModalDialog } from "../shared/ModalDialog";
import { RotateCcw } from "lucide-react";

type Props = { storage: Pick<StudyStorage, "backupRestoreCandidate" | "setBackupRestoreCandidate" | "explicitSaveInProgress" | "storageTransitioning" | "confirmBackupRestore"> };
export function BackupRestoreDialog({ storage }: Props) {
  const {
    backupRestoreCandidate,
    setBackupRestoreCandidate,
    explicitSaveInProgress,
    storageTransitioning,
    confirmBackupRestore,
  } = storage;
  if (!backupRestoreCandidate) return null;
  return (
    <ModalDialog labelledBy="backup-restore-title" className="confirm-dialog" role="alertdialog" onClose={() => setBackupRestoreCandidate(null)}>
      <div className="confirm-icon">
        <RotateCcw size={22} />
      </div>
      <h2 id="backup-restore-title">バックアップを復元しますか？</h2>
      <p>
        「{backupRestoreCandidate.fileName}」の
        {backupRestoreCandidate.backup.sets.length}セット・
        {backupRestoreCandidate.backup.sets.reduce(
          (total, set) => total + set.cards.length,
          0,
        )}
        枚を現在のデータとして復元します。現在の状態は復元前に予備コピーとして保存されます。
      </p>
      <div>
        <button
          className="secondary-button"
          data-dialog-initial
          disabled={explicitSaveInProgress}
          onClick={() => setBackupRestoreCandidate(null)}
          type="button"
        >
          キャンセル
        </button>
        <button
          className="primary-button"
          disabled={explicitSaveInProgress || storageTransitioning}
          onClick={() => void confirmBackupRestore()}
          type="button"
        >
          {explicitSaveInProgress ? "復元を保存中…" : "復元する"}
        </button>
      </div>
    </ModalDialog>
  );
}
