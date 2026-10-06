export async function withFolderWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(
      "recall-folder-write-v1",
      { mode: "exclusive" },
      operation,
    );
  }
  return operation();
}
