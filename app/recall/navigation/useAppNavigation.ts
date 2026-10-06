import { isView } from "./views";
import { useState, useEffect } from "react";
import type { View } from "../types";

export function useAppNavigation(hydrated: boolean, onNavigate: (fromHistory: boolean) => void) {
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "home";
    const hashView = window.location.hash.slice(1);
    return isView(hashView) && hashView !== "editor" ? hashView : "home";
  });

  useEffect(() => {
    if (!hydrated) return;
    const initialView = view;
    window.history.replaceState(
      { recallView: initialView },
      "",
      window.location.pathname + window.location.search + `#${initialView}`,
    );

    function handlePopState(event: PopStateEvent) {
      const stateView =
        event.state &&
          typeof event.state === "object" &&
          "recallView" in event.state
          ? (event.state as { recallView?: unknown }).recallView
          : window.location.hash.slice(1);
      if (!isView(stateView)) return;
      onNavigate(true);
      setView(stateView);
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // The initial view is captured when hydration completes; later navigation
    // is driven by goTo() and browser popstate events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function goTo(nextView: View) {
    setView(nextView);
    onNavigate(false);
    if (typeof window !== "undefined") {
      const nextHash = `#${nextView}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(
          { recallView: nextView },
          "",
          window.location.pathname + window.location.search + nextHash,
        );
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function openHome() {
    goTo("home");
  }

  function openSets() {
    goTo("sets");
  }

  return { view, goTo, openHome, openSets };
}
