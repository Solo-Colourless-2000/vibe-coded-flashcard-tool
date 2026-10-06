import type { ToastNotice } from "../types";
import { AlertTriangle, CircleHelp, CheckCircle2 } from "lucide-react";

type Props = { toast: ToastNotice; onDismiss: () => void };
export function Toast({ toast, onDismiss }: Props) {
  return (
    <div
      aria-atomic="true"
      aria-live={
        toast.tone === "error" || toast.tone === "warning"
          ? "assertive"
          : "polite"
      }
      className={"toast toast-" + toast.tone}
      role={
        toast.tone === "error" || toast.tone === "warning"
          ? "alert"
          : "status"
      }
    >
      {toast.tone === "error" || toast.tone === "warning" ? (
        <AlertTriangle aria-hidden="true" size={17} />
      ) : toast.tone === "info" ? (
        <CircleHelp aria-hidden="true" size={17} />
      ) : (
        <CheckCircle2 aria-hidden="true" size={17} />
      )}
      <span>{toast.message}</span>
      <button
        aria-label="通知を閉じる"
        className="toast-dismiss"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
