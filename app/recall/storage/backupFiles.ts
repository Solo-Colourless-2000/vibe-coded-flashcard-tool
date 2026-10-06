

export function makeBackupDownloadName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  return `recall-backup-${stamp}.json`;
}

export function readBackupFileText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const timer = window.setTimeout(() => {
      reader.abort();
      reject(new Error("backup_read_timeout"));
    }, 15_000);
    const finish = () => window.clearTimeout(timer);
    reader.onerror = () => {
      finish();
      reject(reader.error ?? new Error("backup_read_failed"));
    };
    reader.onabort = () => {
      finish();
      reject(new Error("backup_read_aborted"));
    };
    reader.onload = () => {
      finish();
      if (typeof reader.result !== "string") {
        reject(new Error("backup_read_invalid_result"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsText(file, "utf-8");
  });
}

