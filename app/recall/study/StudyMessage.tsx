import { AlertTriangle } from "lucide-react";

export function StudyMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="study-message" role="alert">
      <AlertTriangle size={15} />
      {message}
    </p>
  );
}
