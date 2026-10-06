import type { EditorDraft } from "../types.ts";
import { createBlankCards, isSafeIdentifier, normalizeTextLineEndings } from "../../model.ts";
import {
  MAX_STORED_JSON_CHARS,
  MAX_SET_TITLE_LENGTH,
  MAX_SET_DESCRIPTION_LENGTH,
  MAX_CARDS_PER_SET,
  MAX_CARD_TEXT_LENGTH,
} from "../../securityLimits.ts";

export const EDITOR_PAGE_SIZE = 100;

export const newDraft = (): EditorDraft => ({
  title: "",
  description: "",
  cards: createBlankCards(4),
});

export function validDraftFromStorage(value: string | null): EditorDraft | null {
  if (!value || value.length > MAX_STORED_JSON_CHARS) return null;
  try {
    const parsed = JSON.parse(value) as Partial<EditorDraft>;
    if (
      typeof parsed.title !== "string" ||
      parsed.title.length > MAX_SET_TITLE_LENGTH ||
      typeof parsed.description !== "string" ||
      parsed.description.length > MAX_SET_DESCRIPTION_LENGTH ||
      !Array.isArray(parsed.cards) ||
      parsed.cards.length === 0 ||
      parsed.cards.length > MAX_CARDS_PER_SET ||
      !parsed.cards.every(
        (card) =>
          card &&
          isSafeIdentifier(card.id) &&
          typeof card.term === "string" &&
          card.term.length <= MAX_CARD_TEXT_LENGTH &&
          typeof card.definition === "string" &&
          card.definition.length <= MAX_CARD_TEXT_LENGTH,
      )
    ) {
      return null;
    }
    if (!isSafeIdentifier(parsed.setId) && parsed.setId !== undefined) {
      return null;
    }
    const cardIds = parsed.cards.map((card) => card.id);
    if (new Set(cardIds).size !== cardIds.length) return null;
    return {
      setId: typeof parsed.setId === "string" ? parsed.setId : undefined,
      title: parsed.title,
      description: parsed.description,
      cards: parsed.cards.map((card) => ({
        id: card.id,
        term: normalizeTextLineEndings(card.term),
        definition: normalizeTextLineEndings(card.definition),
      })),
    };
  } catch {
    return null;
  }
}

