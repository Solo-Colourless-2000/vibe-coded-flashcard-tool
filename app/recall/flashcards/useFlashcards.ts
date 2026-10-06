import type { StudySet } from "../../model";
import type { SetState, View } from "../types";
import { useState } from "react";
import { shuffleIds } from "../shared/setHelpers";

type Options = {
  sets: StudySet[];
  activeSetId: string;
  setActiveSetId: SetState<string>;
  goTo: (view: View) => void;
};
export function useFlashcards({ sets, activeSetId, setActiveSetId, goTo }: Options) {
  const [flashOrder, setFlashOrder] = useState<string[]>([]);
  const [flashIndex, setFlashIndex] = useState(0);
  const [flashFlipped, setFlashFlipped] = useState(false);

  const activeSet = sets.find((set) => set.id === activeSetId) ?? sets[0];

  const currentFlashCard = activeSet?.cards.find(
    (card) => card.id === flashOrder[flashIndex],
  );

  function openFlashcards(setId: string) {
    const set = sets.find((item) => item.id === setId);
    if (!set) return;
    setActiveSetId(setId);
    setFlashOrder(set.cards.map((card) => card.id));
    setFlashIndex(0);
    setFlashFlipped(false);
    goTo("flashcards");
  }

  function moveFlash(offset: -1 | 1) {
    if (flashOrder.length === 0) return;
    setFlashIndex((index) => {
      const next = index + offset;
      if (next < 0) return flashOrder.length - 1;
      if (next >= flashOrder.length) return 0;
      return next;
    });
    setFlashFlipped(false);
  }

  function shuffleFlashcards() { setFlashOrder((order) => shuffleIds(order)); setFlashIndex(0); setFlashFlipped(false); }
  function resetFlashcards() { setFlashOrder([]); setFlashIndex(0); setFlashFlipped(false); }

  return {
    flashOrder,
    flashIndex,
    flashFlipped,
    setFlashFlipped,
    currentFlashCard,
    openFlashcards,
    moveFlash,
    shuffleFlashcards,
    resetFlashcards,
  };
}
export type Flashcards = ReturnType<typeof useFlashcards>;
