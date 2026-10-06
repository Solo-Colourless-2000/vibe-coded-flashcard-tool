import {
  hasAnyCardContent,
  hasCompleteCardPair,
  normalizeTextLineEndings,
  makeId,
  serializeStudySets,
  type StudySet,
} from "../../model.ts";
import {
  MAX_SET_DESCRIPTION_LENGTH,
  MAX_STUDY_SETS,
  MAX_CARDS_PER_SET,
  MAX_TOTAL_STORED_CARDS,
} from "../../securityLimits.ts";
import { cardContentMatches } from "../shared/setHelpers.ts";
import { EDITOR_PAGE_SIZE } from "./draft.ts";
import type { EditorDraft } from "../types.ts";

type DraftSaveResult =
  | { status: "invalid"; message: string; fieldId: string; editorPage?: number }
  | { status: "valid"; id: string; nextSets: StudySet[]; existing: StudySet | undefined };

function invalid(message: string, fieldId: string, editorPage?: number): DraftSaveResult {
  return { status: "invalid", message, fieldId, editorPage };
}

export function prepareDraftSave(draft: EditorDraft, sets: StudySet[], now = new Date().toISOString()): DraftSaveResult {
  const title = draft.title.trim();
  if (!title) {
    return invalid("セット名を入力してください。", "set-title");
  }
  if (draft.description.length > MAX_SET_DESCRIPTION_LENGTH) {
    return invalid(
      "説明は " + MAX_SET_DESCRIPTION_LENGTH + " 文字以内にしてください。",
      "set-description",
    );
  }
  if (!draft.setId && sets.length >= MAX_STUDY_SETS) {
    return invalid(
      "学習セット数の上限（" + MAX_STUDY_SETS + "件）に達しています。",
      "set-title",
    );
  }
  const partialIndex = draft.cards.findIndex(
    (card) => hasAnyCardContent(card) && !hasCompleteCardPair(card),
  );
  if (partialIndex >= 0) {
    const partialCard = draft.cards[partialIndex];
    const missingField =
      partialCard.term.trim().length === 0 ? "term" : "definition";
    return invalid(
      "カード " + (partialIndex + 1) + " の正解または問題が空です。",
      "card-" + partialCard.id + "-" + missingField,
      Math.floor(partialIndex / EDITOR_PAGE_SIZE),
    );
  }
  const cards = draft.cards.filter(hasCompleteCardPair).map((card) => ({
    id: card.id,
    term: normalizeTextLineEndings(card.term),
    definition: normalizeTextLineEndings(card.definition),
  }));
  if (cards.length === 0) {
    const firstCard = draft.cards[0];
    return invalid(
      "少なくとも1枚のカードを入力してください。",
      firstCard ? "card-" + firstCard.id + "-term" : "set-title",
    );
  }
  if (cards.length > MAX_CARDS_PER_SET) {
    return invalid(
      "1セットのカード上限は " + MAX_CARDS_PER_SET + " 枚です。",
      "set-title",
    );
  }

  const id = draft.setId ?? makeId("set");
  const existing = sets.find((set) => set.id === id);
  const contentChanged = existing
    ? !cardContentMatches(existing.cards, cards)
    : false;
  const saved: StudySet = {
    id,
    title,
    description: normalizeTextLineEndings(draft.description),
    cards,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastStudiedAt: contentChanged ? undefined : existing?.lastStudiedAt,
    lastScore: contentChanged ? undefined : existing?.lastScore,
    studyProgress: contentChanged ? undefined : existing?.studyProgress,
  };

  const totalCards =
    sets.reduce((total, set) => total + set.cards.length, 0) -
    (existing?.cards.length ?? 0) +
    cards.length;
  if (totalCards > MAX_TOTAL_STORED_CARDS) {
    return invalid(
      "全セット合計のカード上限を超えるため保存できません。",
      "set-title",
    );
  }
  const nextSets = existing
    ? sets.map((set) => (set.id === id ? saved : set))
    : [saved, ...sets];
  try {
    serializeStudySets(nextSets);
  } catch {
    return invalid(
      "安全な保存上限またはデータ形式を満たしていません。",
      "set-title",
    );
  }

  return { status: "valid", id, nextSets, existing };
}
