import { useState, useEffect } from "react";
import type { ToastNotice } from "../types";

export function useNotifications() {
  const [toast, setToast] = useState<ToastNotice | null>(null);

  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const duration =
      toast.tone === "success" ? 3_200 : toast.tone === "info" ? 6_000 : 12_000;
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return { toast, setToast };
}
