import type { View, SetActions } from "../types";
import type { StudyStorage } from "../storage/useStudyStorage";
import { Home, Library, Plus, FileSpreadsheet, LockKeyhole } from "lucide-react";

type Props = {
  view: View;
  openHome: () => void;
  actions: Pick<SetActions, "openSets" | "startNewSet" | "startImportingSet">;
  storage: Pick<StudyStorage, "storageMode" | "folderName" | "storageWriteState" | "browserStorageBlocked" | "setStorageDialogOpen">;
};
export function AppSidebar({ view, openHome, actions, storage }: Props) {
  const { openSets, startNewSet, startImportingSet } = actions;
  const {
    storageMode,
    folderName,
    storageWriteState,
    browserStorageBlocked,
    setStorageDialogOpen,
  } = storage;
  function navigationActive(target: View): boolean {
    if (target === "home") return view === "home";
    if (target === "sets") {
      return ["sets", "study", "flashcards"].includes(view);
    }
    return false;
  }
  return (<aside className="sidebar">
    <button
      aria-label="TOTAL RECALL ホームへ戻る"
      className="brand"
      onClick={openHome}
      type="button"
    >
      <span className="brand-mark">R</span>
      <span>TOTAL RECALL</span>
    </button>
    <nav className="main-nav" aria-label="メインナビゲーション">
      <button
        aria-current={navigationActive("home") ? "page" : undefined}
        className={"nav-item" + (navigationActive("home") ? " active" : "")}
        onClick={openHome}
        type="button"
      >
        <Home size={18} />
        ホーム
      </button>
      <button
        aria-current={navigationActive("sets") ? "page" : undefined}
        className={"nav-item" + (navigationActive("sets") ? " active" : "")}
        onClick={openSets}
        type="button"
      >
        <Library size={18} />
        学習セット
      </button>
      <button
        aria-current={view === "editor" ? "page" : undefined}
        className={"nav-item" + (view === "editor" ? " active" : "")}
        onClick={() => startNewSet()}
        type="button"
      >
        <Plus size={18} />
        新規作成
      </button>
    </nav>
    <div className="sidebar-divider" />
    <button
      className="sidebar-import"
      onClick={startImportingSet}
      type="button"
    >
      <FileSpreadsheet size={17} />
      <span>
        <b>ファイル取込</b>
        <small>Excel / Text</small>
      </span>
    </button>
    <button
      aria-label="保存先設定を開く"
      className="sidebar-note storage-note"
      onClick={() => setStorageDialogOpen(true)}
      type="button"
    >
      <LockKeyhole size={16} />
      <div>
        <strong>
          {storageMode === "folder" || storageMode === "blocked"
            ? folderName
            : "ローカル保存"}
        </strong>
        <p>
          {browserStorageBlocked
            ? storageMode === "folder"
              ? "フォルダー保存中／予備保存停止"
              : "ブラウザー保存を保護停止"
            : storageMode === "folder"
              ? storageWriteState === "saving"
                ? "プロジェクトへ保存中…"
                : storageWriteState === "error"
                  ? "保存エラー。設定を確認"
                  : "プロジェクトにも保存済み"
              : storageMode === "permission"
                ? "フォルダーの再許可が必要"
                : storageMode === "blocked"
                  ? "既存ファイルを保護して停止"
                  : "ブラウザー内に保存中"}
        </p>
      </div>
    </button>
  </aside>);
}
