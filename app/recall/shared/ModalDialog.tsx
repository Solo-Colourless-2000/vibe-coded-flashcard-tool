import { useRef } from "react";
import { useModalDialog } from "../../useModalDialog";

import type { ReactNode } from "react";
type Props = {
  labelledBy: string;
  className: string;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
  children: ReactNode;
};
export function ModalDialog({ labelledBy, className, role = "dialog", onClose, children }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalDialog(true, onClose, dialogRef);
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={className}
        ref={dialogRef}
        role={role}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
