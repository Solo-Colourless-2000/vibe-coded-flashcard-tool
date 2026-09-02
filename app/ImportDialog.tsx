"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Papa from "papaparse";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Upload,
  X,
} from "lucide-react";
import {
  analyzeRows,
  Flashcard,
  flashcardPairKey,
  hasCompleteCardPair,
  ImportAnalysis,
  parseLiteralRows,
  validateImportRows,
} from "./model";
import {
  inspectSpreadsheetArchive,
  MAX_CARDS_PER_SET,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_SHEETS,
  MAX_IMPORT_TEXT_CHARS,
  MAX_SEPARATOR_LENGTH,
  preflightDelimitedText,
} from "./securityLimits";
import { readSpreadsheetInWorker } from "./spreadsheetReader";
import { useModalDialog } from "./useModalDialog";

type SeparatorChoice = "tab" | "comma" | "custom";
type CardSeparatorChoice = "newline" | "semicolon" | "custom";
type SourceMode = "paste" | "file";
type TextEncoding = "auto" | "utf-8" | "shift_jis" | "utf-16le" | "utf-16be";

type SheetInfo = {
  sheet: string;
  data: unknown[][];
};

type ImportDialogProps = {
  existingCards?: Flashcard[];
  open: boolean;
  onClose: () => void;
  onImport: (cards: Flashcard[]) => void;
};

function getFieldSeparator(choice: SeparatorChoice, custom: string): string {
  if (choice === "tab") return "\t";
  if (choice === "comma") return ",";
  return custom;
}

function getCardSeparator(choice: CardSeparatorChoice, custom: string): string {
  if (choice === "newline") return "\n";
  if (choice === "semicolon") return ";";
  return custom;
}

function parseTextRows(
  text: string,
  fieldChoice: SeparatorChoice,
  fieldCustom: string,
  cardChoice: CardSeparatorChoice,
  cardCustom: string,
): { rows: unknown[][]; parseErrors: number; fatalError?: string } {
  const fieldSeparator = getFieldSeparator(fieldChoice, fieldCustom);
  const cardSeparator = getCardSeparator(cardChoice, cardCustom);
  if (!fieldSeparator || !cardSeparator) return { rows: [], parseErrors: 0 };
  if (
    fieldSeparator.length > MAX_SEPARATOR_LENGTH ||
    cardSeparator.length > MAX_SEPARATOR_LENGTH
  ) {
    return {
      rows: [],
      parseErrors: 0,
      fatalError:
        "区切り文字は" + MAX_SEPARATOR_LENGTH + "文字以内にしてください。",
    };
  }
  if (text.length > MAX_IMPORT_TEXT_CHARS) {
    return {
      rows: [],
      parseErrors: 0,
      fatalError: "貼り付けテキストのサイズが上限を超えています。",
    };
  }

  const rows = parseLiteralRows(text, fieldSeparator, cardSeparator);
  return {
    rows,
    parseErrors: 0,
    fatalError: validateImportRows(rows),
  };
}

