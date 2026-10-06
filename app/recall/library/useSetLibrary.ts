import type { StudySet } from "../../model";
import type { SetState, View, Notify } from "../types";
import type { StudyStorage } from "../storage/useStudyStorage";
import { useState, useMemo } from "react";

type Options = {
  sets: StudySet[];
  setSets: SetState<StudySet[]>;
  activeSetId: string;
  setActiveSetId: SetState<string>;
  explicitSaveInProgress: boolean;
  persistDeletion: StudyStorage["persistDeletion"];
  goTo: (view: View) => void;
  setToast: Notify;
};
export function useSetLibrary({
  sets,
  setSets,
  activeSetId,
  setActiveSetId,
  explicitSaveInProgress,
  persistDeletion,
  goTo,
  setToast,
}: Options) {
  const [search, setSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<StudySet | null>(null);

  const totalCards = sets.reduce((total, set) => total + set.cards.length, 0);
  const averageScore = (() => {
    const studied = sets.filter((set) => typeof set.lastScore === "number");
    if (studied.length === 0) return 0;
    return Math.round(
      studied.reduce((total, set) => total + (set.lastScore ?? 0), 0) /
      studied.length,
    );
  })();

  const filteredSets = useMemo(() => {
    const normalizeForSearch = (value: string) =>
      value.normalize("NFC").toLocaleLowerCase("ja");
    const query = normalizeForSearch(search.trim());
    if (!query) return sets;
    return sets.filter(
      (set) =>
        normalizeForSearch(set.title).includes(query) ||
        normalizeForSearch(set.description).includes(query) ||
        set.cards.some(
          (card) =>
            normalizeForSearch(card.term).includes(query) ||
            normalizeForSearch(card.definition).includes(query),
        ),
    );
  }, [sets, search]);

  async function confirmDelete() {
    if (!deleteTarget || explicitSaveInProgress) return;
    const id = deleteTarget.id;
    const remaining = sets.filter((set) => set.id !== id);
    try {
      const result = await persistDeletion(remaining, id);
      setSets(remaining);
      if (activeSetId === id) setActiveSetId(remaining[0]?.id ?? "");
      setDeleteTarget(null);
      setToast({
        message: result.folderWarning
          ? "学習セットはブラウザーから削除しましたが、フォルダー同期に失敗しました"
          : result.browserBackupWarning
            ? "学習セットを削除しました。ブラウザー予備保存は停止中です"
            : "学習セットを削除しました",
        tone:
          result.browserBackupWarning || result.folderWarning
            ? "warning"
            : "success",
      });
      if (remaining.length === 0) goTo("home");
    } catch {
      setToast({
        message: "安全な保存先へ反映できなかったため、削除を取り消しました",
        tone: "error",
      });
    }
  }

  return {
    sets,
    search,
    setSearch,
    totalCards,
    averageScore,
    filteredSets,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
  };
}
export type SetLibrary = ReturnType<typeof useSetLibrary>;
