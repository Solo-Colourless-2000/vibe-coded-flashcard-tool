import type { StudySet } from "../../model";
import type { Flashcards } from "./useFlashcards";
import { ArrowLeft, Keyboard, ChevronLeft, ChevronRight, Shuffle } from "lucide-react";

type Props = { activeSet: StudySet | undefined; flashcards: Flashcards; openSets: () => void; openStudy: (setId: string) => void };
export function FlashcardsView({ activeSet, flashcards, openSets, openStudy }: Props) {
  const {
    currentFlashCard,
    flashFlipped,
    setFlashFlipped,
    moveFlash,
    flashIndex,
    flashOrder,
    shuffleFlashcards,
  } = flashcards;

  if (!activeSet || !currentFlashCard) return null;
  return (
    <section className="flashcard-view">
      <header>
        <button className="back-button" onClick={openSets} type="button">
          <ArrowLeft size={16} />
          セット一覧
        </button>
        <div>
          <span className="eyebrow">FLASHCARDS</span>
          <h1>{activeSet.title}</h1>
        </div>
        <button
          className="secondary-button"
          onClick={() => openStudy(activeSet.id)}
          type="button"
        >
          <Keyboard size={16} />
          入力学習へ
        </button>
      </header>

      <button
        aria-label={
          flashFlipped
            ? "定義を表示中。押すと用語を表示"
            : "用語を表示中。押すと定義を表示"
        }
        className="flashcard"
        onClick={() => setFlashFlipped((flipped) => !flipped)}
        type="button"
      >
        <span>{flashFlipped ? "DEFINITION / 問題" : "TERM / 正解"}</span>
        <strong>
          {flashFlipped ? currentFlashCard.definition : currentFlashCard.term}
        </strong>
        <small>クリックまたは Space で裏返す</small>
      </button>

      <div className="flash-controls">
        <button
          aria-label="前のカード"
          className="icon-button large"
          onClick={() => moveFlash(-1)}
          type="button"
        >
          <ChevronLeft size={21} />
        </button>
        <strong>
          {flashIndex + 1} <span>/ {flashOrder.length}</span>
        </strong>
        <button
          aria-label="次のカード"
          className="icon-button large"
          onClick={() => moveFlash(1)}
          type="button"
        >
          <ChevronRight size={21} />
        </button>
      </div>

      <button
        className="shuffle-button"
        onClick={shuffleFlashcards}
        type="button"
      >
        <Shuffle size={16} />
        シャッフル
      </button>
    </section>
  );
}