function looksLikeHeader(
  rows: unknown[][],
  termColumn: number,
  definitionColumn: number,
): boolean {
  if (!rows[0]) return false;
  const term = String(rows[0][termColumn] ?? "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("ja");
  const definition = String(rows[0][definitionColumn] ?? "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("ja");
  const termLabels = ["term", "用語", "answer", "正解", "解答", "front"];
  const definitionLabels = ["definition", "定義", "question", "問題", "back"];
  return termLabels.includes(term) && definitionLabels.includes(definition);
}

function columnName(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return "列 " + label;
}

function ColumnOptions({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <option key={index} value={index}>
      {columnName(index)}
    </option>
  ));
}

const IMPORT_JOB_TIMEOUT_MS = 20_000;

const emptyAnalysis: ImportAnalysis = {
  cards: [],
  issues: [],
  duplicateCount: 0,
  emptyCount: 0,
};

export default function ImportDialog({
  existingCards = [],
  open,
  onClose,
  onImport,
}: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const fileRequestIdRef = useRef(0);
  const fileAbortRef = useRef<AbortController | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("paste");
  const [pasteText, setPasteText] = useState("");
  const [fieldChoice, setFieldChoice] = useState<SeparatorChoice>("tab");
  const [fieldCustom, setFieldCustom] = useState("-");
  const [cardChoice, setCardChoice] = useState<CardSeparatorChoice>("newline");
  const [cardCustom, setCardCustom] = useState("||");
  const [pasteHeader, setPasteHeader] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState("");
  const [fileExtension, setFileExtension] = useState("");
  const [excelSheets, setExcelSheets] = useState<SheetInfo[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [termColumn, setTermColumn] = useState(0);
  const [definitionColumn, setDefinitionColumn] = useState(1);
  const [fileHeaderOverride, setFileHeaderOverride] = useState<boolean | null>(
    null,
  );
  const [encoding, setEncoding] = useState<TextEncoding>("auto");
  const [skipExactDuplicates, setSkipExactDuplicates] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);

  const separatorIncomplete =
    (fieldChoice === "custom" && fieldCustom.length === 0) ||
    (cardChoice === "custom" && cardCustom.length === 0) ||
    fieldCustom.length > MAX_SEPARATOR_LENGTH ||
    cardCustom.length > MAX_SEPARATOR_LENGTH;
  const activeFieldSeparator = getFieldSeparator(fieldChoice, fieldCustom);
  const activeCardSeparator = getCardSeparator(cardChoice, cardCustom);
  const separatorConflict =
    activeFieldSeparator.length > 0 &&
    activeCardSeparator.length > 0 &&
    (activeFieldSeparator === activeCardSeparator ||
      activeFieldSeparator.startsWith(activeCardSeparator) ||
      activeCardSeparator.startsWith(activeFieldSeparator));
  const fileSeparatorIncomplete =
    Boolean(selectedFile) && fileExtension === "txt" && separatorIncomplete;
  const activeSeparatorIncomplete =
    sourceMode === "paste" ? separatorIncomplete : fileSeparatorIncomplete;
  const activeSeparatorInvalid =
    activeSeparatorIncomplete ||
    ((sourceMode === "paste" || fileExtension === "txt") && separatorConflict);

  const pasteParsed = useMemo(
    () =>
      parseTextRows(
        pasteText,
        fieldChoice,
        fieldCustom,
        cardChoice,
        cardCustom,
      ),
    [pasteText, fieldChoice, fieldCustom, cardChoice, cardCustom],
  );

  const pasteAnalysis = useMemo(
    () =>
      separatorIncomplete || pasteParsed.fatalError
        ? emptyAnalysis
        : analyzeRows(pasteParsed.rows, pasteHeader),
    [
      pasteParsed.fatalError,
      pasteParsed.rows,
      pasteHeader,
      separatorIncomplete,
    ],
  );

  const activeSheet = useMemo(
    () => excelSheets.find((sheet) => sheet.sheet === sheetName),
    [excelSheets, sheetName],
  );

  const textFileParsed = useMemo(() => {
    if (!fileText) return { rows: [] as unknown[][], parseErrors: 0 };
    if (fileText.length > MAX_IMPORT_TEXT_CHARS) {
      return {
        rows: [] as unknown[][],
        parseErrors: 0,
        fatalError: "ファイルの文字数が上限を超えています。",
      };
    }
    const delimitedFileSeparator =
      fileExtension === "csv" ? "," : fileExtension === "tsv" ? "\t" : null;
    if (delimitedFileSeparator !== null) {
      const preflightError = preflightDelimitedText(
        fileText,
        delimitedFileSeparator,
      );
      if (preflightError) {
        return {
          rows: [] as unknown[][],
          parseErrors: 0,
          fatalError: preflightError,
        };
      }
      const parsed = Papa.parse<string[]>(fileText, {
        delimiter: delimitedFileSeparator,
        skipEmptyLines: false,
      });
      return {
        rows: parsed.data,
        parseErrors: parsed.errors.length,
        parseMessages: parsed.errors.slice(0, 5).map((error) =>
          `${typeof error.row === "number" ? `行 ${error.row + 1}: ` : ""}${error.message}`,
        ),
        fatalError: validateImportRows(parsed.data),
      };
    }
    return parseTextRows(
      fileText,
      fieldChoice,
      fieldCustom,
      cardChoice,
      cardCustom,
    );
  }, [
    fileText,
    fileExtension,
    fieldChoice,
    fieldCustom,
    cardChoice,
    cardCustom,
  ]);

  const rawFileRows = useMemo(
    () => activeSheet?.data ?? textFileParsed.rows,
    [activeSheet, textFileParsed.rows],
  );
  const rawFileValidationError = useMemo(
    () => validateImportRows(rawFileRows),
    [rawFileRows],
  );

  const fileRows = useMemo(
    () =>
      rawFileValidationError
        ? []
        : rawFileRows.map((row) => [
            row[termColumn],
            row[definitionColumn],
          ]),
    [
      rawFileRows,
      rawFileValidationError,
      termColumn,
      definitionColumn,
    ],
  );

  const detectedFileHeader = useMemo(
    () => looksLikeHeader(rawFileRows, termColumn, definitionColumn),
    [rawFileRows, termColumn, definitionColumn],
  );
  const fileHeader = fileHeaderOverride ?? detectedFileHeader;

  const fileAnalysis = useMemo(
    () =>
      rawFileValidationError
        ? { ...emptyAnalysis, fatalError: rawFileValidationError }
        : selectedFile && !fileSeparatorIncomplete
        ? analyzeRows(fileRows, fileHeader)
        : emptyAnalysis,
    [
      selectedFile,
      fileSeparatorIncomplete,
      fileRows,
      fileHeader,
      rawFileValidationError,
    ],
  );

  const analysis = sourceMode === "paste" ? pasteAnalysis : fileAnalysis;
  const parseErrorCount =
    sourceMode === "paste"
      ? pasteParsed.parseErrors
      : textFileParsed.parseErrors;
  const parseMessages =
    sourceMode === "file" && "parseMessages" in textFileParsed
      ? (textFileParsed.parseMessages ?? [])
      : [];
  const fatalError =
    analysis.fatalError ??
    (sourceMode === "paste"
      ? pasteParsed.fatalError
      : textFileParsed.fatalError);

  const maxColumns = useMemo(
    () =>
      Math.min(
        MAX_IMPORT_COLUMNS,
        rawFileRows.reduce((maximum, row) => Math.max(maximum, row.length), 2),
      ),
    [rawFileRows],
  );

  const completeExistingCards = useMemo(
    () => existingCards.filter(hasCompleteCardPair),
    [existingCards],
  );

  const existingDuplicateCount = useMemo(() => {
    const existing = new Set(
      completeExistingCards.map((card) =>
        flashcardPairKey(card.term, card.definition),
      ),
    );
    return analysis.cards.filter((card) =>
      existing.has(flashcardPairKey(card.term, card.definition)),
    ).length;
  }, [analysis.cards, completeExistingCards]);
  const cardsForImport = useMemo(() => {
    if (!skipExactDuplicates) return analysis.cards;
    const seen = new Set(
      completeExistingCards.map((card) =>
        flashcardPairKey(card.term, card.definition),
      ),
    );
    return analysis.cards.filter((card) => {
      const key = flashcardPairKey(card.term, card.definition);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [analysis.cards, completeExistingCards, skipExactDuplicates]);
  const skippedDuplicateCount = analysis.cards.length - cardsForImport.length;

  const suspiciousInvisibleCount = useMemo(
    () =>
      analysis.cards.filter((card) =>
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/u.test(
          card.term + card.definition,
        ),
      ).length,
    [analysis.cards],
  );

  const remainingCardCapacity = Math.max(
    0,
    MAX_CARDS_PER_SET - completeExistingCards.length,
  );
  const exceedsSetCapacity = cardsForImport.length > remainingCardCapacity;

  function cancelFileWork() {
    fileRequestIdRef.current += 1;
    fileAbortRef.current?.abort();
    fileAbortRef.current = null;
  }

  useEffect(() => {
    if (!open) cancelFileWork();
    return () => cancelFileWork();
  }, [open]);

  useModalDialog(open, onClose, dialogRef);

  function readFileBuffer(file: File, signal: AbortSignal): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      const abort = () => reader.abort();
      signal.addEventListener("abort", abort, { once: true });
      reader.onerror = () => {
        signal.removeEventListener("abort", abort);
        reject(reader.error ?? new Error("file_read_failed"));
      };
      reader.onabort = () => {
        signal.removeEventListener("abort", abort);
        reject(new DOMException("Import cancelled", "AbortError"));
      };
      reader.onload = () => {
        signal.removeEventListener("abort", abort);
        if (!(reader.result instanceof ArrayBuffer)) {
          reject(new Error("file_read_invalid_result"));
          return;
        }
        resolve(reader.result);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  async function readTextFile(
    file: File,
    nextEncoding: TextEncoding,
    signal: AbortSignal,
  ) {
    const buffer = await readFileBuffer(file, signal);
    const bytes = new Uint8Array(buffer);
    const decode = (label: Exclude<TextEncoding, "auto">) =>
      new TextDecoder(label, { fatal: true }).decode(buffer);

    let text: string;
    if (nextEncoding !== "auto") {
      text = decode(nextEncoding);
    } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      text = decode("utf-8");
    } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      text = decode("utf-16le");
    } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      text = decode("utf-16be");
    } else {
      try {
        text = decode("utf-8");
      } catch {
        text = decode("shift_jis");
      }
    }

    if (text.length > MAX_IMPORT_TEXT_CHARS) {
      throw new Error("text_file_too_large");
    }
    return text;
  }

  async function processFile(file: File, nextEncoding = encoding) {
    cancelFileWork();
    const requestId = fileRequestIdRef.current + 1;
    fileRequestIdRef.current = requestId;
    const controller = new AbortController();
    fileAbortRef.current = controller;
    let timedOut = false;
    const importTimeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IMPORT_JOB_TIMEOUT_MS);
    const extension = file.name.split(".").pop()?.toLocaleLowerCase("en") ?? "";
    const supported = ["xlsx", "xlsm", "csv", "tsv", "txt"];
    setFileError("");

    if (!supported.includes(extension)) {
      window.clearTimeout(importTimeout);
      if (fileAbortRef.current === controller) fileAbortRef.current = null;
      setFileError("対応形式は .xlsx / .xlsm / .csv / .tsv / .txt です。");
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      window.clearTimeout(importTimeout);
      if (fileAbortRef.current === controller) fileAbortRef.current = null;
      setFileError(
        "ファイルサイズは" +
          Math.floor(MAX_IMPORT_FILE_BYTES / 1024 / 1024) +
          " MiB以下にしてください。",
      );
      return;
    }

    setSelectedFile(file);
    setFileExtension(extension);
    setFileText("");
    setExcelSheets([]);
    setSheetName("");
    setTermColumn(0);
    setDefinitionColumn(1);
    setFileHeaderOverride(null);
    setLoading(true);
    try {
      if (extension === "xlsx" || extension === "xlsm") {
        const buffer = await readFileBuffer(file, controller.signal);
        if (requestId !== fileRequestIdRef.current) return;
        const inspection = inspectSpreadsheetArchive(buffer);
        if (!inspection.ok) throw new Error("unsafe_spreadsheet_archive");

        const sheets = await readSpreadsheetInWorker(buffer, {
          signal: controller.signal,
        });
        if (requestId !== fileRequestIdRef.current) return;
        const names = new Set<string>();
        if (
          sheets.length === 0 ||
          sheets.length > MAX_IMPORT_SHEETS ||
          !sheets.every((sheet) => {
            if (
              !sheet ||
              typeof sheet.sheet !== "string" ||
              sheet.sheet.length === 0 ||
              sheet.sheet.length > 255 ||
              names.has(sheet.sheet) ||
              !Array.isArray(sheet.data) ||
              Boolean(validateImportRows(sheet.data))
            ) {
              return false;
            }
            names.add(sheet.sheet);
            return true;
          })
        ) {
          throw new Error("unsafe_spreadsheet_shape");
        }
        setExcelSheets(sheets);
        setSheetName(sheets[0].sheet);
      } else {
        const text = await readTextFile(file, nextEncoding, controller.signal);
        if (requestId !== fileRequestIdRef.current) return;
        setFileText(text);
      }
    } catch (error) {
      if (requestId !== fileRequestIdRef.current) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        if (timedOut) {
          setFileError("ファイル処理が安全な時間上限を超えたため中断しました。");
        }
        return;
      }
      setFileError(
        error instanceof Error && error.message === "spreadsheet_parse_timeout"
          ? "Excelファイルの解析が安全な時間上限を超えたため中断しました。"
          : "ファイルを安全に読み取れませんでした。形式・サイズ・内容を確認してください。",
      );
    } finally {
      window.clearTimeout(importTimeout);
      if (requestId === fileRequestIdRef.current) {
        setLoading(false);
        if (fileAbortRef.current === controller) fileAbortRef.current = null;
      }
    }
  }
  async function handleEncodingChange(nextEncoding: TextEncoding) {
    setEncoding(nextEncoding);
    if (selectedFile && ["csv", "tsv", "txt"].includes(fileExtension)) {
      cancelFileWork();
      const requestId = fileRequestIdRef.current + 1;
      fileRequestIdRef.current = requestId;
      const controller = new AbortController();
      fileAbortRef.current = controller;
      let timedOut = false;
      const importTimeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, IMPORT_JOB_TIMEOUT_MS);
      setLoading(true);
      setFileError("");
      try {
        const text = await readTextFile(selectedFile, nextEncoding, controller.signal);
        if (requestId !== fileRequestIdRef.current) return;
        setFileText(text);
      } catch (error) {
        if (requestId !== fileRequestIdRef.current) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          if (timedOut) {
            setFileError("ファイル処理が安全な時間上限を超えたため中断しました。");
          }
          return;
        }
        setFileError("指定した文字コードでは読み取れませんでした。");
      } finally {
        window.clearTimeout(importTimeout);
        if (requestId === fileRequestIdRef.current) {
          setLoading(false);
          if (fileAbortRef.current === controller) fileAbortRef.current = null;
        }
      }
    }
  }
  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 1) {
      setFileError("一度に選択できるファイルは1件です。");
      return;
    }
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function finishImport() {
    if (
      cardsForImport.length === 0 ||
      fatalError ||
      parseErrorCount > 0 ||
      exceedsSetCapacity ||
      activeSeparatorInvalid ||
      (sourceMode === "file" && Boolean(selectedFile) && termColumn === definitionColumn)
    ) {
      return;
    }
    onImport(cardsForImport);
  }

  if (!open) return null;

  const excelFile = fileExtension === "xlsx" || fileExtension === "xlsm";

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="import-title"
        aria-modal="true"
        className="import-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="dialog-header">
          <div>
            <span className="eyebrow">IMPORT</span>
            <h2 id="import-title">フラッシュカードをインポート</h2>
            <p>内容は外部へ送信されず、このブラウザー内だけで処理されます。</p>
          </div>
          <button
            aria-label="インポートを閉じる"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </header>

        <div className="source-tabs" role="group" aria-label="インポート方法">
          <button
            aria-pressed={sourceMode === "paste"}
            className={sourceMode === "paste" ? "active" : ""}
            onClick={() => setSourceMode("paste")}
            type="button"
          >
            <FileText size={17} />
            テキストを貼り付け
          </button>
          <button
            aria-pressed={sourceMode === "file"}
            className={sourceMode === "file" ? "active" : ""}
            onClick={() => setSourceMode("file")}
            type="button"
          >
            <FileSpreadsheet size={17} />
            ファイルを選ぶ
          </button>
        </div>

        <div className="dialog-body">
          <div className="import-source">
            {sourceMode === "paste" ? (
              <>
                <label className="field-label" htmlFor="import-text">
                  1行に1枚のカードを貼り付け
                </label>
                <textarea
                  autoFocus
                  className="import-textarea"
                  data-dialog-initial
                  id="import-text"
                  maxLength={MAX_IMPORT_TEXT_CHARS}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={
                    "TLS\t通信を暗号化するプロトコル\nMFA\t複数要素を使う認証"
                  }
                  spellCheck={false}
                  value={pasteText}
                />
              </>
            ) : (
              <>
                <input
                  accept=".xlsx,.xlsm,.csv,.tsv,.txt"
                  aria-label="インポートするファイル"
                  className="visually-hidden"
                  id="import-file-input"
                  onChange={handleFileInput}
                  ref={inputRef}
                  tabIndex={-1}
                  type="file"
                />
                <div
                  className={"drop-zone" + (dragging ? " dragging" : "")}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                >
                  <Upload size={25} />
                  <strong>
                    {selectedFile ? selectedFile.name : "ファイルをドロップ"}
                  </strong>
                  <p>.xlsx / .xlsm / .csv / .tsv / .txt</p>
                  <button
                    className="secondary-button"
                    onClick={() => inputRef.current?.click()}
                    type="button"
                  >
                    ファイルを選択
                  </button>
                </div>
                {fileError && (
                  <p className="inline-error" role="alert">
                    <AlertTriangle size={15} />
                    {fileError}
                  </p>
                )}
              </>
            )}

            {(sourceMode === "paste" ||
              (sourceMode === "file" &&
                (fileExtension === "txt" || !selectedFile))) && (
              <div className="separator-grid">
                <fieldset>
                  <legend>正解と問題の間</legend>
                  <label>
                    <input
                      checked={fieldChoice === "tab"}
                      name="field-separator"
                      onChange={() => setFieldChoice("tab")}
                      type="radio"
                    />
                    タブ
                  </label>
                  <label>
                    <input
                      checked={fieldChoice === "comma"}
                      name="field-separator"
                      onChange={() => setFieldChoice("comma")}
                      type="radio"
                    />
                    カンマ
                  </label>
                  <label>
                    <input
                      checked={fieldChoice === "custom"}
                      name="field-separator"
                      onChange={() => setFieldChoice("custom")}
                      type="radio"
                    />
                    任意
                  </label>
                  {fieldChoice === "custom" && (
                    <input
                      aria-label="正解と問題の任意区切り文字"
                      className="mini-input"
                      maxLength={MAX_SEPARATOR_LENGTH}
                      onChange={(event) => setFieldCustom(event.target.value)}
                      type="text"
                      value={fieldCustom}
                    />
                  )}
                </fieldset>
                <fieldset>
                  <legend>カードの間</legend>
                  <label>
                    <input
                      checked={cardChoice === "newline"}
                      name="card-separator"
                      onChange={() => setCardChoice("newline")}
                      type="radio"
                    />
                    改行
                  </label>
                  <label>
                    <input
                      checked={cardChoice === "semicolon"}
                      name="card-separator"
                      onChange={() => setCardChoice("semicolon")}
                      type="radio"
                    />
                    セミコロン
                  </label>
                  <label>
                    <input
                      checked={cardChoice === "custom"}
                      name="card-separator"
                      onChange={() => setCardChoice("custom")}
                      type="radio"
                    />
                    任意
                  </label>
                  {cardChoice === "custom" && (
                    <input
                      aria-label="カード間の任意区切り文字"
                      className="mini-input"
                      maxLength={MAX_SEPARATOR_LENGTH}
                      onChange={(event) => setCardCustom(event.target.value)}
                      type="text"
                      value={cardCustom}
                    />
                  )}
                </fieldset>
              </div>
            )}

            {sourceMode === "file" && selectedFile && (
              <div className="file-options">
                {!excelFile && (
                  <label>
                    <span>文字コード</span>
                    <select
                      onChange={(event) =>
                        void handleEncodingChange(
                          event.target.value as TextEncoding,
                        )
                      }
                      value={encoding}
                    >
                      <option value="auto">自動判定（UTF-8 / UTF-16 / Shift_JIS）</option>
                      <option value="utf-8">UTF-8</option>
                      <option value="shift_jis">Shift_JIS</option>
                      <option value="utf-16le">UTF-16 LE</option>
                      <option value="utf-16be">UTF-16 BE</option>
                    </select>
                  </label>
                )}
                {excelFile && excelSheets.length > 1 && (
                  <label>
                    <span>シート</span>
                    <select
                      onChange={(event) => {
                        setSheetName(event.target.value);
                        setTermColumn(0);
                        setDefinitionColumn(1);
                        setFileHeaderOverride(null);
                      }}
                      value={sheetName}
                    >
                      {excelSheets.map((sheet) => (
                        <option key={sheet.sheet} value={sheet.sheet}>
                          {sheet.sheet}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span>正解／用語の列</span>
                  <select
                    onChange={(event) => {
                      setTermColumn(Number(event.target.value));
                      setFileHeaderOverride(null);
                    }}
                    value={termColumn}
                  >
                    <ColumnOptions count={maxColumns} />
                  </select>
                </label>
                <label>
                  <span>問題／定義の列</span>
                  <select
                    onChange={(event) => {
                      setDefinitionColumn(Number(event.target.value));
                      setFileHeaderOverride(null);
                    }}
                    value={definitionColumn}
                  >
                    <ColumnOptions count={maxColumns} />
                  </select>
                </label>
              </div>
            )}

            {(sourceMode === "paste" || selectedFile) && (
              <label className="check-row">
                <input
                  checked={sourceMode === "paste" ? pasteHeader : fileHeader}
                  onChange={(event) =>
                    sourceMode === "paste"
                      ? setPasteHeader(event.target.checked)
                      : setFileHeaderOverride(event.target.checked)
                  }
                  type="checkbox"
                />
                先頭行を見出しとして除外
              </label>
            )}

            <p className="plain-text-note">
              {sourceMode === "file" &&
              (fileExtension === "csv" || fileExtension === "tsv")
                ? "CSV / TSV の引用符は標準の区切り構文として解釈します。引用符自体を残す場合は二重引用符を2つ重ねてください。"
                : sourceMode === "file" && excelFile
                  ? "文字・記号は通常のテキストとして取り込みます。Excelの日付・時刻セルはISO形式でプレビューします。"
                  : "大文字・小文字、記号、括弧、引用符は変換せず、通常の文字列として取り込みます。"}
            </p>
          </div>

          <aside className="import-preview">
            <p
              aria-atomic="true"
              aria-live="polite"
              className="visually-hidden"
            >
              {loading
                ? "ファイルを読み取っています"
                : analysis.cards.length +
                  "枚を認識、警告" +
                  (analysis.issues.length +
                    analysis.duplicateCount +
                    existingDuplicateCount +
                    parseErrorCount) +
                  "件"}
            </p>
            <div className="preview-heading">
              <div>
                <span className="eyebrow">PREVIEW</span>
                <h3>{analysis.cards.length} 枚</h3>
              </div>
              {analysis.cards.length > 0 && (
                <CheckCircle2
                  aria-label="読み取り成功"
                  className="success-icon"
                  size={21}
                />
              )}
            </div>

            {loading ? (
              <p className="preview-empty">ファイルを読み取っています…</p>
            ) : analysis.cards.length === 0 ? (
              <p className="preview-empty">
                まだプレビューできるカードがありません。
              </p>
            ) : (
              <div className="preview-table-wrap">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>正解／用語</th>
                      <th>問題／定義</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.cards.slice(0, 8).map((card) => (
                      <tr key={card.id}>
                        <td>{card.term}</td>
                        <td>{card.definition}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analysis.cards.length > 8 && (
                  <p>ほか {analysis.cards.length - 8} 枚</p>
                )}
              </div>
            )}

            <div className="import-warnings">
              {fatalError && (
                <p role="alert">
                  <AlertTriangle size={14} />
                  {fatalError}
                </p>
              )}
              {parseErrorCount > 0 && (
                <p>
                  <AlertTriangle size={14} />
                  区切りの解析警告が {parseErrorCount} 件あります
                </p>
              )}
              {parseMessages.map((message) => (
                <p key={message}>
                  <AlertTriangle size={14} />
                  {message}
                </p>
              ))}
              {parseErrorCount > parseMessages.length && parseMessages.length > 0 && (
                <p>ほか {parseErrorCount - parseMessages.length} 件の解析警告があります</p>
              )}
              {analysis.issues.slice(0, 5).map((issue) => (
                <p key={issue.row + "-" + issue.message}>
                  <AlertTriangle size={14} />行 {issue.row}: {issue.message}
                </p>
              ))}
              {analysis.issues.length > 5 && (
                <p>ほか {analysis.issues.length - 5} 行に確認事項があります</p>
              )}
              {analysis.duplicateCount > 0 && (
                <p>
                  <AlertTriangle size={14} />
                  取込データ内の完全一致が {analysis.duplicateCount} 枚あります
                </p>
              )}
              {existingDuplicateCount > 0 && (
                <p>
                  <AlertTriangle size={14} />
                  編集中カードとの完全一致が {existingDuplicateCount} 枚あります
                </p>
              )}
              {(analysis.duplicateCount > 0 || existingDuplicateCount > 0) && (
                <label className="check-row import-dedupe-option">
                  <input
                    checked={skipExactDuplicates}
                    onChange={(event) => setSkipExactDuplicates(event.target.checked)}
                    type="checkbox"
                  />
                  完全一致の重複を除外する
                  {skipExactDuplicates && skippedDuplicateCount > 0
                    ? `（${skippedDuplicateCount} 枚を除外）`
                    : ""}
                </label>
              )}
              {suspiciousInvisibleCount > 0 && (
                <p>
                  <AlertTriangle size={14} />
                  不可視・制御文字を含むカードが {suspiciousInvisibleCount} 枚あります。厳密一致では別文字として扱われます
                </p>
              )}
              {analysis.emptyCount > 0 && (
                <p>空行 {analysis.emptyCount} 件は除外されます</p>
              )}
              {exceedsSetCapacity && (
                <p role="alert">
                  <AlertTriangle size={14} />
                  1セットの上限は {MAX_CARDS_PER_SET} 枚です。追加できるのは
                  あと {remainingCardCapacity} 枚です
                </p>
              )}
              {activeSeparatorIncomplete && (
                <p>
                  <AlertTriangle size={14} />
                  任意の区切り文字を入力してください
                </p>
              )}
              {!activeSeparatorIncomplete && separatorConflict &&
                (sourceMode === "paste" || fileExtension === "txt") && (
                  <p role="alert">
                    <AlertTriangle size={14} />
                    2種類の区切り文字が同一または包含関係にあるため、別の文字列を指定してください
                  </p>
                )}
              {termColumn === definitionColumn &&
                sourceMode === "file" &&
                selectedFile && (
                  <p>
                    <AlertTriangle size={14} />
                    正解と問題には別の列を選んでください
                  </p>
                )}
            </div>
          </aside>
        </div>

        <footer className="dialog-footer">
          <button className="text-button" onClick={onClose} type="button">
            キャンセル
          </button>
          <button
            className="primary-button"
            disabled={
              loading ||
              cardsForImport.length === 0 ||
              Boolean(fatalError) ||
              parseErrorCount > 0 ||
              exceedsSetCapacity ||
              activeSeparatorInvalid ||
              (sourceMode === "file" &&
                Boolean(selectedFile) &&
                termColumn === definitionColumn)
            }
            onClick={finishImport}
            type="button"
          >
            {cardsForImport.length} 枚を編集画面へ追加
          </button>
        </footer>
      </section>
    </div>
  );
}
