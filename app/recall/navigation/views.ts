import type { View } from "../types";

const APP_VIEWS: readonly View[] = [
  "home",
  "sets",
  "editor",
  "study",
  "flashcards",
];

export function isView(value: unknown): value is View {
  return typeof value === "string" && APP_VIEWS.includes(value as View);
}
