import { type StudySet, isStudyProgressResumable, type Flashcard } from "../../model.ts";

export function shuffleIds(ids: string[]): string[] {
  const next = [...ids];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function formatRelativeDate(value?: string): string {
  if (!value) return "未学習";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未学習";

  const now = new Date();
  const todayDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDifference = Math.round((todayDay - targetDay) / 86_400_000);
  if (dayDifference < 0) return "未来日時";
  if (dayDifference === 0) return "今日";
  if (dayDifference === 1) return "昨日";
  if (dayDifference < 30) return dayDifference + "日前";
  return new Intl.DateTimeFormat("ja-JP", {
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function studyActivityTimestamp(set?: StudySet): number {
  if (!set) return 0;
  return Math.max(
    timestamp(set.lastStudiedAt),
    timestamp(set.studyProgress?.updatedAt),
  );
}

export function hasResumableProgress(set?: StudySet): boolean {
  return Boolean(
    set &&
    isStudyProgressResumable(
      set.studyProgress,
      set.cards.map((card) => card.id),
    ),
  );
}

export function cardContentMatches(left: Flashcard[], right: Flashcard[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((card) => [card.id, card]));
  return left.every((card) => {
    const match = rightById.get(card.id);
    return (
      match !== undefined &&
      card.term === match.term &&
      card.definition === match.definition
    );
  });
}
