/// <reference lib="webworker" />

import readXlsxFile from "read-excel-file/web-worker";
import { cellToText, validateImportRows } from "./model.ts";
import {
  MAX_IMPORT_SHEETS,
  MAX_IMPORT_TOTAL_CHARS,
} from "./securityLimits.ts";

type SpreadsheetWorkerRequest = {
  buffer: ArrayBuffer;
};

type SpreadsheetWorkerResponse =
  | { ok: true; sheets: ParsedSpreadsheetSheet[] }
  | { ok: false; code: string };

type ParsedSpreadsheetSheet = {
  sheet: string;
  data: unknown[][];
};

const worker = self as DedicatedWorkerGlobalScope;

function validateParsedSheets(value: unknown): value is ParsedSpreadsheetSheet[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_IMPORT_SHEETS
  ) {
    return false;
  }

  const names = new Set<string>();
  let totalCharacters = 0;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") return false;
    const sheet = candidate as Record<string, unknown>;
    if (
      typeof sheet.sheet !== "string" ||
      sheet.sheet.length === 0 ||
      sheet.sheet.length > 255 ||
      names.has(sheet.sheet) ||
      !Array.isArray(sheet.data) ||
      Boolean(validateImportRows(sheet.data as unknown[][]))
    ) {
      return false;
    }
    names.add(sheet.sheet);
    for (const row of sheet.data as unknown[][]) {
      for (const cell of row) {
        totalCharacters += cellToText(cell).length;
        if (totalCharacters > MAX_IMPORT_TOTAL_CHARS) return false;
      }
    }
  }
  return true;
}

worker.onmessage = async (event: MessageEvent<SpreadsheetWorkerRequest>) => {
  try {
    const sheets: unknown = await readXlsxFile(event.data.buffer);
    if (!validateParsedSheets(sheets)) {
      throw new Error("unsafe_spreadsheet_shape");
    }
    const response: SpreadsheetWorkerResponse = { ok: true, sheets };
    worker.postMessage(response);
  } catch (error) {
    const code =
      error instanceof Error && error.message === "unsafe_spreadsheet_shape"
        ? "unsafe_spreadsheet_shape"
        : error instanceof Error && error.name
        ? `spreadsheet_${error.name.toLowerCase()}`
        : "spreadsheet_parse_failed";
    const response: SpreadsheetWorkerResponse = { ok: false, code };
    worker.postMessage(response);
  }
};

export {};
