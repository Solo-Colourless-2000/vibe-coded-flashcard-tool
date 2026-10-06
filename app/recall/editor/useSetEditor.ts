import { loadStoredDraft } from "./draftStorage";
import { type StudySet, type Flashcard, createBlankCards, hasAnyCardContent, DRAFT_KEY } from "../../model";
import type { SetState, View, PersistStudySets, Notify, EditorDraft } from "../types";
import { useState, useRef, useEffect } from "react";
import { newDraft, validDraftFromStorage, EDITOR_PAGE_SIZE } from "./draft";
import { saveBrowserDraft, clearBrowserDraft } from "../../browserStorage";
import { MAX_CARDS_PER_SET } from "../../securityLimits";
import { prepareDraftSave } from "./prepareDraftSave";

type Options = {
  sets: StudySet[];
  setSets: SetState<StudySet[]>;
  hydrated: boolean;
  view: View;
  setActiveSetId: SetState<string>;
  explicitSaveInProgress: boolean;
  persistSetsForExplicitAction: PersistStudySets;
  goTo: (view: View) => void;
  setToast: Notify;
  onStudyReady: () => void;
};
export function useSetEditor({
  sets,
  setSets,
  hydrated,
  view,
  setActiveSetId,
  explicitSaveInProgress,
  persistSetsForExplicitAction,
  goTo,
  setToast,
  onStudyReady,
}: Options) {
  const [draft, setDraft] = useState<EditorDraft>(newDraft);
  const [editorError, setEditorError] = useState("");
  const [editorInvalidField, setEditorInvalidField] = useState("");
  const [draftStatus, setDraftStatus] = useState<"saving" | "saved" | "error">(
    "saved",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [editorPage, setEditorPage] = useState(0);
  const [removedDraftCard, setRemovedDraftCard] = useState<{
    card: Flashcard;
    index: number;
  } | null>(null);

  const latestDraftRef = useRef(draft);
  const latestViewRef = useRef(view);
  useEffect(() => { latestDraftRef.current = draft; latestViewRef.current = view; }, [draft, view]);

  useEffect(() => {
    if (!hydrated || view !== "editor") return;
    let cancelled = false;
    const savingTimer = window.setTimeout(() => setDraftStatus("saving"), 0);
    const savedTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const serialized = JSON.stringify(draft);
          if (!validDraftFromStorage(serialized)) {
            throw new Error("invalid_draft");
          }
          await saveBrowserDraft(serialized);
          if (!cancelled) setDraftStatus("saved");
        } catch {
          if (!cancelled) setDraftStatus("error");
        }
      })();
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(savingTimer);
      window.clearTimeout(savedTimer);
    };
  }, [draft, hydrated, view]);

  useEffect(() => {
    if (!hydrated) return;
    function flushDraftWhenHidden() {
      if (document.visibilityState !== "hidden" || latestViewRef.current !== "editor") return;
      const serialized = JSON.stringify(latestDraftRef.current);
      if (validDraftFromStorage(serialized)) void saveBrowserDraft(serialized).catch(() => undefined);
    }
    document.addEventListener("visibilitychange", flushDraftWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushDraftWhenHidden);
  }, [hydrated]);

  async function startNewSet(restoreDraft = true) {
    let storedDraft: EditorDraft | null = null;
    if (restoreDraft) {
      try {
        const candidate = await loadStoredDraft();
        // A draft that belongs to an existing set must never be restored as a
        // new-set draft. It remains available when that set is edited.
        storedDraft = candidate?.setId ? null : candidate;
      } catch {
        setToast({
          message: "保存済みの下書きを読み取れませんでした",
          tone: "warning",
        });
      }
    }
    setDraft(storedDraft ?? newDraft());
    setEditorPage(0);
    setRemovedDraftCard(null);
    setEditorError("");
    setEditorInvalidField("");
    goTo("editor");
    if (storedDraft) {
      setToast({ message: "前回の新規作成下書きを復元しました", tone: "info" });
    }
  }

  async function startImportingSet() {
    await startNewSet(false);
    setImportOpen(true);
  }

  async function editSet(set: StudySet) {
    let restored: EditorDraft | null = null;
    try {
      const candidate = await loadStoredDraft();
      if (candidate?.setId === set.id) restored = candidate;
    } catch {
      // Fall back to the durable set below.
    }
    setDraft(
      restored ?? {
        setId: set.id,
        title: set.title,
        description: set.description,
        cards: set.cards.map((card) => ({ ...card })),
      },
    );
    setActiveSetId(set.id);
    setEditorPage(0);
    setRemovedDraftCard(null);
    setEditorError("");
    setEditorInvalidField("");
    goTo("editor");
    if (restored) {
      setToast({
        message: "このセットの未保存下書きを復元しました",
        tone: "info",
      });
    }
  }

  function updateDraftCard(
    cardIndex: number,
    cardId: string,
    field: "term" | "definition",
    value: string,
  ) {
    const fieldId = "card-" + cardId + "-" + field;
    if (editorInvalidField === fieldId) {
      setEditorInvalidField("");
      setEditorError("");
    }
    setDraft((current) => {
      const card = current.cards[cardIndex];
      if (!card || card.id !== cardId) return current;
      const cards = [...current.cards];
      cards[cardIndex] = { ...card, [field]: value };
      return { ...current, cards };
    });
  }

  function addDraftCard() {
    if (draft.cards.length >= MAX_CARDS_PER_SET) {
      setToast({
        message: "1セットの上限は " + MAX_CARDS_PER_SET + " 枚です",
        tone: "warning",
      });
      return;
    }
    setDraft((current) => {
      const cards = [...current.cards, ...createBlankCards(1)];
      setEditorPage(Math.floor((cards.length - 1) / EDITOR_PAGE_SIZE));
      return { ...current, cards };
    });
  }

  function removeDraftCard(cardId: string) {
    setDraft((current) => {
      const index = current.cards.findIndex((card) => card.id === cardId);
      if (index < 0) return current;
      const removed = current.cards[index];
      const remaining = current.cards.filter((card) => card.id !== cardId);
      setRemovedDraftCard({ card: removed, index });
      const cards = remaining.length > 0 ? remaining : createBlankCards(1);
      setEditorPage(
        Math.min(
          Math.floor(index / EDITOR_PAGE_SIZE),
          Math.max(0, Math.ceil(cards.length / EDITOR_PAGE_SIZE) - 1),
        ),
      );
      return { ...current, cards };
    });
  }

  function undoRemoveDraftCard() {
    const removed = removedDraftCard;
    if (!removed) return;
    setDraft((current) => {
      const cards = [...current.cards];
      const blankOnly = cards.length === 1 && !hasAnyCardContent(cards[0]);
      if (blankOnly) cards.length = 0;
      const index = Math.min(removed.index, cards.length);
      cards.splice(index, 0, removed.card);
      setEditorPage(Math.floor(index / EDITOR_PAGE_SIZE));
      return { ...current, cards };
    });
    setRemovedDraftCard(null);
  }

  function moveDraftCard(index: number, offset: -1 | 1) {
    setDraft((current) => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.cards.length)
        return current;
      const cards = [...current.cards];
      [cards[index], cards[destination]] = [cards[destination], cards[index]];
      setEditorPage(Math.floor(destination / EDITOR_PAGE_SIZE));
      return { ...current, cards };
    });
  }

  function swapDraftCard(cardId: string) {
    setDraft((current) => ({
      ...current,
      cards: current.cards.map((card) =>
        card.id === cardId
          ? { ...card, term: card.definition, definition: card.term }
          : card,
      ),
    }));
  }

  function importCards(cards: Flashcard[]) {
    const existingCount = draft.cards.filter(hasAnyCardContent).length;
    if (existingCount + cards.length > MAX_CARDS_PER_SET) {
      setToast({
        message: "1セットのカード上限を超えるため追加できませんでした",
        tone: "warning",
      });
      return;
    }
    setDraft((current) => {
      const existing = current.cards.filter(hasAnyCardContent);
      const nextCards = [...existing, ...cards];
      setEditorPage(Math.floor(existing.length / EDITOR_PAGE_SIZE));
      return { ...current, cards: nextCards };
    });
    setImportOpen(false);
    setToast({
      message: cards.length + "枚を編集画面へ追加しました",
      tone: "success",
    });
  }

  function showEditorError(message: string, fieldId: string) {
    setEditorError(message);
    setEditorInvalidField(fieldId);
    window.setTimeout(() => {
      window.requestAnimationFrame(() =>
        document.getElementById(fieldId)?.focus(),
      );
    }, 0);
  }

  async function saveDraft(startAfterSave: boolean) {
    if (explicitSaveInProgress) return;
    const prepared = prepareDraftSave(draft, sets);
    if (prepared.status === "invalid") {
      if (prepared.editorPage !== undefined) setEditorPage(prepared.editorPage);
      showEditorError(prepared.message, prepared.fieldId);
      return;
    }
    const { id, nextSets, existing } = prepared;

    let browserBackupWarning = false;
    let folderWarning = false;
    try {
      const result = await persistSetsForExplicitAction(nextSets);
      browserBackupWarning = result.browserBackupWarning;
      folderWarning = result.folderWarning;
    } catch {
      showEditorError(
        "安全な保存先へ書き込めなかったため、変更は確定していません。保存先設定を確認してください。",
        "set-title",
      );
      return;
    }

    setSets(nextSets);
    setActiveSetId(id);
    let draftClearFailed = false;
    try {
      await clearBrowserDraft();
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // The IndexedDB draft has already been removed.
      }
    } catch {
      draftClearFailed = true;
    }
    setEditorError("");
    setEditorInvalidField("");
    setToast({
      message: draftClearFailed
        ? "セットは保存しましたが、下書きを削除できませんでした"
        : folderWarning
          ? "ブラウザーには保存しましたが、フォルダー同期に失敗しました"
          : browserBackupWarning
            ? "セットはフォルダーへ保存しました。ブラウザー予備保存は停止中です"
            : existing
              ? "変更を保存しました"
              : "学習セットを作成しました",
      tone:
        draftClearFailed || browserBackupWarning || folderWarning
          ? "warning"
          : "success",
    });

    if (startAfterSave) {
      onStudyReady();
      goTo("study");
    } else {
      goTo("sets");
    }
  }

  function clearEditorError() { setEditorError(""); setEditorInvalidField(""); }
  function resetDraft() { setDraft(newDraft()); }

  return {
    draft,
    setDraft,
    editorError,
    setEditorError,
    editorInvalidField,
    setEditorInvalidField,
    draftStatus,
    importOpen,
    setImportOpen,
    editorPage,
    setEditorPage,
    removedDraftCard,
    startNewSet,
    startImportingSet,
    editSet,
    updateDraftCard,
    addDraftCard,
    removeDraftCard,
    undoRemoveDraftCard,
    moveDraftCard,
    swapDraftCard,
    importCards,
    saveDraft,
    clearEditorError,
    resetDraft,
  };
}
export type SetEditor = ReturnType<typeof useSetEditor>;
