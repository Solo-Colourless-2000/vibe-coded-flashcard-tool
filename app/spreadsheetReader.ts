export type SpreadsheetSheet = {
  sheet: string;
  data: unknown[][];
};

type SpreadsheetWorkerResponse =
  | { ok: true; sheets: unknown }
  | { ok: false; code: string };

const SPREADSHEET_PARSE_TIMEOUT_MS = 15_000;

function isSpreadsheetSheet(value: unknown): value is SpreadsheetSheet {
  if (!value || typeof value !== "object") return false;
  const sheet = value as Record<string, unknown>;
  return typeof sheet.sheet === "string" && Array.isArray(sheet.data);
}

export function readSpreadsheetInWorker(
  buffer: ArrayBuffer,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<SpreadsheetSheet[]> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("spreadsheet_worker_unavailable"));
  }

  return new Promise<SpreadsheetSheet[]>((resolve, reject) => {
    const worker = new Worker(new URL("./spreadsheetWorker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    const timeoutMs = options.timeoutMs ?? SPREADSHEET_PARSE_TIMEOUT_MS;

    const cleanup = () => {
      globalThis.clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("Import cancelled", "AbortError"));
    const timer = globalThis.setTimeout(
      () => fail(new Error("spreadsheet_parse_timeout")),
      timeoutMs,
    );

    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });

    worker.onerror = () => fail(new Error("spreadsheet_worker_failed"));
    worker.onmessage = (event: MessageEvent<SpreadsheetWorkerResponse>) => {
      if (settled) return;
      if (!event.data?.ok) {
        fail(new Error(event.data?.code ?? "spreadsheet_parse_failed"));
        return;
      }
      if (!Array.isArray(event.data.sheets) || !event.data.sheets.every(isSpreadsheetSheet)) {
        fail(new Error("spreadsheet_invalid_result"));
        return;
      }
      settled = true;
      cleanup();
      resolve(event.data.sheets);
    };

    worker.postMessage({ buffer }, [buffer]);
  });
}
