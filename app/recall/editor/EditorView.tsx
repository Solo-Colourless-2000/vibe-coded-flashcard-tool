import type { SetEditor } from "./useSetEditor";
import { EDITOR_PAGE_SIZE } from "./draft";
import {
  ArrowLeft,
  Upload,
  ArrowRight,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Repeat2,
  Trash2,
  Plus,
} from "lucide-react";
import {
  MAX_SET_TITLE_LENGTH,
  MAX_SET_DESCRIPTION_LENGTH,
  MAX_CARD_TEXT_LENGTH,
  MAX_CARDS_PER_SET,
} from "../../securityLimits";

type Props = { editor: SetEditor; explicitSaveInProgress: boolean; openSets: () => void };
export function EditorView({ editor, explicitSaveInProgress, openSets }: Props) {
  const { draft, setDraft, draftStatus, editorPage, setEditorPage, setImportOpen,
    saveDraft, editorError, setEditorError, editorInvalidField, setEditorInvalidField,
    moveDraftCard, swapDraftCard, removeDraftCard, updateDraftCard,
    removedDraftCard, undoRemoveDraftCard, addDraftCard } = editor;

  const pageCount = Math.max(
    1,
    Math.ceil(draft.cards.length / EDITOR_PAGE_SIZE),
  );
  const safeEditorPage = Math.min(editorPage, pageCount - 1);
  const pageStart = safeEditorPage * EDITOR_PAGE_SIZE;
  const visibleCards = draft.cards.slice(
    pageStart,
    pageStart + EDITOR_PAGE_SIZE,
  );
  return (
    <>
      <header className="editor-header">
        <button className="back-button" onClick={openSets} type="button">
          <ArrowLeft size={17} />
          セット一覧
        </button>
        <div className="save-indicator" aria-live="polite">
          {draftStatus === "saving"
            ? "下書きを保存中…"
            : draftStatus === "error"
              ? "下書きを保存できません"
              : "下書き保存済み"}
        </div>
        <div className="header-actions">
          <button
            className="secondary-button"
            onClick={() => setImportOpen(true)}
            type="button"
          >
            <Upload size={16} />
            インポート
          </button>
          <button
            className="secondary-button"
            disabled={explicitSaveInProgress}
            onClick={() => void saveDraft(false)}
            type="button"
          >
            {explicitSaveInProgress ? "保存中…" : "保存"}
          </button>
          <button
            className="primary-button"
            disabled={explicitSaveInProgress}
            onClick={() => void saveDraft(true)}
            type="button"
          >
            {explicitSaveInProgress ? "保存中…" : "保存して学習"}
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <section className="editor-intro">
        <span className="eyebrow">
          {draft.setId ? "EDIT SET" : "CREATE SET"}
        </span>
        <h1>{draft.setId ? "学習セットを編集" : "新しい学習セット"}</h1>
        <p>
          各文字をそのまま保存します。HTMLや記号として実行・変換されることはありません。
        </p>
      </section>

      <section className="set-details">
        <label>
          <span>
            セット名 <b>必須</b>
          </span>
          <input
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            aria-describedby={
              editorInvalidField === "set-title" ? "editor-error" : undefined
            }
            aria-invalid={editorInvalidField === "set-title"}
            id="set-title"
            maxLength={MAX_SET_TITLE_LENGTH}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                title: event.target.value,
              }));
              if (editorInvalidField === "set-title") {
                setEditorInvalidField("");
                setEditorError("");
              }
            }}
            placeholder="例：CompTIA Security+ 用語学習"
            spellCheck={false}
            type="text"
            value={draft.title}
          />
          <small>
            {draft.title.length} / {MAX_SET_TITLE_LENGTH}
          </small>
        </label>
        <label>
          <span>
            説明 <em>任意</em>
          </span>
          <textarea
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            id="set-description"
            maxLength={MAX_SET_DESCRIPTION_LENGTH}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="このセットの目的や範囲"
            spellCheck={false}
            value={draft.description}
          />
          <small>
            {draft.description.length} / {MAX_SET_DESCRIPTION_LENGTH}
          </small>
        </label>
      </section>

      {editorError && (
        <p className="editor-error" id="editor-error" role="alert">
          <AlertTriangle size={16} />
          {editorError}
        </p>
      )}

      <div className="card-editor-heading">
        <div>
          <span className="eyebrow">CARDS</span>
          <h2>{draft.cards.length} 枚</h2>
        </div>
        <p>学習時は「問題／定義」を見て「正解／用語」を入力します。</p>
      </div>

      {pageCount > 1 && (
        <nav className="editor-pagination" aria-label="カード編集ページ">
          <button
            className="secondary-button"
            disabled={safeEditorPage === 0}
            onClick={() => setEditorPage((page) => Math.max(0, page - 1))}
            type="button"
          >
            前の {EDITOR_PAGE_SIZE} 枚
          </button>
          <span role="status">
            {pageStart + 1}〜
            {Math.min(pageStart + visibleCards.length, draft.cards.length)} /{" "}
            {draft.cards.length} 枚 （{safeEditorPage + 1} / {pageCount}{" "}
            ページ）
          </span>
          <button
            className="secondary-button"
            disabled={safeEditorPage >= pageCount - 1}
            onClick={() =>
              setEditorPage((page) => Math.min(pageCount - 1, page + 1))
            }
            type="button"
          >
            次の {EDITOR_PAGE_SIZE} 枚
          </button>
        </nav>
      )}

      <div className="card-editor-list">
        {visibleCards.map((card, localIndex) => {
          const index = pageStart + localIndex;
          return (
            <article className="card-editor" key={card.id}>
              <header>
                <div>
                  <strong>{(index + 1).toString().padStart(2, "0")}</strong>
                </div>
                <div className="card-row-actions">
                  <button
                    aria-label={"カード " + (index + 1) + " を上へ"}
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => moveDraftCard(index, -1)}
                    type="button"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    aria-label={"カード " + (index + 1) + " を下へ"}
                    className="icon-button"
                    disabled={index === draft.cards.length - 1}
                    onClick={() => moveDraftCard(index, 1)}
                    type="button"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    aria-label={"カード " + (index + 1) + " の表裏を交換"}
                    className="icon-button"
                    onClick={() => swapDraftCard(card.id)}
                    title="表裏を交換"
                    type="button"
                  >
                    <Repeat2 size={15} />
                  </button>
                  <button
                    aria-label={"カード " + (index + 1) + " を削除"}
                    className="icon-button danger"
                    onClick={() => removeDraftCard(card.id)}
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </header>
              <div className="card-editor-fields">
                <label>
                  <span>正解／用語</span>
                  <textarea
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    aria-describedby={
                      editorInvalidField === "card-" + card.id + "-term"
                        ? "editor-error"
                        : undefined
                    }
                    aria-invalid={
                      editorInvalidField === "card-" + card.id + "-term"
                    }
                    id={"card-" + card.id + "-term"}
                    maxLength={MAX_CARD_TEXT_LENGTH}
                    onChange={(event) =>
                      updateDraftCard(
                        index,
                        card.id,
                        "term",
                        event.target.value,
                      )
                    }
                    placeholder="例：TLS"
                    spellCheck={false}
                    value={card.term}
                  />
                </label>
                <label>
                  <span>問題／定義</span>
                  <textarea
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    aria-describedby={
                      editorInvalidField === "card-" + card.id + "-definition"
                        ? "editor-error"
                        : undefined
                    }
                    aria-invalid={
                      editorInvalidField === "card-" + card.id + "-definition"
                    }
                    id={"card-" + card.id + "-definition"}
                    maxLength={MAX_CARD_TEXT_LENGTH}
                    onChange={(event) =>
                      updateDraftCard(
                        index,
                        card.id,
                        "definition",
                        event.target.value,
                      )
                    }
                    placeholder="例：通信中のデータを暗号化するプロトコルは？"
                    spellCheck={false}
                    value={card.definition}
                  />
                </label>
              </div>
            </article>
          );
        })}
      </div>

      {removedDraftCard && (
        <div className="editor-undo" role="status">
          <span>カードを編集下書きから削除しました。</span>
          <button
            className="text-button"
            onClick={undoRemoveDraftCard}
            type="button"
          >
            元に戻す
          </button>
        </div>
      )}

      <button
        className="add-card-button"
        disabled={draft.cards.length >= MAX_CARDS_PER_SET}
        onClick={addDraftCard}
        type="button"
      >
        <Plus size={18} />
        カードを追加
      </button>

      <div className="editor-bottom-actions">
        <button
          className="secondary-button"
          disabled={explicitSaveInProgress}
          onClick={() => void saveDraft(false)}
          type="button"
        >
          {explicitSaveInProgress ? "保存中…" : "セットを保存"}
        </button>
        <button
          className="primary-button"
          disabled={explicitSaveInProgress}
          onClick={() => void saveDraft(true)}
          type="button"
        >
          {explicitSaveInProgress ? "保存中…" : "保存して学習を始める"}
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
