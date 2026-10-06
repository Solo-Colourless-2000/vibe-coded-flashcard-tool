import type { SetLibrary } from "./useSetLibrary";
import type { SetActions } from "../types";
import {
  FileSpreadsheet,
  Plus,
  Search,
  CircleHelp,
  Layers3,
  Keyboard,
  BookOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import { hasResumableProgress, formatRelativeDate } from "../shared/setHelpers";

type Props = { library: SetLibrary; actions: SetActions };
export function LibraryView({ library, actions }: Props) {
  const { sets, totalCards, filteredSets, search, setSearch, setDeleteTarget } = library;
  const { startImportingSet, startNewSet, openStudy, openFlashcards, editSet } = actions;

  return (
    <>
      <header className="page-header compact">
        <div>
          <span className="eyebrow">LIBRARY</span>
          <h1>学習セット</h1>
          <p>
            {sets.length}セット、{totalCards}枚をこの端末に保存しています。
          </p>
        </div>
        <div className="header-actions">
          <button
            className="secondary-button"
            onClick={startImportingSet}
            type="button"
          >
            <FileSpreadsheet size={17} />
            インポート
          </button>
          <button
            className="primary-button"
            onClick={() => startNewSet()}
            type="button"
          >
            <Plus size={17} />
            新規作成
          </button>
        </div>
      </header>

      <div className="library-toolbar">
        <label className="search-box">
          <Search size={17} />
          <span className="visually-hidden">セットを検索</span>
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="セット名や説明を検索"
            type="search"
            value={search}
          />
        </label>
        <span>{filteredSets.length} 件</span>
      </div>

      {filteredSets.length === 0 ? (
        <section className="empty-state">
          <CircleHelp size={28} />
          <h2>一致するセットがありません</h2>
          <p>検索語を変えるか、新しいセットを作成してください。</p>
        </section>
      ) : (
        <div className="library-list">
          {filteredSets.map((set) => {
            const resumable = hasResumableProgress(set);
            return (
              <article className="library-row" key={set.id}>
                <div className="library-icon">
                  <Layers3 size={20} />
                </div>
                <div className="library-copy">
                  <div>
                    <h2>{set.title}</h2>
                    <span>{set.cards.length} 枚</span>
                  </div>
                  <p>{set.description || "説明はありません。"}</p>
                  <small>
                    最終学習 {formatRelativeDate(set.lastStudiedAt)}
                    {resumable
                      ? " · 進行中 " +
                      ((set.studyProgress?.batchStart ?? 0) +
                        (set.studyProgress?.masteredIds.length ?? 0)) +
                      "/" +
                      set.cards.length +
                      "枚"
                      : set.lastScore !== undefined
                        ? " · 前回 " + set.lastScore + "%"
                        : ""}
                  </small>
                </div>
                <div className="library-actions">
                  <button
                    className="primary-button small"
                    onClick={() => openStudy(set.id)}
                    type="button"
                  >
                    <Keyboard size={15} />
                    {resumable ? "続きから" : "入力学習"}
                  </button>
                  <button
                    aria-label={set.title + "をカードで確認"}
                    className="icon-button"
                    onClick={() => openFlashcards(set.id)}
                    title="フラッシュカード"
                    type="button"
                  >
                    <BookOpen size={17} />
                  </button>
                  <button
                    aria-label={set.title + "を編集"}
                    className="icon-button"
                    onClick={() => editSet(set)}
                    title="編集"
                    type="button"
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    aria-label={set.title + "を削除"}
                    className="icon-button danger"
                    onClick={() => setDeleteTarget(set)}
                    title="削除"
                    type="button"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
