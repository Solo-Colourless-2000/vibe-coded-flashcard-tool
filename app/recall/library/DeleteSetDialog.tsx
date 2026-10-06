import type { SetLibrary } from "./useSetLibrary";
import { ModalDialog } from "../shared/ModalDialog";
import { Trash2 } from "lucide-react";

type Props = { library: Pick<SetLibrary, "deleteTarget" | "setDeleteTarget" | "confirmDelete">; explicitSaveInProgress: boolean };
export function DeleteSetDialog({ library, explicitSaveInProgress }: Props) {
  const { deleteTarget, setDeleteTarget, confirmDelete } = library;
  if (!deleteTarget) return null;
  return (
    <ModalDialog labelledBy="delete-title" className="confirm-dialog" role="alertdialog" onClose={() => setDeleteTarget(null)}>
      <div className="confirm-icon">
        <Trash2 size={22} />
      </div>
      <h2 id="delete-title">セットを削除しますか？</h2>
      <p>
        「{deleteTarget.title}」と{deleteTarget.cards.length}
        枚のカードを、この端末から削除します。
      </p>
      <div>
        <button
          className="secondary-button"
          data-dialog-initial
          onClick={() => setDeleteTarget(null)}
          type="button"
        >
          キャンセル
        </button>
        <button
          className="danger-button"
          disabled={explicitSaveInProgress}
          onClick={() => void confirmDelete()}
          type="button"
        >
          {explicitSaveInProgress ? "削除を保存中…" : "削除する"}
        </button>
      </div>
    </ModalDialog>
  );
}
