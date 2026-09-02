"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  FileSpreadsheet,
  Home,
  Keyboard,
  Layers3,
  Library,
  LockKeyhole,
  Pencil,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  ShieldCheck,
  Shuffle,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  BrowserStorageConflictError,
  clearBrowserDraft,
  getBrowserStorageEstimate,
  migrateLegacyBrowserStudySets,
  readBrowserDraft,
  readBrowserStudyBackups,
  readBrowserStudySnapshot,
  requestBrowserStoragePersistence,
  saveBrowserDraft,
  saveBrowserStudySnapshot,
} from "./browserStorage";
import {
  MAX_BACKUP_FILE_BYTES,
  parseRecallBackup,
  serializeRecallBackup,
  type RecallBackup,
} from "./backupFile";
import CodeAnswerEditor, {
  type CodeAnswerEditorHandle,
  type CodeLanguage,
} from "./CodeAnswerEditor";
import ImportDialog from "./ImportDialog";
import { useModalDialog } from "./useModalDialog";
import {
  chooseProjectFolder,
  clearStoredDirectoryHandle,
  getFolderPermission,
  getStoredDirectoryHandle,
  readSetsFromFolder,
  requestFolderPermission,
  ProjectSetsFileStateError,
  storeDirectoryHandle,
  supportsProjectFolderStorage,
  writeSetsToFolder,
  type RecallDirectoryHandle,
} from "./fileStorage";
import {
  advanceStudyProgress,
  createBlankCards,
  createStudyProgress,
  DEFAULT_STUDY_BATCH_SIZE,
  DRAFT_KEY,
  Flashcard,
  getCurrentStudyCardId,
  getStudyBatchIds,
  getStudyScore,
  hasAnyCardContent,
  hasCompleteCardPair,
  isSafeIdentifier,
  isStudyProgressResumable,
  makeId,
  matchesStudyAnswer,
  normalizeTextLineEndings,
  parseStoredSetsText,
  recordCorrectStudyAnswer,
  recordSuccessfulRetype,
  recordWrongStudyAnswer,
  seedSets,
  serializeStudySets,
  shouldAdvanceStudyOnEnter,
  startNextStudyBatch,
  STORAGE_KEY,
  STUDY_BATCH_OPTIONS,
  trimStudyAnswerLineEndWhitespace,
  StudyBatchSize,
  StudyDirection,
  StudyProgress,
  StudySet,
} from "./model";
import {
  MAX_CARD_TEXT_LENGTH,
  MAX_CARDS_PER_SET,
  MAX_SET_DESCRIPTION_LENGTH,
  MAX_SET_TITLE_LENGTH,
  MAX_STORED_JSON_CHARS,
  MAX_STUDY_SETS,
  MAX_TOTAL_STORED_CARDS,
} from "./securityLimits";

type View = "home" | "sets" | "editor" | "study" | "flashcards";
const APP_VIEWS: readonly View[] = [
  "home",
  "sets",
  "editor",
  "study",
  "flashcards",
];

function isView(value: unknown): value is View {
  return typeof value === "string" && APP_VIEWS.includes(value as View);
}
type StudyPhase =
  | "ready"
  | "question"
  | "retype"
  | "correct"
  | "batch-complete"
  | "complete";
type StudyScreen = "ready" | "active" | "complete";
type StorageMode =
  | "browser"
  | "folder"
  | "permission"
  | "unsupported"
  | "blocked";
type StorageWriteState = "idle" | "saving" | "saved" | "error";
type ToastTone = "success" | "info" | "warning" | "error";

type ToastNotice = {
  message: string;
  tone: ToastTone;
};

type BackupRestoreCandidate = {
  fileName: string;
  backup: RecallBackup;
};

type EditorDraft = {
  setId?: string;
  title: string;
  description: string;
  cards: Flashcard[];
};

const STORAGE_QUARANTINE_KEY = STORAGE_KEY + "-quarantined";
const STORAGE_REVISION_KEY = STORAGE_KEY + "-revision-v2";
const INITIAL_STORAGE_RESTORE_TIMEOUT_MS = 3_000;
const EDITOR_PAGE_SIZE = 100;

const newDraft = (): EditorDraft => ({
  title: "",
  description: "",
  cards: createBlankCards(4),
});

function shuffleIds(ids: string[]): string[] {
  const next = [...ids];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function formatRelativeDate(value?: string): string {
  if (!value) return "未学習";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未学習";

  const now = new Date();
  const todayDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDifference = Math.round((todayDay - targetDay) / 86_400_000);
  if (dayDifference < 0) return "未来日時";
  if (dayDifference === 0) return "今日";
  if (dayDifference === 1) return "昨日";
  if (dayDifference < 30) return dayDifference + "日前";
  return new Intl.DateTimeFormat("ja-JP", {
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

async function withFolderWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(
      "recall-folder-write-v1",
      { mode: "exclusive" },
      operation,
    );
  }
  return operation();
}

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function studyActivityTimestamp(set?: StudySet): number {
  if (!set) return 0;
  return Math.max(
    timestamp(set.lastStudiedAt),
    timestamp(set.studyProgress?.updatedAt),
  );
}

function hasResumableProgress(set?: StudySet): boolean {
  return Boolean(
    set &&
    isStudyProgressResumable(
      set.studyProgress,
      set.cards.map((card) => card.id),
    ),
  );
}

function validDraftFromStorage(value: string | null): EditorDraft | null {
  if (!value || value.length > MAX_STORED_JSON_CHARS) return null;
  try {
    const parsed = JSON.parse(value) as Partial<EditorDraft>;
    if (
      typeof parsed.title !== "string" ||
      parsed.title.length > MAX_SET_TITLE_LENGTH ||
      typeof parsed.description !== "string" ||
      parsed.description.length > MAX_SET_DESCRIPTION_LENGTH ||
      !Array.isArray(parsed.cards) ||
      parsed.cards.length === 0 ||
      parsed.cards.length > MAX_CARDS_PER_SET ||
      !parsed.cards.every(
        (card) =>
          card &&
          isSafeIdentifier(card.id) &&
          typeof card.term === "string" &&
          card.term.length <= MAX_CARD_TEXT_LENGTH &&
          typeof card.definition === "string" &&
          card.definition.length <= MAX_CARD_TEXT_LENGTH,
      )
    ) {
      return null;
    }
    if (!isSafeIdentifier(parsed.setId) && parsed.setId !== undefined) {
      return null;
    }
    const cardIds = parsed.cards.map((card) => card.id);
    if (new Set(cardIds).size !== cardIds.length) return null;
    return {
      setId: typeof parsed.setId === "string" ? parsed.setId : undefined,
      title: parsed.title,
      description: parsed.description,
      cards: parsed.cards.map((card) => ({
        id: card.id,
        term: normalizeTextLineEndings(card.term),
        definition: normalizeTextLineEndings(card.definition),
      })),
    };
  } catch {
    return null;
  }
}

function mergeStudySets(
  browserSets: StudySet[],
  folderSets: StudySet[],
  deletedSetIds: ReadonlySet<string> = new Set(),
): StudySet[] {
  const merged = new Map<string, StudySet>();
  for (const set of browserSets) merged.set(set.id, set);
  const now = Date.now();
  const futureToleranceMs = 5 * 60 * 1000;
  const safeTimestamp = (value: string) => {
    const parsed = timestamp(value);
    return parsed <= now + futureToleranceMs ? parsed : 0;
  };

  for (const folderSet of folderSets) {
    if (deletedSetIds.has(folderSet.id)) continue;
    const current = merged.get(folderSet.id);
    if (!current) {
      merged.set(folderSet.id, folderSet);
      continue;
    }
    if (JSON.stringify(current) === JSON.stringify(folderSet)) continue;
    // With bounded timestamps, newest durable copy wins for the same ID.
    // Browser wins ties so a reconnect never changes data without evidence.
    if (safeTimestamp(folderSet.updatedAt) > safeTimestamp(current.updatedAt)) {
      merged.set(folderSet.id, folderSet);
    }
  }
  return Array.from(merged.values()).sort(
    (a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt),
  );
}

function cardContentMatches(left: Flashcard[], right: Flashcard[]): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((card) => [card.id, card]));
  return left.every((card) => {
    const match = rightById.get(card.id);
    return (
      match !== undefined &&
      card.term === match.term &&
      card.definition === match.definition
    );
  });
}

function StudyMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="study-message" role="alert">
      <AlertTriangle size={15} />
      {message}
    </p>
  );
}

export default function HomePage() {
  const [sets, setSets] = useState<StudySet[]>(seedSets);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "home";
    const hashView = window.location.hash.slice(1);
    return isView(hashView) && hashView !== "editor" ? hashView : "home";
  });
  const [activeSetId, setActiveSetId] = useState(seedSets[0].id);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudySet | null>(null);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode>("browser");
  const [storageWriteState, setStorageWriteState] =
    useState<StorageWriteState>("idle");
  const [browserStorageBlocked, setBrowserStorageBlocked] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [storageTransitioning, setStorageTransitioning] = useState(false);
  const [explicitSaveInProgress, setExplicitSaveInProgress] = useState(false);
  const [storageUsage, setStorageUsage] = useState<{
    quota?: number;
    usage?: number;
    persisted?: boolean;
  }>({});
  const [browserBackupSummary, setBrowserBackupSummary] = useState<{
    count: number;
    latestSavedAt?: string;
  }>({ count: 0 });
  const [backupRestoreCandidate, setBackupRestoreCandidate] =
    useState<BackupRestoreCandidate | null>(null);

  const [draft, setDraft] = useState<EditorDraft>(newDraft);
  const [editorError, setEditorError] = useState("");
  const [editorInvalidField, setEditorInvalidField] = useState("");
  const [draftStatus, setDraftStatus] = useState<"saving" | "saved" | "error">(
    "saved",
  );
  const [importOpen, setImportOpen] = useState(false);
  const [editorPage, setEditorPage] = useState(0);
  const [removedDraftCard, setRemovedDraftCard] = useState<{
    card: Flashcard;
    index: number;
  } | null>(null);

  const [direction, setDirection] =
    useState<StudyDirection>("definition-to-term");
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [allowParentheticalOmission, setAllowParentheticalOmission] =
    useState(true);
  const [studyBatchSize, setStudyBatchSize] = useState<StudyBatchSize>(
    DEFAULT_STUDY_BATCH_SIZE,
  );
  const [studyScreen, setStudyScreen] = useState<StudyScreen>("ready");
  const [studyRun, setStudyRun] = useState<StudyProgress | null>(null);
  const [answer, setAnswer] = useState("");
  const [retypeAnswer, setRetypeAnswer] = useState("");
  const [studyMessage, setStudyMessage] = useState("");
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>("plain");
  const studyPhase: StudyPhase =
    studyScreen === "complete" ? "complete" : (studyRun?.phase ?? "ready");

  const [flashOrder, setFlashOrder] = useState<string[]>([]);
  const [flashIndex, setFlashIndex] = useState(0);
  const [flashFlipped, setFlashFlipped] = useState(false);

  const answerInputRef = useRef<CodeAnswerEditorHandle>(null);
  const retypeInputRef = useRef<CodeAnswerEditorHandle>(null);
  const answerFormRef = useRef<HTMLFormElement>(null);
  const retypeFormRef = useRef<HTMLFormElement>(null);
  const nextQuestionButtonRef = useRef<HTMLButtonElement>(null);
  const storageDialogRef = useRef<HTMLElement>(null);
  const deleteDialogRef = useRef<HTMLElement>(null);
  const backupRestoreDialogRef = useRef<HTMLElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const directoryHandleRef = useRef<RecallDirectoryHandle | null>(null);
  const folderWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const folderFileTextRef = useRef<string | undefined>(undefined);
  const folderGenerationRef = useRef(0);
  const folderSaveRequestRef = useRef(0);
  const browserRevisionRef = useRef<string | null>(null);
  const deletedSetIdsRef = useRef<Set<string>>(new Set());
  const browserSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const browserSaveGenerationRef = useRef(0);
  const explicitlyPersistedSetsRef = useRef<StudySet[] | null>(null);
  const latestSetsRef = useRef(sets);
  const latestDraftRef = useRef(draft);
  const latestViewRef = useRef(view);

  useEffect(() => {
    latestSetsRef.current = sets;
    latestDraftRef.current = draft;
    latestViewRef.current = view;
  }, [sets, draft, view]);

  useModalDialog(
    storageDialogOpen,
    () => setStorageDialogOpen(false),
    storageDialogRef,
  );
  useModalDialog(
    deleteTarget !== null,
    () => setDeleteTarget(null),
    deleteDialogRef,
  );
  useModalDialog(
    backupRestoreCandidate !== null,
    () => setBackupRestoreCandidate(null),
    backupRestoreDialogRef,
  );

  function reportBrowserStorageFailure(message: string) {
    setBrowserStorageBlocked(true);
    setStorageWriteState("error");
    setToast({ message, tone: "error" });
  }

  function queueBrowserSave(
    nextSets: StudySet[],
    options: { createBackup?: boolean; coalesce?: boolean } = {},
  ): Promise<void> {
    const requestId = browserSaveGenerationRef.current + 1;
    browserSaveGenerationRef.current = requestId;
    const coalesce = options.coalesce !== false;

    const task = browserSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (coalesce && requestId !== browserSaveGenerationRef.current) return;
        const snapshot = await saveBrowserStudySnapshot(nextSets, {
          expectedRevision: browserRevisionRef.current,
          createBackup: options.createBackup === true,
          deletedSetIds: Array.from(deletedSetIdsRef.current),
        });
        browserRevisionRef.current = snapshot.revision;
        try {
          localStorage.setItem(STORAGE_REVISION_KEY, snapshot.revision);
        } catch {
          // The IndexedDB commit is already durable. The tiny revision key is
          // only a cross-tab fallback for browsers without BroadcastChannel.
        }
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("recall-browser-storage-v2");
          channel.postMessage({ revision: snapshot.revision });
          channel.close();
        }
      });
    browserSaveQueueRef.current = task;
    return task;
  }

  function handleFolderWriteFailure(error: unknown) {
    setStorageWriteState("error");
    if (error instanceof ProjectSetsFileStateError) {
      setStorageMode("blocked");
      setToast({
        message:
          error.fileState.status === "conflict"
            ? "外部変更を検知したため、sets.json の上書きを停止しました"
            : "sets.json を保護するため、フォルダーへの上書きを停止しました",
        tone: "error",
      });
    } else {
      setToast({
        message: "フォルダーへ安全に保存できませんでした",
        tone: "error",
      });
    }
  }

  function queueFolderSave(
    nextSets: StudySet[],
    options: { createBackup?: boolean; coalesce?: boolean } = {},
  ): Promise<void> {
    const handle = directoryHandleRef.current;
    if (!handle || storageMode !== "folder") return Promise.resolve();

    const storageGeneration = folderGenerationRef.current;
    const requestId = folderSaveRequestRef.current + 1;
    folderSaveRequestRef.current = requestId;
    const coalesce = options.coalesce !== false;
    setStorageWriteState("saving");

    const task = folderWriteQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (storageGeneration !== folderGenerationRef.current) return;
        if (coalesce && requestId !== folderSaveRequestRef.current) return;
        const text = await withFolderWriteLock(() =>
          writeSetsToFolder(handle, nextSets, {
            expectedText: folderFileTextRef.current,
            createBackup: options.createBackup === true,
          }),
        );
        if (storageGeneration !== folderGenerationRef.current) return;
        folderFileTextRef.current = text;
      })
      .then(() => {
        if (
          storageGeneration === folderGenerationRef.current &&
          (!coalesce || requestId === folderSaveRequestRef.current)
        ) {
          setStorageWriteState("saved");
        }
      })
      .catch((error: unknown) => {
        if (storageGeneration === folderGenerationRef.current) {
          handleFolderWriteFailure(error);
        }
        throw error;
      });
    folderWriteQueueRef.current = task;
    return task;
  }

  async function persistSetsForExplicitAction(nextSets: StudySet[]): Promise<{
    browserBackupWarning: boolean;
    folderWarning: boolean;
  }> {
    setExplicitSaveInProgress(true);
    let browserBackupWarning = false;
    let folderWarning = false;
    let browserSaved = false;
    let folderSaved = false;
    try {
      if (!browserStorageBlocked) {
        try {
          await queueBrowserSave(nextSets, {
            createBackup: true,
            coalesce: false,
          });
          browserSaved = true;
        } catch (error) {
          browserBackupWarning = true;
          if (error instanceof BrowserStorageConflictError) {
            reportBrowserStorageFailure(
              "別タブの変更を検知したため、ブラウザー保存を停止しました",
            );
          } else {
            reportBrowserStorageFailure(
              "ブラウザー内に安全に保存できないため、自動保存を停止しました",
            );
          }
        }
      }

      if (storageMode === "folder" && directoryHandleRef.current) {
        try {
          await queueFolderSave(nextSets, {
            createBackup: true,
            coalesce: false,
          });
          folderSaved = true;
        } catch (error) {
          folderWarning = true;
          if (!browserSaved) throw error;
        }
      }

      if (!browserSaved && !folderSaved) {
        throw new Error("no_durable_storage_available");
      }
      explicitlyPersistedSetsRef.current = nextSets;
      return { browserBackupWarning, folderWarning };
    } finally {
      setExplicitSaveInProgress(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let initialSetsCommitted = false;
    let browserReadFailed = false;
    let fallbackBlockedBrowserStorage = false;
    let restoredFolder = false;

    const restoreTimeout = window.setTimeout(() => {
      if (cancelled) return;
      setHydrated(true);
      if (!initialSetsCommitted && !browserReadFailed) {
        fallbackBlockedBrowserStorage = true;
        setBrowserStorageBlocked(true);
        setStorageWriteState("error");
        setToast({
          message:
            "保存先の確認に時間がかかったため、画面を先に表示しました。自動上書きは停止しています",
          tone: "error",
        });
      }
    }, INITIAL_STORAGE_RESTORE_TIMEOUT_MS);

    function commitInitialSets(nextSets: StudySet[]) {
      if (cancelled || initialSetsCommitted) return;
      initialSetsCommitted = true;
      setSets(nextSets);
      if (nextSets[0]) setActiveSetId(nextSets[0].id);
      setHydrated(true);
    }

    async function hydrateData() {
      let nextSets: StudySet[] | null = null;
      let browserSnapshotExists = false;

      const browserSnapshot = await readBrowserStudySnapshot();
      if (cancelled) return;
      if (browserSnapshot.status === "valid") {
        nextSets = browserSnapshot.snapshot.sets;
        browserRevisionRef.current = browserSnapshot.snapshot.revision;
        deletedSetIdsRef.current = new Set(
          browserSnapshot.snapshot.deletedSetIds,
        );
        browserSnapshotExists = true;
      } else if (browserSnapshot.status === "missing") {
        // One-time migration path from the original localStorage format.
        try {
          const storedText = localStorage.getItem(STORAGE_KEY);
          if (storedText !== null) {
            const parsed = parseStoredSetsText(storedText);
            if (parsed.status === "valid") {
              nextSets = parsed.sets;
              const migrated = await migrateLegacyBrowserStudySets(parsed.sets);
              browserRevisionRef.current = migrated.revision;
              browserSnapshotExists = true;
            } else {
              browserReadFailed = true;
              try {
                localStorage.setItem(STORAGE_QUARANTINE_KEY, storedText);
              } catch {
                // Keep the original legacy value untouched when quarantine is full.
              }
              setBrowserStorageBlocked(true);
              setStorageWriteState("error");
              setToast({
                message:
                  "破損または過大な旧ブラウザー保存を保護し、自動上書きを停止しました",
                tone: "error",
              });
            }
          }
        } catch {
          browserReadFailed = true;
          setBrowserStorageBlocked(true);
          setStorageWriteState("error");
          setToast({
            message: "ブラウザー内の保存データを読み取れませんでした",
            tone: "error",
          });
        }
      } else {
        browserReadFailed = true;
        setBrowserStorageBlocked(true);
        setStorageWriteState("error");
        setToast({
          message:
            browserSnapshot.status === "invalid"
              ? "ブラウザー保存の構造異常を検知し、自動上書きを停止しました"
              : "ブラウザー保存領域を利用できないため、自動上書きを停止しました",
          tone: "error",
        });
      }

      if (nextSets) {
        await Promise.resolve();
        commitInitialSets(nextSets);
      }

      if (!supportsProjectFolderStorage()) {
        if (!cancelled) setStorageMode("unsupported");
      } else {
        try {
          const handle = await getStoredDirectoryHandle();
          if (handle && !cancelled) {
            directoryHandleRef.current = handle;
            folderGenerationRef.current += 1;
            setFolderName(handle.name);
            const permission = await getFolderPermission(handle);
            if (permission === "granted") {
              const folderFile = await readSetsFromFolder(handle);
              if (folderFile.status === "valid") {
                if (nextSets === null) {
                  nextSets = folderFile.sets;
                  folderFileTextRef.current = folderFile.text;
                  restoredFolder = true;
                  setStorageMode("folder");
                  setStorageWriteState("saved");
                } else {
                  const browserText = serializeStudySets(nextSets, true);
                  if (browserText === folderFile.text) {
                    folderFileTextRef.current = folderFile.text;
                    restoredFolder = true;
                    setStorageMode("folder");
                    setStorageWriteState("saved");
                  } else {
                    // Do not silently pick a winner when both durable copies
                    // exist and differ. Keep the browser copy visible and stop
                    // folder writes until the user explicitly reconnects.
                    folderFileTextRef.current = folderFile.text;
                    setStorageMode("blocked");
                    setStorageWriteState("error");
                    setToast({
                      message:
                        "ブラウザー保存と sets.json の内容差を検知したため、フォルダー同期を停止しました",
                      tone: "warning",
                    });
                  }
                }
              } else if (folderFile.status === "missing") {
                const initialSets = nextSets ?? seedSets;
                folderFileTextRef.current = await writeSetsToFolder(
                  handle,
                  initialSets,
                  { createIfMissing: true, createBackup: false },
                );
                nextSets = initialSets;
                restoredFolder = true;
                setStorageMode("folder");
                setStorageWriteState("saved");
              } else {
                setStorageMode("blocked");
                setStorageWriteState("error");
                setToast({
                  message:
                    folderFile.status === "invalid-json" ||
                    folderFile.status === "invalid-data" ||
                    folderFile.status === "too-large"
                      ? "既存の sets.json を読み取れないため、上書きを停止しました"
                      : "プロジェクトの sets.json を読み取れませんでした",
                  tone: "error",
                });
              }
            } else {
              setStorageMode("permission");
            }
          }
        } catch {
          if (!cancelled) setStorageMode("browser");
        }
      }

      if (cancelled) return;
      const resolvedSets = nextSets ?? seedSets;
      if (!browserReadFailed && !browserSnapshotExists) {
        try {
          const migrated = await migrateLegacyBrowserStudySets(resolvedSets);
          browserRevisionRef.current = migrated.revision;
        } catch {
          browserReadFailed = true;
          setBrowserStorageBlocked(true);
          setStorageWriteState("error");
        }
      }
      if (!initialSetsCommitted) commitInitialSets(resolvedSets);
      if (fallbackBlockedBrowserStorage && !browserReadFailed) {
        setBrowserStorageBlocked(false);
        setStorageWriteState(restoredFolder ? "saved" : "idle");
      }
      void getBrowserStorageEstimate().then((estimate) => {
        if (!cancelled) setStorageUsage(estimate);
      });
      window.clearTimeout(restoreTimeout);
      setHydrated(true);
    }

    void hydrateData();
    return () => {
      cancelled = true;
      window.clearTimeout(restoreTimeout);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (explicitlyPersistedSetsRef.current === sets) {
      explicitlyPersistedSetsRef.current = null;
      return;
    }

    if (!browserStorageBlocked) {
      void queueBrowserSave(sets, {
        createBackup: false,
        coalesce: true,
      }).catch((error: unknown) => {
        if (error instanceof BrowserStorageConflictError) {
          reportBrowserStorageFailure(
            "別タブまたは別アプリによる変更を検知し、ブラウザー保存を停止しました",
          );
        } else {
          reportBrowserStorageFailure(
            "ブラウザー内に保存できないため、自動保存を停止しました",
          );
        }
      });
    }

    if (storageMode === "folder" && directoryHandleRef.current) {
      void queueFolderSave(sets, { createBackup: false, coalesce: true }).catch(
        () => undefined,
      );
    }
    // queueFolderSave is a local scheduler whose identity changes with the render;
    // the persisted data and storage-mode dependencies below are the intended triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, hydrated, storageMode, browserStorageBlocked]);

  useEffect(() => {
    if (!hydrated) return;

    function blockForExternalRevision(revision: unknown) {
      if (
        typeof revision !== "string" ||
        revision === browserRevisionRef.current
      )
        return;
      setBrowserStorageBlocked(true);
      setStorageWriteState("error");
      setToast({
        message:
          "別タブによる保存変更を検知し、データ保護のため自動保存を停止しました",
        tone: "error",
      });
    }

    function handleExternalStorageChange(event: StorageEvent) {
      if (event.storageArea !== localStorage) return;
      if (event.key === STORAGE_REVISION_KEY) {
        blockForExternalRevision(event.newValue);
      } else if (event.key === STORAGE_KEY && event.newValue !== null) {
        // Detect an older TOTAL RECALL build writing the legacy full-data key.
        setBrowserStorageBlocked(true);
        setStorageWriteState("error");
        setToast({
          message:
            "旧バージョンまたは別タブによる保存変更を検知し、自動保存を停止しました",
          tone: "error",
        });
      }
    }

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("recall-browser-storage-v2")
        : null;
    if (channel) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const value = event.data;
        if (value && typeof value === "object" && "revision" in value) {
          blockForExternalRevision((value as { revision?: unknown }).revision);
        }
      };
    }

    window.addEventListener("storage", handleExternalStorageChange);
    return () => {
      window.removeEventListener("storage", handleExternalStorageChange);
      channel?.close();
    };
  }, [hydrated]);

  useEffect(() => {
    if (!storageDialogOpen) return;
    let cancelled = false;
    void readBrowserStudyBackups()
      .then((backups) => {
        if (cancelled) return;
        setBrowserBackupSummary({
          count: backups.length,
          latestSavedAt: backups[0]?.savedAt,
        });
      })
      .catch(() => {
        if (!cancelled) setBrowserBackupSummary({ count: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [storageDialogOpen]);

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
      setImportOpen(false);
      setStorageDialogOpen(false);
      setDeleteTarget(null);
      setBackupRestoreCandidate(null);
      setEditorError("");
      setEditorInvalidField("");
      setStudyMessage("");
      setView(stateView);
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // The initial view is captured when hydration completes; later navigation
    // is driven by goTo() and browser popstate events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const duration =
      toast.tone === "success" ? 3_200 : toast.tone === "info" ? 6_000 : 12_000;
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!hydrated || view !== "editor") return;
    let cancelled = false;
    const savingTimer = window.setTimeout(() => setDraftStatus("saving"), 0);
    const savedTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const serialized = JSON.stringify(draft);
          if (!validDraftFromStorage(serialized)) {
            throw new Error("invalid_draft");
          }
          await saveBrowserDraft(serialized);
          if (!cancelled) setDraftStatus("saved");
        } catch {
          if (!cancelled) setDraftStatus("error");
        }
      })();
    }, 420);
    return () => {
      cancelled = true;
      window.clearTimeout(savingTimer);
      window.clearTimeout(savedTimer);
    };
  }, [draft, hydrated, view]);

  useEffect(() => {
    if (!hydrated) return;
    function flushWhenHidden() {
      if (document.visibilityState !== "hidden") return;
      const currentSets = latestSetsRef.current;
      if (!browserStorageBlocked) {
        void queueBrowserSave(currentSets, {
          createBackup: false,
          coalesce: false,
        }).catch(() => undefined);
      }
      if (latestViewRef.current === "editor") {
        const serialized = JSON.stringify(latestDraftRef.current);
        if (validDraftFromStorage(serialized)) {
          void saveBrowserDraft(serialized).catch(() => undefined);
        }
      }
    }
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", flushWhenHidden);
  }, [hydrated, browserStorageBlocked]);

  useEffect(() => {
    let focusTimer: number | undefined;
    if (studyPhase === "question") {
      focusTimer = window.setTimeout(() => answerInputRef.current?.focus(), 0);
    }
    if (studyPhase === "retype") {
      focusTimer = window.setTimeout(() => retypeInputRef.current?.focus(), 0);
    }
    return () => {
      if (focusTimer !== undefined) window.clearTimeout(focusTimer);
    };
  }, [studyPhase, studyRun?.roundIndex]);

  useEffect(() => {
    if (
      view !== "study" ||
      studyPhase !== "correct" ||
      storageDialogOpen ||
      deleteTarget !== null ||
      importOpen
    ) {
      return;
    }

    function handleNextQuestionKey(event: globalThis.KeyboardEvent) {
      const target = event.target;
      const interactiveTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches(
            "button, a, input, textarea, select, summary, [role='button']",
          ));
      if (
        !shouldAdvanceStudyOnEnter({
          key: event.key,
          isComposing: event.isComposing || event.keyCode === 229,
          repeat: event.repeat,
          defaultPrevented: event.defaultPrevented,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          interactiveTarget,
        })
      ) {
        return;
      }
      event.preventDefault();
      nextQuestionButtonRef.current?.click();
    }

    document.addEventListener("keydown", handleNextQuestionKey);
    return () => document.removeEventListener("keydown", handleNextQuestionKey);
  }, [deleteTarget, importOpen, storageDialogOpen, studyPhase, view]);

  const activeSet = sets.find((set) => set.id === activeSetId) ?? sets[0];
  const totalCards = sets.reduce((total, set) => total + set.cards.length, 0);
  const averageScore = (() => {
    const studied = sets.filter((set) => typeof set.lastScore === "number");
    if (studied.length === 0) return 0;
    return Math.round(
      studied.reduce((total, set) => total + (set.lastScore ?? 0), 0) /
        studied.length,
    );
  })();

  const filteredSets = useMemo(() => {
    const normalizeForSearch = (value: string) =>
      value.normalize("NFC").toLocaleLowerCase("ja");
    const query = normalizeForSearch(search.trim());
    if (!query) return sets;
    return sets.filter(
      (set) =>
        normalizeForSearch(set.title).includes(query) ||
        normalizeForSearch(set.description).includes(query) ||
        set.cards.some(
          (card) =>
            normalizeForSearch(card.term).includes(query) ||
            normalizeForSearch(card.definition).includes(query),
        ),
    );
  }, [sets, search]);

  const currentStudyCard = activeSet?.cards.find(
    (card) => card.id === (studyRun ? getCurrentStudyCardId(studyRun) : ""),
  );
  const activeStudyDirection = studyRun?.direction ?? direction;
  const expectedAnswer = currentStudyCard
    ? activeStudyDirection === "definition-to-term"
      ? currentStudyCard.term
      : currentStudyCard.definition
    : "";
  const currentPrompt = currentStudyCard
    ? activeStudyDirection === "definition-to-term"
      ? currentStudyCard.definition
      : currentStudyCard.term
    : "";

  const currentFlashCard = activeSet?.cards.find(
    (card) => card.id === flashOrder[flashIndex],
  );

  function goTo(nextView: View) {
    setView(nextView);
    setEditorError("");
    setEditorInvalidField("");
    setStudyMessage("");
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

  async function connectProjectFolder(reuseStoredHandle: boolean) {
    if (storageTransitioning) return;
    if (!supportsProjectFolderStorage()) {
      setStorageMode("unsupported");
      setStorageWriteState("error");
      return;
    }

    setStorageTransitioning(true);
    setStorageWriteState("saving");
    try {
      // Let any write already using the previous handle finish before changing
      // the storage generation. This prevents old closures from writing after
      // a destination switch.
      await folderWriteQueueRef.current.catch(() => undefined);
      const handle =
        reuseStoredHandle && directoryHandleRef.current
          ? directoryHandleRef.current
          : await chooseProjectFolder();
      const permission = await requestFolderPermission(handle);

      if (permission !== "granted") {
        setStorageMode("permission");
        setStorageWriteState("error");
        return;
      }

      const folderFile = await readSetsFromFolder(handle);
      if (
        folderFile.status === "invalid-json" ||
        folderFile.status === "invalid-data" ||
        folderFile.status === "too-large" ||
        folderFile.status === "error"
      ) {
        directoryHandleRef.current = handle;
        setFolderName(handle.name);
        setStorageMode("blocked");
        setStorageWriteState("error");
        setToast({
          message:
            folderFile.status === "error"
              ? "プロジェクトの sets.json を読み取れませんでした"
              : folderFile.status === "too-large"
                ? "sets.json が安全上限を超えているため、上書きを停止しました"
                : "既存の sets.json を読み取れないため、上書きを停止しました",
          tone: "error",
        });
        return;
      }

      const mergedSets =
        folderFile.status === "valid"
          ? mergeStudySets(sets, folderFile.sets, deletedSetIdsRef.current)
          : sets;
      // Persist the capability before mutating files. A later file failure can
      // then be retried without leaving an unremembered side effect.
      await storeDirectoryHandle(handle);
      directoryHandleRef.current = handle;
      folderGenerationRef.current += 1;
      folderSaveRequestRef.current += 1;
      setFolderName(handle.name);

      let writtenText: string;
      if (folderFile.status === "missing") {
        writtenText = await withFolderWriteLock(() =>
          writeSetsToFolder(handle, mergedSets, {
            createIfMissing: true,
            createBackup: false,
          }),
        );
      } else {
        writtenText = await withFolderWriteLock(() =>
          writeSetsToFolder(handle, mergedSets, {
            expectedText: folderFile.text,
            createBackup: true,
          }),
        );
      }
      folderFileTextRef.current = writtenText;

      let browserBackupWarning = false;
      if (!browserStorageBlocked) {
        try {
          await queueBrowserSave(mergedSets, {
            createBackup: true,
            coalesce: false,
          });
        } catch {
          browserBackupWarning = true;
          setBrowserStorageBlocked(true);
        }
      }
      explicitlyPersistedSetsRef.current = mergedSets;
      setSets(mergedSets);
      setStorageMode("folder");
      setStorageWriteState("saved");
      setToast({
        message: browserBackupWarning
          ? "フォルダー保存を有効にしました。ブラウザー予備保存は停止中です"
          : "プロジェクトフォルダーへの保存を有効にしました",
        tone: browserBackupWarning ? "warning" : "success",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStorageWriteState("idle");
        return;
      }
      setStorageWriteState("error");
      if (error instanceof ProjectSetsFileStateError) {
        setStorageMode("blocked");
        setToast({
          message:
            error.fileState.status === "conflict"
              ? "外部変更を検知したため、sets.json の上書きを停止しました"
              : "sets.json を保護するため、フォルダーへの上書きを停止しました",
          tone: "error",
        });
      } else {
        setToast({
          message: "フォルダーへ保存できませんでした",
          tone: "error",
        });
      }
    } finally {
      setStorageTransitioning(false);
    }
  }

  async function disconnectProjectFolder() {
    if (storageTransitioning) return;
    setStorageTransitioning(true);
    try {
      // Ensure a durable browser copy exists before abandoning the folder.
      if (browserStorageBlocked) {
        const current = await readBrowserStudySnapshot();
        if (
          current.status === "valid" &&
          current.snapshot.revision !== browserRevisionRef.current
        ) {
          throw new BrowserStorageConflictError();
        }
        if (current.status !== "valid" && current.status !== "missing") {
          throw new Error("browser_storage_unavailable");
        }
        const snapshot = await saveBrowserStudySnapshot(sets, {
          expectedRevision:
            current.status === "valid" ? current.snapshot.revision : null,
          createBackup: true,
          deletedSetIds: Array.from(deletedSetIdsRef.current),
        });
        browserRevisionRef.current = snapshot.revision;
        try {
          localStorage.setItem(STORAGE_REVISION_KEY, snapshot.revision);
        } catch {
          // IndexedDB is already committed.
        }
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("recall-browser-storage-v2");
          channel.postMessage({ revision: snapshot.revision });
          channel.close();
        }
        setBrowserStorageBlocked(false);
      }
      folderGenerationRef.current += 1;
      folderSaveRequestRef.current += 1;
      await folderWriteQueueRef.current.catch(() => undefined);
      await clearStoredDirectoryHandle();
      directoryHandleRef.current = null;
      folderFileTextRef.current = undefined;
      setFolderName("");
      setStorageMode("browser");
      setStorageWriteState("idle");
      setToast({
        message:
          "ブラウザー内保存へ切り替えました。ブラウザー設定の権限は必要に応じて取り消してください",
        tone: "info",
      });
    } catch {
      setToast({
        message:
          "安全なブラウザー保存を確認できないため、フォルダー接続を維持しました",
        tone: "error",
      });
    } finally {
      setStorageTransitioning(false);
    }
  }

  async function makeBrowserStoragePersistent() {
    const persisted = await requestBrowserStoragePersistence();
    const estimate = await getBrowserStorageEstimate();
    setStorageUsage(estimate);
    setToast({
      message:
        persisted === true
          ? "ブラウザーへ永続ストレージを要求しました"
          : persisted === undefined
            ? "このブラウザーは永続ストレージ要求に対応していません"
            : "永続ストレージは許可されませんでした。外部バックアップも併用してください",
      tone: persisted === true ? "success" : "info",
    });
  }

  async function restoreLatestBrowserBackup() {
    if (storageTransitioning || explicitSaveInProgress) return;
    setStorageTransitioning(true);
    try {
      const backups = await readBrowserStudyBackups();
      const latest = backups[0];
      if (!latest) {
        setToast({
          message: "復元できるブラウザー予備コピーがありません",
          tone: "info",
        });
        return;
      }
      const current = await readBrowserStudySnapshot();
      const expectedRevision =
        current.status === "valid"
          ? current.snapshot.revision
          : current.status === "missing"
            ? null
            : undefined;
      const restored = await saveBrowserStudySnapshot(latest.sets, {
        expectedRevision,
        createBackup: current.status === "valid",
        deletedSetIds: latest.deletedSetIds,
      });
      browserRevisionRef.current = restored.revision;
      deletedSetIdsRef.current = new Set(restored.deletedSetIds);
      explicitlyPersistedSetsRef.current = restored.sets;
      setSets(restored.sets);
      setActiveSetId((currentId) =>
        restored.sets.some((set) => set.id === currentId)
          ? currentId
          : (restored.sets[0]?.id ?? ""),
      );
      setBrowserStorageBlocked(false);
      setStorageWriteState(storageMode === "folder" ? "saved" : "idle");
      try {
        localStorage.setItem(STORAGE_REVISION_KEY, restored.revision);
      } catch {
        // IndexedDB is already committed.
      }
      setToast({
        message: "最新のブラウザー予備コピーを復元しました",
        tone: "success",
      });
      const refreshed = await readBrowserStudyBackups();
      setBrowserBackupSummary({
        count: refreshed.length,
        latestSavedAt: refreshed[0]?.savedAt,
      });
    } catch (error) {
      setToast({
        message:
          error instanceof BrowserStorageConflictError
            ? "別タブの変更を検知したため、予備コピーの復元を停止しました"
            : "ブラウザー予備コピーを復元できませんでした",
        tone: "error",
      });
    } finally {
      setStorageTransitioning(false);
    }
  }

  function makeBackupDownloadName(): string {
    const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
    return `recall-backup-${stamp}.json`;
  }

  function exportRecallBackupFile() {
    try {
      const serialized = serializeRecallBackup(
        sets,
        Array.from(deletedSetIdsRef.current),
      );
      const url = URL.createObjectURL(
        new Blob([serialized], { type: "application/json;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = makeBackupDownloadName();
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setToast({
        message: "TOTAL RECALLバックアップを書き出しました",
        tone: "success",
      });
    } catch {
      setToast({
        message: "バックアップを書き出せませんでした",
        tone: "error",
      });
    }
  }

  function readBackupFileText(file: File): Promise<string> {
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

  async function handleBackupFileSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_BYTES) {
      setToast({
        message: "バックアップファイルが安全な上限を超えています",
        tone: "error",
      });
      return;
    }
    try {
      const parsed = parseRecallBackup(await readBackupFileText(file));
      if (parsed.status !== "valid") {
        setToast({
          message:
            parsed.status === "too-large"
              ? "バックアップファイルが安全な上限を超えています"
              : "TOTAL RECALLバックアップとして検証できないファイルです",
          tone: "error",
        });
        return;
      }
      setBackupRestoreCandidate({ fileName: file.name, backup: parsed.backup });
    } catch {
      setToast({
        message: "バックアップファイルを読み取れませんでした",
        tone: "error",
      });
    }
  }

  async function confirmBackupRestore() {
    const candidate = backupRestoreCandidate;
    if (!candidate || explicitSaveInProgress || storageTransitioning) return;
    const previousDeletedSetIds = new Set(deletedSetIdsRef.current);
    deletedSetIdsRef.current = new Set(candidate.backup.deletedSetIds);
    try {
      const result = await persistSetsForExplicitAction(candidate.backup.sets);
      setSets(candidate.backup.sets);
      setActiveSetId(candidate.backup.sets[0]?.id ?? "");
      setStudyRun(null);
      setStudyScreen("ready");
      setFlashOrder([]);
      setFlashIndex(0);
      setFlashFlipped(false);
      try {
        await clearBrowserDraft();
      } catch {
        // Restored set data is already durable; a stale draft is ignored below.
      }
      setDraft(newDraft());
      setBackupRestoreCandidate(null);
      setStorageDialogOpen(false);
      goTo(candidate.backup.sets.length > 0 ? "sets" : "home");
      setToast({
        message: result.folderWarning
          ? "バックアップはブラウザーへ復元しましたが、フォルダー同期に失敗しました"
          : result.browserBackupWarning
            ? "バックアップはフォルダーへ復元しましたが、ブラウザー予備保存は停止中です"
            : "TOTAL RECALLバックアップを復元しました",
        tone:
          result.folderWarning || result.browserBackupWarning
            ? "warning"
            : "success",
      });
    } catch {
      deletedSetIdsRef.current = previousDeletedSetIds;
      setToast({
        message:
          "安全な保存先へ書き込めないため、バックアップ復元を中止しました",
        tone: "error",
      });
    }
  }

  async function recoverBrowserStorage() {
    try {
      const legacyText = localStorage.getItem(STORAGE_KEY);
      if (legacyText !== null) {
        try {
          localStorage.setItem(STORAGE_QUARANTINE_KEY, legacyText);
        } catch {
          // Recovery no longer depends on duplicating the legacy value in the
          // same quota-limited storage area.
        }
      }
      const snapshot = await saveBrowserStudySnapshot(sets, {
        createBackup: true,
        deletedSetIds: Array.from(deletedSetIdsRef.current),
      });
      browserRevisionRef.current = snapshot.revision;
      try {
        localStorage.setItem(STORAGE_REVISION_KEY, snapshot.revision);
      } catch {
        // IndexedDB is the durable primary store.
      }
      setBrowserStorageBlocked(false);
      setStorageWriteState(storageMode === "folder" ? "saved" : "idle");
      setToast({
        message: "現在の表示内容を新しいブラウザー保存領域へ安全に復旧しました",
        tone: "success",
      });
    } catch {
      setBrowserStorageBlocked(true);
      setStorageWriteState("error");
      setToast({
        message: "ブラウザー保存を復旧できませんでした",
        tone: "error",
      });
    }
  }

  async function loadStoredDraft(): Promise<EditorDraft | null> {
    const indexedDraft = validDraftFromStorage(await readBrowserDraft());
    if (indexedDraft) return indexedDraft;
    try {
      const legacy = validDraftFromStorage(localStorage.getItem(DRAFT_KEY));
      if (legacy) {
        await saveBrowserDraft(JSON.stringify(legacy));
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          // The migrated IndexedDB copy is already durable.
        }
      }
      return legacy;
    } catch {
      return null;
    }
  }

  async function startNewSet(restoreDraft = true) {
    let storedDraft: EditorDraft | null = null;
    if (restoreDraft) {
      try {
        const candidate = await loadStoredDraft();
        // A draft that belongs to an existing set must never be restored as a
        // new-set draft. It remains available when that set is edited.
        storedDraft = candidate?.setId ? null : candidate;
      } catch {
        setToast({
          message: "保存済みの下書きを読み取れませんでした",
          tone: "warning",
        });
      }
    }
    setDraft(storedDraft ?? newDraft());
    setEditorPage(0);
    setRemovedDraftCard(null);
    setEditorError("");
    setEditorInvalidField("");
    goTo("editor");
    if (storedDraft) {
      setToast({ message: "前回の新規作成下書きを復元しました", tone: "info" });
    }
  }

  async function startImportingSet() {
    await startNewSet(false);
    setImportOpen(true);
  }

  async function editSet(set: StudySet) {
    let restored: EditorDraft | null = null;
    try {
      const candidate = await loadStoredDraft();
      if (candidate?.setId === set.id) restored = candidate;
    } catch {
      // Fall back to the durable set below.
    }
    setDraft(
      restored ?? {
        setId: set.id,
        title: set.title,
        description: set.description,
        cards: set.cards.map((card) => ({ ...card })),
      },
    );
    setActiveSetId(set.id);
    setEditorPage(0);
    setRemovedDraftCard(null);
    setEditorError("");
    setEditorInvalidField("");
    goTo("editor");
    if (restored) {
      setToast({
        message: "このセットの未保存下書きを復元しました",
        tone: "info",
      });
    }
  }

  function updateDraftCard(
    cardIndex: number,
    cardId: string,
    field: "term" | "definition",
    value: string,
  ) {
    const fieldId = "card-" + cardId + "-" + field;
    if (editorInvalidField === fieldId) {
      setEditorInvalidField("");
      setEditorError("");
    }
    setDraft((current) => {
      const card = current.cards[cardIndex];
      if (!card || card.id !== cardId) return current;
      const cards = [...current.cards];
      cards[cardIndex] = { ...card, [field]: value };
      return { ...current, cards };
    });
  }

  function addDraftCard() {
    if (draft.cards.length >= MAX_CARDS_PER_SET) {
      setToast({
        message: "1セットの上限は " + MAX_CARDS_PER_SET + " 枚です",
        tone: "warning",
      });
      return;
    }
    setDraft((current) => {
      const cards = [...current.cards, ...createBlankCards(1)];
      setEditorPage(Math.floor((cards.length - 1) / EDITOR_PAGE_SIZE));
      return { ...current, cards };
    });
  }

  function removeDraftCard(cardId: string) {
    setDraft((current) => {
      const index = current.cards.findIndex((card) => card.id === cardId);
      if (index < 0) return current;
      const removed = current.cards[index];
      const remaining = current.cards.filter((card) => card.id !== cardId);
      setRemovedDraftCard({ card: removed, index });
      const cards = remaining.length > 0 ? remaining : createBlankCards(1);
      setEditorPage(
        Math.min(
          Math.floor(index / EDITOR_PAGE_SIZE),
          Math.max(0, Math.ceil(cards.length / EDITOR_PAGE_SIZE) - 1),
        ),
      );
      return { ...current, cards };
    });
  }

  function undoRemoveDraftCard() {
    const removed = removedDraftCard;
    if (!removed) return;
    setDraft((current) => {
      const cards = [...current.cards];
      const blankOnly = cards.length === 1 && !hasAnyCardContent(cards[0]);
      if (blankOnly) cards.length = 0;
      const index = Math.min(removed.index, cards.length);
      cards.splice(index, 0, removed.card);
      setEditorPage(Math.floor(index / EDITOR_PAGE_SIZE));
      return { ...current, cards };
    });
    setRemovedDraftCard(null);
  }

  function moveDraftCard(index: number, offset: -1 | 1) {
    setDraft((current) => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.cards.length)
        return current;
      const cards = [...current.cards];
      [cards[index], cards[destination]] = [cards[destination], cards[index]];
      setEditorPage(Math.floor(destination / EDITOR_PAGE_SIZE));
      return { ...current, cards };
    });
  }

  function swapDraftCard(cardId: string) {
    setDraft((current) => ({
      ...current,
      cards: current.cards.map((card) =>
        card.id === cardId
          ? { ...card, term: card.definition, definition: card.term }
          : card,
      ),
    }));
  }

  function importCards(cards: Flashcard[]) {
    const existingCount = draft.cards.filter(hasAnyCardContent).length;
    if (existingCount + cards.length > MAX_CARDS_PER_SET) {
      setToast({
        message: "1セットのカード上限を超えるため追加できませんでした",
        tone: "warning",
      });
      return;
    }
    setDraft((current) => {
      const existing = current.cards.filter(hasAnyCardContent);
      const nextCards = [...existing, ...cards];
      setEditorPage(Math.floor(existing.length / EDITOR_PAGE_SIZE));
      return { ...current, cards: nextCards };
    });
    setImportOpen(false);
    setToast({
      message: cards.length + "枚を編集画面へ追加しました",
      tone: "success",
    });
  }

  function showEditorError(message: string, fieldId: string) {
    setEditorError(message);
    setEditorInvalidField(fieldId);
    window.setTimeout(() => {
      window.requestAnimationFrame(() =>
        document.getElementById(fieldId)?.focus(),
      );
    }, 0);
  }

  async function saveDraft(startAfterSave: boolean) {
    if (explicitSaveInProgress) return;
    const title = draft.title.trim();
    if (!title) {
      showEditorError("セット名を入力してください。", "set-title");
      return;
    }
    if (draft.description.length > MAX_SET_DESCRIPTION_LENGTH) {
      showEditorError(
        "説明は " + MAX_SET_DESCRIPTION_LENGTH + " 文字以内にしてください。",
        "set-description",
      );
      return;
    }
    if (!draft.setId && sets.length >= MAX_STUDY_SETS) {
      showEditorError(
        "学習セット数の上限（" + MAX_STUDY_SETS + "件）に達しています。",
        "set-title",
      );
      return;
    }
    const partialIndex = draft.cards.findIndex(
      (card) => hasAnyCardContent(card) && !hasCompleteCardPair(card),
    );
    if (partialIndex >= 0) {
      const partialCard = draft.cards[partialIndex];
      const missingField =
        partialCard.term.trim().length === 0 ? "term" : "definition";
      setEditorPage(Math.floor(partialIndex / EDITOR_PAGE_SIZE));
      showEditorError(
        "カード " + (partialIndex + 1) + " の正解または問題が空です。",
        "card-" + partialCard.id + "-" + missingField,
      );
      return;
    }
    const cards = draft.cards.filter(hasCompleteCardPair).map((card) => ({
      id: card.id,
      term: normalizeTextLineEndings(card.term),
      definition: normalizeTextLineEndings(card.definition),
    }));
    if (cards.length === 0) {
      const firstCard = draft.cards[0];
      showEditorError(
        "少なくとも1枚のカードを入力してください。",
        firstCard ? "card-" + firstCard.id + "-term" : "set-title",
      );
      return;
    }
    if (cards.length > MAX_CARDS_PER_SET) {
      showEditorError(
        "1セットのカード上限は " + MAX_CARDS_PER_SET + " 枚です。",
        "set-title",
      );
      return;
    }

    const now = new Date().toISOString();
    const id = draft.setId ?? makeId("set");
    const existing = sets.find((set) => set.id === id);
    const contentChanged = existing
      ? !cardContentMatches(existing.cards, cards)
      : false;
    const saved: StudySet = {
      id,
      title,
      description: normalizeTextLineEndings(draft.description),
      cards,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastStudiedAt: contentChanged ? undefined : existing?.lastStudiedAt,
      lastScore: contentChanged ? undefined : existing?.lastScore,
      studyProgress: contentChanged ? undefined : existing?.studyProgress,
    };

    const totalCards =
      sets.reduce((total, set) => total + set.cards.length, 0) -
      (existing?.cards.length ?? 0) +
      cards.length;
    if (totalCards > MAX_TOTAL_STORED_CARDS) {
      showEditorError(
        "全セット合計のカード上限を超えるため保存できません。",
        "set-title",
      );
      return;
    }
    const nextSets = existing
      ? sets.map((set) => (set.id === id ? saved : set))
      : [saved, ...sets];
    try {
      serializeStudySets(nextSets);
    } catch {
      showEditorError(
        "安全な保存上限またはデータ形式を満たしていません。",
        "set-title",
      );
      return;
    }

    let browserBackupWarning = false;
    let folderWarning = false;
    try {
      const result = await persistSetsForExplicitAction(nextSets);
      browserBackupWarning = result.browserBackupWarning;
      folderWarning = result.folderWarning;
    } catch {
      showEditorError(
        "安全な保存先へ書き込めなかったため、変更は確定していません。保存先設定を確認してください。",
        "set-title",
      );
      return;
    }

    setSets(nextSets);
    setActiveSetId(id);
    let draftClearFailed = false;
    try {
      await clearBrowserDraft();
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // The IndexedDB draft has already been removed.
      }
    } catch {
      draftClearFailed = true;
    }
    setEditorError("");
    setEditorInvalidField("");
    setToast({
      message: draftClearFailed
        ? "セットは保存しましたが、下書きを削除できませんでした"
        : folderWarning
          ? "ブラウザーには保存しましたが、フォルダー同期に失敗しました"
          : browserBackupWarning
            ? "セットはフォルダーへ保存しました。ブラウザー予備保存は停止中です"
            : existing
              ? "変更を保存しました"
              : "学習セットを作成しました",
      tone:
        draftClearFailed || browserBackupWarning || folderWarning
          ? "warning"
          : "success",
    });

    if (startAfterSave) {
      setStudyRun(null);
      setStudyScreen("ready");
      goTo("study");
    } else {
      goTo("sets");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || explicitSaveInProgress) return;
    const id = deleteTarget.id;
    const remaining = sets.filter((set) => set.id !== id);
    const previousTombstones = new Set(deletedSetIdsRef.current);
    deletedSetIdsRef.current.add(id);
    try {
      const result = await persistSetsForExplicitAction(remaining);
      setSets(remaining);
      if (activeSetId === id) setActiveSetId(remaining[0]?.id ?? "");
      setDeleteTarget(null);
      setToast({
        message: result.folderWarning
          ? "学習セットはブラウザーから削除しましたが、フォルダー同期に失敗しました"
          : result.browserBackupWarning
            ? "学習セットを削除しました。ブラウザー予備保存は停止中です"
            : "学習セットを削除しました",
        tone:
          result.browserBackupWarning || result.folderWarning
            ? "warning"
            : "success",
      });
      if (remaining.length === 0) goTo("home");
    } catch {
      deletedSetIdsRef.current = previousTombstones;
      setToast({
        message: "安全な保存先へ反映できなかったため、削除を取り消しました",
        tone: "error",
      });
    }
  }

  function openStudy(setId: string) {
    const targetSet = sets.find((set) => set.id === setId);
    setActiveSetId(setId);
    setAllowParentheticalOmission(
      targetSet?.studyProgress?.allowParentheticalOmission ?? true,
    );
    setStudyBatchSize(
      targetSet?.studyProgress?.batchSize ?? DEFAULT_STUDY_BATCH_SIZE,
    );
    setStudyRun(null);
    setStudyScreen("ready");
    clearStudyInputs();
    goTo("study");
  }

  function commitStudyProgress(progress: StudyProgress) {
    setStudyRun(progress);
    setStudyScreen("active");
    setSets((current) =>
      current.map((set) =>
        set.id === activeSetId
          ? {
              ...set,
              lastStudiedAt: progress.updatedAt,
              studyProgress: progress,
            }
          : set,
      ),
    );
  }

  function clearStudyInputs() {
    setAnswer("");
    setRetypeAnswer("");
    setStudyMessage("");
  }

  function beginSession() {
    const sourceIds = (
      sets.find((set) => set.id === activeSetId)?.cards ?? []
    ).map((card) => card.id);
    const order = shuffleEnabled ? shuffleIds(sourceIds) : [...sourceIds];
    const progress = createStudyProgress(
      order,
      direction,
      shuffleEnabled,
      studyBatchSize,
      allowParentheticalOmission,
    );
    if (!progress) {
      setStudyMessage("学習できるカードがありません。");
      return;
    }
    clearStudyInputs();
    commitStudyProgress(progress);
  }

  function requestFreshSession() {
    if (
      hasResumableProgress(activeSet) &&
      !window.confirm(
        "保存されている途中進捗を破棄して、最初から学習しますか？",
      )
    ) {
      return;
    }
    beginSession();
  }

  function resumeSession() {
    if (
      !activeSet ||
      !isStudyProgressResumable(
        activeSet.studyProgress,
        activeSet.cards.map((card) => card.id),
      )
    ) {
      setStudyMessage("再開できる進捗がありません。");
      return;
    }
    setDirection(activeSet.studyProgress.direction);
    setShuffleEnabled(activeSet.studyProgress.shuffleEnabled);
    setAllowParentheticalOmission(
      activeSet.studyProgress.allowParentheticalOmission,
    );
    setStudyBatchSize(activeSet.studyProgress.batchSize);
    setStudyRun(activeSet.studyProgress);
    setStudyScreen("active");
    clearStudyInputs();
  }

  function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (!studyRun || studyRun.phase !== "question") return;
    const submittedAnswer = trimStudyAnswerLineEndWhitespace(answer);
    if (submittedAnswer !== answer) setAnswer(submittedAnswer);
    if (submittedAnswer.length === 0) {
      setStudyMessage("回答を入力してください。");
      return;
    }
    if (submittedAnswer.length > MAX_CARD_TEXT_LENGTH) {
      setStudyMessage("回答が安全な文字数上限を超えています。");
      return;
    }
    setStudyMessage("");
    if (
      matchesStudyAnswer(submittedAnswer, expectedAnswer, {
        allowParentheticalOmission: studyRun.allowParentheticalOmission,
      })
    ) {
      commitStudyProgress(recordCorrectStudyAnswer(studyRun));
      return;
    }
    setRetypeAnswer("");
    commitStudyProgress(recordWrongStudyAnswer(studyRun, submittedAnswer));
  }

  function submitRetype(event: FormEvent) {
    event.preventDefault();
    if (!studyRun || studyRun.phase !== "retype") return;
    const submittedRetype = trimStudyAnswerLineEndWhitespace(retypeAnswer);
    if (submittedRetype !== retypeAnswer) setRetypeAnswer(submittedRetype);
    if (submittedRetype.length > MAX_CARD_TEXT_LENGTH) {
      setStudyMessage("再入力が安全な文字数上限を超えています。");
      return;
    }
    if (
      !matchesStudyAnswer(submittedRetype, expectedAnswer, {
        allowParentheticalOmission: studyRun.allowParentheticalOmission,
      })
    ) {
      setStudyMessage(
        studyRun.allowParentheticalOmission
          ? "一致していません。半角カッコ内と各行末の余分な空白は省略できます。それ以外は大文字・小文字、空白、改行、記号まで正確に入力してください。"
          : "一致していません。半角カッコ内も含めて入力してください。各行末の余分な空白だけは除去し、それ以外は大文字・小文字、空白、改行、記号まで正確に入力してください。",
      );
      return;
    }
    setStudyMessage("");
    commitStudyProgress(recordSuccessfulRetype(studyRun));
  }

  function finishSession(progress: StudyProgress) {
    if (!activeSet) return;
    const score = getStudyScore(progress);
    const now = new Date().toISOString();
    setSets((current) =>
      current.map((set) =>
        set.id === activeSet.id
          ? {
              ...set,
              lastStudiedAt: now,
              lastScore: score,
              studyProgress: undefined,
            }
          : set,
      ),
    );
    setStudyRun({ ...progress, updatedAt: now });
    setStudyScreen("complete");
    clearStudyInputs();
  }

  function nextQuestion() {
    if (!studyRun || studyRun.phase !== "correct") return;
    const result = advanceStudyProgress(studyRun);
    if (result.status === "complete") {
      finishSession(result.progress);
      return;
    }
    clearStudyInputs();
    commitStudyProgress(result.progress);
  }

  function beginNextBatch() {
    if (!studyRun || studyRun.phase !== "batch-complete") return;
    clearStudyInputs();
    commitStudyProgress(startNextStudyBatch(studyRun));
  }

  function openFlashcards(setId: string) {
    const set = sets.find((item) => item.id === setId);
    if (!set) return;
    setActiveSetId(setId);
    setFlashOrder(set.cards.map((card) => card.id));
    setFlashIndex(0);
    setFlashFlipped(false);
    goTo("flashcards");
  }

  function moveFlash(offset: -1 | 1) {
    if (flashOrder.length === 0) return;
    setFlashIndex((index) => {
      const next = index + offset;
      if (next < 0) return flashOrder.length - 1;
      if (next >= flashOrder.length) return 0;
      return next;
    });
    setFlashFlipped(false);
  }

  function navigationActive(target: View): boolean {
    if (target === "home") return view === "home";
    if (target === "sets") {
      return ["sets", "study", "flashcards"].includes(view);
    }
    return false;
  }

  function renderHome() {
    const continueSet =
      [...sets]
        .filter((set) => studyActivityTimestamp(set) > 0)
        .sort(
          (a, b) => studyActivityTimestamp(b) - studyActivityTimestamp(a),
        )[0] ?? sets[0];
    const continueHasProgress = hasResumableProgress(continueSet);
    const continueMastered =
      continueHasProgress && continueSet?.studyProgress
        ? continueSet.studyProgress.batchStart +
          continueSet.studyProgress.masteredIds.length
        : 0;

    return (
      <>
        <header className="page-header">
          <div>
            <span className="eyebrow">LOCAL STUDY SPACE</span>
            <h1>とりあえず丸暗記学習。</h1>
            <p>解答を丸暗記し、正確に入力して知識を定着。</p>
          </div>
          <button
            className="primary-button"
            onClick={() => startNewSet()}
            type="button"
          >
            <Plus size={17} />
            セットを作成
          </button>
        </header>

        <section className="dashboard-stats" aria-label="学習状況">
          <article>
            <span>学習セット</span>
            <strong>{sets.length.toString().padStart(2, "0")}</strong>
            <small>この端末に保存</small>
          </article>
          <article>
            <span>カード総数</span>
            <strong>{totalCards.toLocaleString("ja-JP")}</strong>
            <small>すべて入力式で学習</small>
          </article>
          <article>
            <span>直近の平均</span>
            <strong>
              {averageScore}
              <em>%</em>
            </strong>
            <small>初回回答の正答率</small>
          </article>
        </section>

        <div className="dashboard-grid">
          <section className="continue-card">
            <div className="continue-top">
              <div>
                <span className="eyebrow">CONTINUE</span>
                <h2>{continueSet?.title ?? "最初のセットを作りましょう"}</h2>
                <p>{continueSet?.description}</p>
              </div>
              {continueHasProgress ? (
                <div className="score-box">
                  <strong>
                    {continueMastered}/{continueSet?.cards.length ?? 0}
                  </strong>
                  <span>進行中</span>
                </div>
              ) : continueSet?.lastScore !== undefined ? (
                <div className="score-box">
                  <strong>{continueSet.lastScore}%</strong>
                  <span>前回</span>
                </div>
              ) : null}
            </div>
            <div className="continue-meta">
              <span>
                <Layers3 size={15} /> {continueSet?.cards.length ?? 0} 枚
              </span>
              <span>
                <RotateCcw size={15} />{" "}
                {formatRelativeDate(continueSet?.lastStudiedAt)}
              </span>
            </div>
            <div className="continue-actions">
              <button
                className="primary-button"
                disabled={!continueSet}
                onClick={() => continueSet && openStudy(continueSet.id)}
                type="button"
              >
                <Play size={16} fill="currentColor" />
                {continueHasProgress ? "前回の続きから" : "入力学習を始める"}
              </button>
              <button
                className="secondary-button"
                disabled={!continueSet}
                onClick={() => continueSet && openFlashcards(continueSet.id)}
                type="button"
              >
                <BookOpen size={16} />
                カードで確認
              </button>
            </div>
          </section>

          <aside className="principle-card">
            <span className="eyebrow">EXACT MATCH</span>
            <ShieldCheck size={26} />
            <h2>カッコ省略を選べる</h2>
            <p>
              半角 (...)
              内を省略できるかは学習開始前に選べます。各行末の余分な空白は送信時に除去し、行頭・行中の空白、大文字・小文字、記号は厳密に区別します。
            </p>
            <code>TLS ≠ tls</code>
          </aside>
        </div>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR SETS</span>
              <h2>学習セット</h2>
            </div>
            <button className="text-button" onClick={openSets} type="button">
              すべて見る <ArrowRight size={15} />
            </button>
          </div>
          <div className="set-grid">
            {sets.slice(0, 3).map((set) => (
              <article className="set-card" key={set.id}>
                <div className="set-card-top">
                  <span>{set.cards.length} CARDS</span>
                  <button
                    aria-label={set.title + "を編集"}
                    className="icon-button"
                    onClick={() => editSet(set)}
                    type="button"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
                <h3>{set.title}</h3>
                <p>{set.description || "説明はありません。"}</p>
                <div className="set-card-footer">
                  <span>{formatRelativeDate(set.lastStudiedAt)}</span>
                  <button onClick={() => openStudy(set.id)} type="button">
                    学習する <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
            <button
              className="new-set-card"
              onClick={startImportingSet}
              type="button"
            >
              <Upload size={22} />
              <strong>ファイルから作成</strong>
              <span>Excel・CSV・TSV・TXT</span>
            </button>
          </div>
        </section>
      </>
    );
  }

  function renderSets() {
    return (
      <>
        <header className="page-header compact">
          <div>
            <span className="eyebrow">LIBRARY</span>
            <h1>学習セット</h1>
            <p>
              {sets.length}セット、{totalCards}枚をこの端末に保存しています。
            </p>
          </div>
          <div className="header-actions">
            <button
              className="secondary-button"
              onClick={startImportingSet}
              type="button"
            >
              <FileSpreadsheet size={17} />
              インポート
            </button>
            <button
              className="primary-button"
              onClick={() => startNewSet()}
              type="button"
            >
              <Plus size={17} />
              新規作成
            </button>
          </div>
        </header>

        <div className="library-toolbar">
          <label className="search-box">
            <Search size={17} />
            <span className="visually-hidden">セットを検索</span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="セット名や説明を検索"
              type="search"
              value={search}
            />
          </label>
          <span>{filteredSets.length} 件</span>
        </div>

        {filteredSets.length === 0 ? (
          <section className="empty-state">
            <CircleHelp size={28} />
            <h2>一致するセットがありません</h2>
            <p>検索語を変えるか、新しいセットを作成してください。</p>
          </section>
        ) : (
          <div className="library-list">
            {filteredSets.map((set) => {
              const resumable = hasResumableProgress(set);
              return (
                <article className="library-row" key={set.id}>
                  <div className="library-icon">
                    <Layers3 size={20} />
                  </div>
                  <div className="library-copy">
                    <div>
                      <h2>{set.title}</h2>
                      <span>{set.cards.length} 枚</span>
                    </div>
                    <p>{set.description || "説明はありません。"}</p>
                    <small>
                      最終学習 {formatRelativeDate(set.lastStudiedAt)}
                      {resumable
                        ? " · 進行中 " +
                          ((set.studyProgress?.batchStart ?? 0) +
                            (set.studyProgress?.masteredIds.length ?? 0)) +
                          "/" +
                          set.cards.length +
                          "枚"
                        : set.lastScore !== undefined
                          ? " · 前回 " + set.lastScore + "%"
                          : ""}
                    </small>
                  </div>
                  <div className="library-actions">
                    <button
                      className="primary-button small"
                      onClick={() => openStudy(set.id)}
                      type="button"
                    >
                      <Keyboard size={15} />
                      {resumable ? "続きから" : "入力学習"}
                    </button>
                    <button
                      aria-label={set.title + "をカードで確認"}
                      className="icon-button"
                      onClick={() => openFlashcards(set.id)}
                      title="フラッシュカード"
                      type="button"
                    >
                      <BookOpen size={17} />
                    </button>
                    <button
                      aria-label={set.title + "を編集"}
                      className="icon-button"
                      onClick={() => editSet(set)}
                      title="編集"
                      type="button"
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      aria-label={set.title + "を削除"}
                      className="icon-button danger"
                      onClick={() => setDeleteTarget(set)}
                      title="削除"
                      type="button"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function renderEditor() {
    const pageCount = Math.max(
      1,
      Math.ceil(draft.cards.length / EDITOR_PAGE_SIZE),
    );
    const safeEditorPage = Math.min(editorPage, pageCount - 1);
    const pageStart = safeEditorPage * EDITOR_PAGE_SIZE;
    const visibleCards = draft.cards.slice(
      pageStart,
      pageStart + EDITOR_PAGE_SIZE,
    );
    return (
      <>
        <header className="editor-header">
          <button className="back-button" onClick={openSets} type="button">
            <ArrowLeft size={17} />
            セット一覧
          </button>
          <div className="save-indicator" aria-live="polite">
            {draftStatus === "saving"
              ? "下書きを保存中…"
              : draftStatus === "error"
                ? "下書きを保存できません"
                : "下書き保存済み"}
          </div>
          <div className="header-actions">
            <button
              className="secondary-button"
              onClick={() => setImportOpen(true)}
              type="button"
            >
              <Upload size={16} />
              インポート
            </button>
            <button
              className="secondary-button"
              disabled={explicitSaveInProgress}
              onClick={() => void saveDraft(false)}
              type="button"
            >
              {explicitSaveInProgress ? "保存中…" : "保存"}
            </button>
            <button
              className="primary-button"
              disabled={explicitSaveInProgress}
              onClick={() => void saveDraft(true)}
              type="button"
            >
              {explicitSaveInProgress ? "保存中…" : "保存して学習"}
              <ArrowRight size={16} />
            </button>
          </div>
        </header>

        <section className="editor-intro">
          <span className="eyebrow">
            {draft.setId ? "EDIT SET" : "CREATE SET"}
          </span>
          <h1>{draft.setId ? "学習セットを編集" : "新しい学習セット"}</h1>
          <p>
            各文字をそのまま保存します。HTMLや記号として実行・変換されることはありません。
          </p>
        </section>

        <section className="set-details">
          <label>
            <span>
              セット名 <b>必須</b>
            </span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              aria-describedby={
                editorInvalidField === "set-title" ? "editor-error" : undefined
              }
              aria-invalid={editorInvalidField === "set-title"}
              id="set-title"
              maxLength={MAX_SET_TITLE_LENGTH}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  title: event.target.value,
                }));
                if (editorInvalidField === "set-title") {
                  setEditorInvalidField("");
                  setEditorError("");
                }
              }}
              placeholder="例：CompTIA Security+ 用語学習"
              spellCheck={false}
              type="text"
              value={draft.title}
            />
            <small>
              {draft.title.length} / {MAX_SET_TITLE_LENGTH}
            </small>
          </label>
          <label>
            <span>
              説明 <em>任意</em>
            </span>
            <textarea
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              id="set-description"
              maxLength={MAX_SET_DESCRIPTION_LENGTH}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="このセットの目的や範囲"
              spellCheck={false}
              value={draft.description}
            />
            <small>
              {draft.description.length} / {MAX_SET_DESCRIPTION_LENGTH}
            </small>
          </label>
        </section>

        {editorError && (
          <p className="editor-error" id="editor-error" role="alert">
            <AlertTriangle size={16} />
            {editorError}
          </p>
        )}

        <div className="card-editor-heading">
          <div>
            <span className="eyebrow">CARDS</span>
            <h2>{draft.cards.length} 枚</h2>
          </div>
          <p>学習時は「問題／定義」を見て「正解／用語」を入力します。</p>
        </div>

        {pageCount > 1 && (
          <nav className="editor-pagination" aria-label="カード編集ページ">
            <button
              className="secondary-button"
              disabled={safeEditorPage === 0}
              onClick={() => setEditorPage((page) => Math.max(0, page - 1))}
              type="button"
            >
              前の {EDITOR_PAGE_SIZE} 枚
            </button>
            <span role="status">
              {pageStart + 1}〜
              {Math.min(pageStart + visibleCards.length, draft.cards.length)} /{" "}
              {draft.cards.length} 枚 （{safeEditorPage + 1} / {pageCount}{" "}
              ページ）
            </span>
            <button
              className="secondary-button"
              disabled={safeEditorPage >= pageCount - 1}
              onClick={() =>
                setEditorPage((page) => Math.min(pageCount - 1, page + 1))
              }
              type="button"
            >
              次の {EDITOR_PAGE_SIZE} 枚
            </button>
          </nav>
        )}

        <div className="card-editor-list">
          {visibleCards.map((card, localIndex) => {
            const index = pageStart + localIndex;
            return (
              <article className="card-editor" key={card.id}>
                <header>
                  <div>
                    <strong>{(index + 1).toString().padStart(2, "0")}</strong>
                  </div>
                  <div className="card-row-actions">
                    <button
                      aria-label={"カード " + (index + 1) + " を上へ"}
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => moveDraftCard(index, -1)}
                      type="button"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      aria-label={"カード " + (index + 1) + " を下へ"}
                      className="icon-button"
                      disabled={index === draft.cards.length - 1}
                      onClick={() => moveDraftCard(index, 1)}
                      type="button"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      aria-label={"カード " + (index + 1) + " の表裏を交換"}
                      className="icon-button"
                      onClick={() => swapDraftCard(card.id)}
                      title="表裏を交換"
                      type="button"
                    >
                      <Repeat2 size={15} />
                    </button>
                    <button
                      aria-label={"カード " + (index + 1) + " を削除"}
                      className="icon-button danger"
                      onClick={() => removeDraftCard(card.id)}
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </header>
                <div className="card-editor-fields">
                  <label>
                    <span>正解／用語</span>
                    <textarea
                      autoCapitalize="none"
                      autoComplete="off"
                      autoCorrect="off"
                      aria-describedby={
                        editorInvalidField === "card-" + card.id + "-term"
                          ? "editor-error"
                          : undefined
                      }
                      aria-invalid={
                        editorInvalidField === "card-" + card.id + "-term"
                      }
                      id={"card-" + card.id + "-term"}
                      maxLength={MAX_CARD_TEXT_LENGTH}
                      onChange={(event) =>
                        updateDraftCard(
                          index,
                          card.id,
                          "term",
                          event.target.value,
                        )
                      }
                      placeholder="例：TLS"
                      spellCheck={false}
                      value={card.term}
                    />
                  </label>
                  <label>
                    <span>問題／定義</span>
                    <textarea
                      autoCapitalize="none"
                      autoComplete="off"
                      autoCorrect="off"
                      aria-describedby={
                        editorInvalidField === "card-" + card.id + "-definition"
                          ? "editor-error"
                          : undefined
                      }
                      aria-invalid={
                        editorInvalidField === "card-" + card.id + "-definition"
                      }
                      id={"card-" + card.id + "-definition"}
                      maxLength={MAX_CARD_TEXT_LENGTH}
                      onChange={(event) =>
                        updateDraftCard(
                          index,
                          card.id,
                          "definition",
                          event.target.value,
                        )
                      }
                      placeholder="例：通信中のデータを暗号化するプロトコルは？"
                      spellCheck={false}
                      value={card.definition}
                    />
                  </label>
                </div>
              </article>
            );
          })}
        </div>

        {removedDraftCard && (
          <div className="editor-undo" role="status">
            <span>カードを編集下書きから削除しました。</span>
            <button
              className="text-button"
              onClick={undoRemoveDraftCard}
              type="button"
            >
              元に戻す
            </button>
          </div>
        )}

        <button
          className="add-card-button"
          disabled={draft.cards.length >= MAX_CARDS_PER_SET}
          onClick={addDraftCard}
          type="button"
        >
          <Plus size={18} />
          カードを追加
        </button>

        <div className="editor-bottom-actions">
          <button
            className="secondary-button"
            disabled={explicitSaveInProgress}
            onClick={() => void saveDraft(false)}
            type="button"
          >
            {explicitSaveInProgress ? "保存中…" : "セットを保存"}
          </button>
          <button
            className="primary-button"
            disabled={explicitSaveInProgress}
            onClick={() => void saveDraft(true)}
            type="button"
          >
            {explicitSaveInProgress ? "保存中…" : "保存して学習を始める"}
            <ArrowRight size={16} />
          </button>
        </div>
      </>
    );
  }

  function renderStudyReady() {
    if (!activeSet) return null;
    const savedProgress =
      activeSet.studyProgress &&
      isStudyProgressResumable(
        activeSet.studyProgress,
        activeSet.cards.map((card) => card.id),
      )
        ? activeSet.studyProgress
        : undefined;
    const savedMastered = savedProgress
      ? savedProgress.batchStart + savedProgress.masteredIds.length
      : 0;
    const savedBatchSize = savedProgress?.batchSize ?? studyBatchSize;
    const savedBatchNumber = savedProgress
      ? Math.floor(savedProgress.batchStart / savedBatchSize) + 1
      : 1;
    const totalBatchCount = Math.max(
      Math.ceil(activeSet.cards.length / savedBatchSize),
      1,
    );

    return (
      <section className="study-ready">
        <div className="study-ready-icon">
          <Keyboard size={28} />
        </div>
        <span className="eyebrow">TYPE ANSWERS</span>
        <h1>{activeSet.title}</h1>
        <p>
          全{activeSet.cards.length}枚。1グループの問題数を選んで学習します。
        </p>

        {savedProgress && (
          <div className="resume-study-card">
            <div>
              <span className="eyebrow">SAVED PROGRESS</span>
              <strong>前回の続きから再開できます</strong>
              <small>
                {savedProgress.batchSize}問単位 · 全体 {savedMastered}/
                {activeSet.cards.length}枚習得 · グループ {savedBatchNumber}/
                {totalBatchCount} · カッコ省略
                {savedProgress.allowParentheticalOmission ? "可" : "不可"}
              </small>
            </div>
            <button
              className="primary-button"
              onClick={resumeSession}
              type="button"
            >
              <Play size={16} fill="currentColor" />
              続きから再開
            </button>
          </div>
        )}

        <fieldset className="study-setting">
          <legend>
            {savedProgress ? "最初から始める場合の出題方向" : "出題の向き"}
          </legend>
          <label
            className={direction === "definition-to-term" ? "selected" : ""}
          >
            <input
              checked={direction === "definition-to-term"}
              name="direction"
              onChange={() => setDirection("definition-to-term")}
              type="radio"
            />
            <span>
              <b>問題 → 正解</b>
              <small>日本語の説明を見て用語を入力</small>
            </span>
          </label>
          <label
            className={direction === "term-to-definition" ? "selected" : ""}
          >
            <input
              checked={direction === "term-to-definition"}
              name="direction"
              onChange={() => setDirection("term-to-definition")}
              type="radio"
            />
            <span>
              <b>用語 → 定義</b>
              <small>用語を見て説明を入力</small>
            </span>
          </label>
        </fieldset>

        <fieldset className="batch-size-setting">
          <legend>
            {savedProgress
              ? "最初から始める場合の1グループの問題数"
              : "1グループの問題数"}
          </legend>
          <div className="batch-size-options">
            {STUDY_BATCH_OPTIONS.map((size) => (
              <label
                className={studyBatchSize === size ? "selected" : ""}
                key={size}
              >
                <input
                  checked={studyBatchSize === size}
                  name="study-batch-size"
                  onChange={() => setStudyBatchSize(size)}
                  type="radio"
                  value={size}
                />
                <span>
                  <b>{size}</b>
                  <small>問</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="shuffle-setting">
          <input
            checked={shuffleEnabled}
            onChange={(event) => setShuffleEnabled(event.target.checked)}
            type="checkbox"
          />
          <Shuffle size={17} />
          <span>
            <b>順番をシャッフル</b>
            <small>開始時に一度だけ順番を決め、再開時も維持</small>
          </span>
        </label>

        <label className="shuffle-setting parenthesis-setting">
          <input
            checked={allowParentheticalOmission}
            onChange={(event) =>
              setAllowParentheticalOmission(event.target.checked)
            }
            type="checkbox"
          />
          <LockKeyhole size={17} />
          <span>
            <b>半角カッコ内の省略を許可</b>
            <small>オフの場合は、解答の (...) 内も文字どおり入力必須</small>
          </span>
        </label>

        <div className="strict-rule">
          <LockKeyhole size={17} />
          <p>
            <strong>
              {allowParentheticalOmission
                ? "半角カッコ内は省略可"
                : "半角カッコ内も入力必須"}
            </strong>
            {allowParentheticalOmission
              ? "対応の取れた半角 (...) 内は入力しなくても正解です。"
              : "解答の半角 (...) 内を含め、すべての文字を入力した場合だけ正解です。"}
            各行末の余分な空白だけは送信時に除去し、それ以外の大文字・小文字、行頭・行中の空白、改行、記号はすべて区別します。
          </p>
        </div>

        <div className="strict-rule batch-rule">
          <Layers3 size={17} />
          <p>
            <strong>選択した{studyBatchSize}問を完全習得してから次へ</strong>
            間違えたカードは正答を再入力した後、このグループ内で再出題されます。自力で正解するまで次のグループは開きません。
          </p>
        </div>

        <button
          className={
            savedProgress ? "secondary-button large" : "primary-button large"
          }
          onClick={requestFreshSession}
          type="button"
        >
          {savedProgress ? (
            <RotateCcw size={17} />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
          {savedProgress ? "進捗を破棄して最初から" : "学習を開始"}
        </button>

        <StudyMessage message={studyMessage} />
      </section>
    );
  }

  function renderStudy() {
    if (!activeSet) return null;
    if (studyPhase === "ready") return renderStudyReady();

    if (studyPhase === "complete") {
      if (!studyRun) return renderStudyReady();
      const score = getStudyScore(studyRun);
      return (
        <section className="study-complete">
          <CheckCircle2 size={38} />
          <span className="eyebrow">SET MASTERED</span>
          <h1>セット全体を習得しました</h1>
          <p>{activeSet.title}</p>
          <div className="result-score">
            <strong>
              {score}
              <span>%</span>
            </strong>
            <small>各カードの初回回答での正答率</small>
          </div>
          <dl className="result-stats">
            <div>
              <dt>一度で正解</dt>
              <dd>{studyRun.firstTryCorrectIds.length}</dd>
            </div>
            <div>
              <dt>再出題で習得</dt>
              <dd>{studyRun.missedIds.length}</dd>
            </div>
            <div>
              <dt>習得した枚数</dt>
              <dd>{studyRun.courseOrder.length}</dd>
            </div>
          </dl>
          <div className="result-actions">
            <button
              className="secondary-button"
              onClick={beginSession}
              type="button"
            >
              <RotateCcw size={16} />
              最初からもう一度
            </button>
            <button className="text-button" onClick={openSets} type="button">
              セット一覧へ
            </button>
          </div>
        </section>
      );
    }

    if (!studyRun) return renderStudyReady();

    if (studyPhase === "batch-complete") {
      const completedBatch = getStudyBatchIds(studyRun);
      const batchNumber =
        Math.floor(studyRun.batchStart / studyRun.batchSize) + 1;
      const totalBatchCount = Math.ceil(
        studyRun.courseOrder.length / studyRun.batchSize,
      );
      const masteredTotal = studyRun.batchStart + completedBatch.length;
      const nextBatchSize = Math.min(
        studyRun.batchSize,
        studyRun.courseOrder.length - masteredTotal,
      );

      return (
        <section className="study-complete batch-complete-card">
          <CheckCircle2 size={38} />
          <span className="eyebrow">GROUP {batchNumber} MASTERED</span>
          <h1>{completedBatch.length}問すべて正解しました</h1>
          <p>
            全体 {masteredTotal}/{studyRun.courseOrder.length}枚習得 · グループ{" "}
            {batchNumber}/{totalBatchCount}
          </p>
          <div className="batch-unlock">
            <strong>次の{nextBatchSize}問を学習できます</strong>
            <span>ここまでの進捗は自動保存されています。</span>
          </div>
          <div className="result-actions">
            <button
              className="primary-button"
              onClick={beginNextBatch}
              type="button"
            >
              次の{nextBatchSize}問へ
              <ArrowRight size={16} />
            </button>
            <button className="text-button" onClick={openSets} type="button">
              いったん終了
            </button>
          </div>
        </section>
      );
    }

    if (!currentStudyCard) return renderStudyReady();

    const batchIds = getStudyBatchIds(studyRun);
    const masteredInBatch = batchIds.filter((cardId) =>
      studyRun.masteredIds.includes(cardId),
    ).length;
    const retryRemaining = batchIds.filter(
      (cardId) =>
        studyRun.missedIds.includes(cardId) &&
        !studyRun.masteredIds.includes(cardId),
    ).length;
    const totalBatchCount = Math.ceil(
      studyRun.courseOrder.length / studyRun.batchSize,
    );
    const batchNumber =
      Math.floor(studyRun.batchStart / studyRun.batchSize) + 1;
    const batchProgress =
      (masteredInBatch / Math.max(batchIds.length, 1)) * 100;
    const firstTryCorrectInBatch = batchIds.filter((cardId) =>
      studyRun.firstTryCorrectIds.includes(cardId),
    ).length;
    const attemptedInBatch = batchIds.filter(
      (cardId) =>
        studyRun.firstTryCorrectIds.includes(cardId) ||
        studyRun.missedIds.includes(cardId),
    ).length;
    const firstTryRate =
      attemptedInBatch > 0
        ? Math.round((firstTryCorrectInBatch / attemptedInBatch) * 100)
        : 0;
    const overallMastered = studyRun.batchStart + masteredInBatch;
    const atRoundEnd = studyRun.roundIndex + 1 >= studyRun.roundOrder.length;
    let advanceLabel = "次の問題";
    if (atRoundEnd && studyRun.retryIds.length > 0) {
      advanceLabel = "間違えた問題へ";
    } else if (atRoundEnd && masteredInBatch >= batchIds.length) {
      advanceLabel =
        studyRun.batchStart + batchIds.length < studyRun.courseOrder.length
          ? "グループ完了へ"
          : "結果を見る";
    } else if (atRoundEnd) {
      advanceLabel = "確認を続ける";
    }

    return (
      <div className="study-workspace">
        <div className="study-progress-header">
          <div>
            <button className="back-button" onClick={openSets} type="button">
              <X size={16} />
              学習を終了
            </button>
            <span>
              {activeSet.title} · グループ {batchNumber}/{totalBatchCount}
            </span>
          </div>
          <strong>
            {masteredInBatch.toString().padStart(2, "0")}
            <small> / {batchIds.length.toString().padStart(2, "0")} 習得</small>
          </strong>
        </div>
        <div
          aria-label={
            "現在のグループの習得進捗 " + Math.round(batchProgress) + "%"
          }
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(batchProgress)}
          className="study-progress-track"
          role="progressbar"
        >
          <span style={{ width: batchProgress + "%" }} />
        </div>

        <div className="study-main-grid">
          <section
            className={`question-panel${
              studyPhase === "retype" ? " is-retype" : ""
            }`}
          >
            <div className="question-meta">
              <span className="eyebrow">
                {activeStudyDirection === "definition-to-term"
                  ? "QUESTION"
                  : "TERM"}
              </span>
              <span>
                コードエディター · 大文字・小文字／記号を区別 ·
                行末空白は自動除去 · 半角 (...) 内は
                {studyRun.allowParentheticalOmission ? "省略可" : "入力必須"}
              </span>
            </div>
            {studyPhase !== "retype" && (
              <div className="question-copy">{currentPrompt}</div>
            )}

            {studyPhase === "question" && (
              <form
                className="study-answer-form"
                onSubmit={submitAnswer}
                ref={answerFormRef}
              >
                <div className="code-answer-label" id="study-answer-label">
                  {activeStudyDirection === "definition-to-term"
                    ? "正解／用語を入力"
                    : "定義を入力"}
                </div>
                <CodeAnswerEditor
                  ariaLabelledBy="study-answer-label"
                  describedBy="study-answer-shortcut"
                  id="study-answer"
                  language={codeLanguage}
                  maxLength={MAX_CARD_TEXT_LENGTH}
                  onChange={setAnswer}
                  onLanguageChange={setCodeLanguage}
                  onSubmitShortcut={() =>
                    answerFormRef.current?.requestSubmit()
                  }
                  placeholder="複数行のコードや答えを正確に入力…"
                  ref={answerInputRef}
                  value={answer}
                />
                <div className="study-form-footer">
                  <span id="study-answer-shortcut">
                    <kbd>Ctrl / ⌘ + Enter</kbd> で答え合わせ
                  </span>
                  <button
                    aria-keyshortcuts="Control+Enter Meta+Enter"
                    className="primary-button"
                    disabled={answer.length === 0}
                    type="submit"
                  >
                    答え合わせ
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            )}

            {studyPhase === "retype" && (
              <>
                <div className="retype-left">
                  <div className="question-copy">{currentPrompt}</div>
                  <div className="retype-feedback">
                    <div className="wrong-summary" role="alert">
                      <XCircle size={20} />
                      <div>
                        <strong>不正解です</strong>
                        <span>あなたの回答</span>
                        <code>{studyRun.wrongAnswer}</code>
                      </div>
                    </div>
                    <div className="correct-answer-box">
                      <span>
                        <Check size={15} /> 正しい解答
                      </span>
                      <strong>{expectedAnswer}</strong>
                      <small>
                        {studyRun.allowParentheticalOmission
                          ? "半角 (...) 内は省略可。"
                          : "半角 (...) 内も入力必須。"}
                        各行末の余分な空白は自動除去します。
                      </small>
                    </div>
                  </div>
                </div>
                <form
                  className="study-answer-form retype-form"
                  onSubmit={submitRetype}
                  ref={retypeFormRef}
                >
                  <div className="code-answer-label" id="study-retype-label">
                    正しい解答を再入力
                  </div>
                  <CodeAnswerEditor
                    ariaLabelledBy="study-retype-label"
                    describedBy="study-retype-shortcut"
                    id="study-retype"
                    language={codeLanguage}
                    maxLength={MAX_CARD_TEXT_LENGTH}
                    onChange={setRetypeAnswer}
                    onLanguageChange={setCodeLanguage}
                    onSubmitShortcut={() =>
                      retypeFormRef.current?.requestSubmit()
                    }
                    placeholder={
                      studyRun.allowParentheticalOmission
                        ? "正しいコードを再入力（カッコ内は省略可）…"
                        : "正しいコードをカッコ内も含めて再入力…"
                    }
                    ref={retypeInputRef}
                    value={retypeAnswer}
                  />
                  <div className="study-form-footer">
                    <span id="study-retype-shortcut">
                      一致するまで次へ進めません（<kbd>Ctrl / ⌘ + Enter</kbd>{" "}
                      で確認）
                    </span>
                    <button
                      aria-keyshortcuts="Control+Enter Meta+Enter"
                      className="primary-button"
                      disabled={retypeAnswer.length === 0}
                      type="submit"
                    >
                      再入力を確認
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </form>
              </>
            )}

            {studyPhase === "correct" && (
              <div className="correct-state" aria-live="polite">
                <div>
                  <CheckCircle2 size={23} />
                  <span>
                    <strong>
                      {studyRun.resolvedByRetype
                        ? "再入力できました"
                        : "正解です"}
                    </strong>
                    <small>
                      {studyRun.resolvedByRetype
                        ? "このカードは現在のグループ内で再出題されます。"
                        : expectedAnswer}
                    </small>
                  </span>
                </div>
                <div className="advance-control">
                  <span>
                    <kbd>Enter</kbd> で次へ
                  </span>
                  <button
                    aria-keyshortcuts="Enter"
                    className="primary-button"
                    onClick={nextQuestion}
                    ref={nextQuestionButtonRef}
                    type="button"
                  >
                    {advanceLabel}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            <StudyMessage message={studyMessage} />
          </section>

          <aside className="session-sidebar">
            <span className="eyebrow">CURRENT GROUP</span>
            <div className="mini-score">
              <strong>{firstTryRate}%</strong>
              <span>初回正答率</span>
            </div>
            <dl>
              <div>
                <dt>現在の習得</dt>
                <dd className="good">
                  {masteredInBatch}/{batchIds.length}
                </dd>
              </div>
              <div>
                <dt>要再確認</dt>
                <dd className="bad">{retryRemaining}</dd>
              </div>
              <div>
                <dt>このグループの残り</dt>
                <dd>{Math.max(batchIds.length - masteredInBatch, 0)}</dd>
              </div>
              <div>
                <dt>セット全体</dt>
                <dd>
                  {overallMastered}/{studyRun.courseOrder.length}
                </dd>
              </div>
            </dl>
            <p>
              <ShieldCheck size={15} />
              現在の{studyRun.batchSize}
              問をすべて自力で正解するまで、次のグループは出題されません。
            </p>
            <p>
              不正解の試行 {studyRun.wrongAttemptCount}{" "}
              回。進捗は回答ごとに自動保存されます。
            </p>
          </aside>
        </div>
      </div>
    );
  }

  function renderFlashcards() {
    if (!activeSet || !currentFlashCard) return null;
    return (
      <section className="flashcard-view">
        <header>
          <button className="back-button" onClick={openSets} type="button">
            <ArrowLeft size={16} />
            セット一覧
          </button>
          <div>
            <span className="eyebrow">FLASHCARDS</span>
            <h1>{activeSet.title}</h1>
          </div>
          <button
            className="secondary-button"
            onClick={() => openStudy(activeSet.id)}
            type="button"
          >
            <Keyboard size={16} />
            入力学習へ
          </button>
        </header>

        <button
          aria-label={
            flashFlipped
              ? "定義を表示中。押すと用語を表示"
              : "用語を表示中。押すと定義を表示"
          }
          className="flashcard"
          onClick={() => setFlashFlipped((flipped) => !flipped)}
          type="button"
        >
          <span>{flashFlipped ? "DEFINITION / 問題" : "TERM / 正解"}</span>
          <strong>
            {flashFlipped ? currentFlashCard.definition : currentFlashCard.term}
          </strong>
          <small>クリックまたは Space で裏返す</small>
        </button>

        <div className="flash-controls">
          <button
            aria-label="前のカード"
            className="icon-button large"
            onClick={() => moveFlash(-1)}
            type="button"
          >
            <ChevronLeft size={21} />
          </button>
          <strong>
            {flashIndex + 1} <span>/ {flashOrder.length}</span>
          </strong>
          <button
            aria-label="次のカード"
            className="icon-button large"
            onClick={() => moveFlash(1)}
            type="button"
          >
            <ChevronRight size={21} />
          </button>
        </div>

        <button
          className="shuffle-button"
          onClick={() => {
            setFlashOrder((order) => shuffleIds(order));
            setFlashIndex(0);
            setFlashFlipped(false);
          }}
          type="button"
        >
          <Shuffle size={16} />
          シャッフル
        </button>
      </section>
    );
  }

  if (!hydrated) {
    return (
      <main aria-busy="true" className="app-loading">
        <div aria-hidden="true" className="loading-brand">
          <span className="brand-mark">R</span>
          <span>TOTAL RECALL</span>
        </div>
        <span className="visually-hidden" role="status">
          保存した学習セットを読み込んでいます
        </span>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button
          aria-label="TOTAL RECALL ホームへ戻る"
          className="brand"
          onClick={openHome}
          type="button"
        >
          <span className="brand-mark">R</span>
          <span>TOTAL RECALL</span>
        </button>
        <nav className="main-nav" aria-label="メインナビゲーション">
          <button
            aria-current={navigationActive("home") ? "page" : undefined}
            className={"nav-item" + (navigationActive("home") ? " active" : "")}
            onClick={openHome}
            type="button"
          >
            <Home size={18} />
            ホーム
          </button>
          <button
            aria-current={navigationActive("sets") ? "page" : undefined}
            className={"nav-item" + (navigationActive("sets") ? " active" : "")}
            onClick={openSets}
            type="button"
          >
            <Library size={18} />
            学習セット
          </button>
          <button
            aria-current={view === "editor" ? "page" : undefined}
            className={"nav-item" + (view === "editor" ? " active" : "")}
            onClick={() => startNewSet()}
            type="button"
          >
            <Plus size={18} />
            新規作成
          </button>
        </nav>
        <div className="sidebar-divider" />
        <button
          className="sidebar-import"
          onClick={startImportingSet}
          type="button"
        >
          <FileSpreadsheet size={17} />
          <span>
            <b>ファイル取込</b>
            <small>Excel / Text</small>
          </span>
        </button>
        <button
          aria-label="保存先設定を開く"
          className="sidebar-note storage-note"
          onClick={() => setStorageDialogOpen(true)}
          type="button"
        >
          <LockKeyhole size={16} />
          <div>
            <strong>
              {storageMode === "folder" || storageMode === "blocked"
                ? folderName
                : "ローカル保存"}
            </strong>
            <p>
              {browserStorageBlocked
                ? storageMode === "folder"
                  ? "フォルダー保存中／予備保存停止"
                  : "ブラウザー保存を保護停止"
                : storageMode === "folder"
                  ? storageWriteState === "saving"
                    ? "プロジェクトへ保存中…"
                    : storageWriteState === "error"
                      ? "保存エラー。設定を確認"
                      : "プロジェクトにも保存済み"
                  : storageMode === "permission"
                    ? "フォルダーの再許可が必要"
                    : storageMode === "blocked"
                      ? "既存ファイルを保護して停止"
                      : "ブラウザー内に保存中"}
            </p>
          </div>
        </button>
      </aside>

      <section className={"content view-" + view}>
        {view === "home" && renderHome()}
        {view === "sets" && renderSets()}
        {view === "editor" && renderEditor()}
        {view === "study" && renderStudy()}
        {view === "flashcards" && renderFlashcards()}
      </section>

      {importOpen && (
        <ImportDialog
          existingCards={draft.cards}
          onClose={() => setImportOpen(false)}
          onImport={importCards}
          open
        />
      )}

      {storageDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="storage-title"
            aria-modal="true"
            className="storage-dialog"
            ref={storageDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header>
              <div className="storage-icon">
                <LockKeyhole size={21} />
              </div>
              <button
                aria-label="保存先設定を閉じる"
                className="icon-button"
                data-dialog-initial
                onClick={() => setStorageDialogOpen(false)}
                type="button"
              >
                <X size={17} />
              </button>
            </header>
            <span className="eyebrow">LOCAL STORAGE</span>
            <h2 id="storage-title">セットデータの保存先</h2>
            <p>
              ブラウザー内の予備コピーに加え、選択したプロジェクトフォルダー内へJSONファイルを保存できます。
            </p>

            {browserStorageBlocked && (
              <p className="inline-error" role="alert">
                <AlertTriangle size={15} />
                ブラウザー保存の破損または競合を検知し、自動上書きを停止しています。現在表示中の内容を確認してから復旧してください。
              </p>
            )}

            <div className={"storage-status " + storageMode}>
              <strong>
                {browserStorageBlocked && storageMode === "browser"
                  ? "ブラウザー保存を保護停止中"
                  : storageMode === "folder"
                    ? "プロジェクトフォルダーへ保存中"
                    : storageMode === "permission"
                      ? "フォルダーへの再許可が必要"
                      : storageMode === "unsupported"
                        ? "このブラウザーはフォルダー保存に未対応"
                        : storageMode === "blocked"
                          ? "既存の sets.json を保護して停止中"
                          : "ブラウザー内へ保存中"}
              </strong>
              <code>
                {storageMode === "folder" ||
                storageMode === "permission" ||
                storageMode === "blocked"
                  ? folderName + "/recall-data/sets.json"
                  : "Browser storage / IndexedDB"}
              </code>
              <small>
                {browserStorageBlocked
                  ? storageMode === "folder"
                    ? "フォルダー同期は継続していますが、ブラウザー内の予備コピーは競合保護のため停止中です。"
                    : "検出した元データは上書きしていません。内容を確認後、明示的に復旧してください。"
                  : storageMode === "folder"
                    ? storageWriteState === "saving"
                      ? "最新データを書き込んでいます。"
                      : storageWriteState === "error"
                        ? "書き込みに失敗しました。フォルダーの権限を確認してください。"
                        : "最新データと同期済みです。"
                    : storageMode === "blocked"
                      ? "壊れたデータや読み取りエラーを上書きしません。sets.jsonを確認するか、別の保存先を選んでください。"
                      : "プロジェクト保存を設定しても、ブラウザー内の予備コピーは維持されます。"}
              </small>
              {(storageUsage.usage !== undefined ||
                storageUsage.quota !== undefined) && (
                <small role="status">
                  ブラウザー使用量:{" "}
                  {storageUsage.usage === undefined
                    ? "不明"
                    : (storageUsage.usage / 1_048_576).toFixed(1) + " MiB"}
                  {storageUsage.quota === undefined
                    ? ""
                    : " / " +
                      (storageUsage.quota / 1_048_576).toFixed(1) +
                      " MiB"}
                  {storageUsage.persisted === undefined
                    ? ""
                    : storageUsage.persisted
                      ? "・永続ストレージ"
                      : "・標準ストレージ"}
                </small>
              )}
            </div>
            {storageUsage.persisted === false && (
              <button
                className="text-button storage-persistence-action"
                disabled={storageTransitioning || explicitSaveInProgress}
                onClick={() => void makeBrowserStoragePersistent()}
                type="button"
              >
                ブラウザーの永続ストレージを要求
              </button>
            )}
            <p className="storage-guidance">
              フォルダー保存は従来どおり任意の場所を選べます。安全性を高めるため、他の重要ファイルを含まないTOTAL
              RECALL専用フォルダーの利用を推奨します。
            </p>

            {browserBackupSummary.count > 0 && (
              <p className="storage-backup-summary">
                ブラウザー予備コピー: {browserBackupSummary.count} 世代
                {browserBackupSummary.latestSavedAt
                  ? "（最新: " +
                    new Intl.DateTimeFormat("ja-JP", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(browserBackupSummary.latestSavedAt)) +
                    "）"
                  : ""}
              </p>
            )}

            <input
              accept="application/json,.json"
              hidden
              onChange={(event) => void handleBackupFileSelection(event)}
              ref={backupFileInputRef}
              type="file"
            />

            <div className="storage-actions">
              <button
                className="secondary-button"
                disabled={storageTransitioning || explicitSaveInProgress}
                onClick={exportRecallBackupFile}
                type="button"
              >
                <Download aria-hidden="true" size={15} />
                バックアップを書き出す
              </button>
              <button
                className="secondary-button"
                disabled={storageTransitioning || explicitSaveInProgress}
                onClick={() => backupFileInputRef.current?.click()}
                type="button"
              >
                <Upload aria-hidden="true" size={15} />
                バックアップから復元
              </button>
              {browserBackupSummary.count > 0 && (
                <button
                  className="secondary-button"
                  disabled={storageTransitioning || explicitSaveInProgress}
                  onClick={() => void restoreLatestBrowserBackup()}
                  type="button"
                >
                  最新の予備コピーを復元
                </button>
              )}
              {browserStorageBlocked && (
                <button
                  className="secondary-button"
                  disabled={storageTransitioning || explicitSaveInProgress}
                  onClick={() => void recoverBrowserStorage()}
                  type="button"
                >
                  元データを隔離して復旧
                </button>
              )}
              {(storageMode === "folder" || storageMode === "blocked") && (
                <button
                  className="text-button danger-text"
                  disabled={
                    storageTransitioning ||
                    storageWriteState === "saving" ||
                    explicitSaveInProgress
                  }
                  onClick={() => void disconnectProjectFolder()}
                  type="button"
                >
                  フォルダー保存を解除
                </button>
              )}
              {storageMode !== "unsupported" && (
                <button
                  className="secondary-button"
                  disabled={
                    storageTransitioning ||
                    storageWriteState === "saving" ||
                    explicitSaveInProgress
                  }
                  onClick={() =>
                    void connectProjectFolder(storageMode === "permission")
                  }
                  type="button"
                >
                  {storageMode === "folder"
                    ? "保存先を変更"
                    : storageMode === "permission"
                      ? "アクセスを再許可"
                      : storageMode === "blocked"
                        ? "別の保存先を選択"
                        : "保存先フォルダーを選択"}
                </button>
              )}
              <button
                className="primary-button"
                onClick={() => setStorageDialogOpen(false)}
                type="button"
              >
                完了
              </button>
            </div>
          </section>
        </div>
      )}

      {backupRestoreCandidate && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="backup-restore-title"
            aria-modal="true"
            className="confirm-dialog"
            ref={backupRestoreDialogRef}
            role="alertdialog"
            tabIndex={-1}
          >
            <div className="confirm-icon">
              <RotateCcw size={22} />
            </div>
            <h2 id="backup-restore-title">バックアップを復元しますか？</h2>
            <p>
              「{backupRestoreCandidate.fileName}」の
              {backupRestoreCandidate.backup.sets.length}セット・
              {backupRestoreCandidate.backup.sets.reduce(
                (total, set) => total + set.cards.length,
                0,
              )}
              枚を現在のデータとして復元します。現在の状態は復元前に予備コピーとして保存されます。
            </p>
            <div>
              <button
                className="secondary-button"
                data-dialog-initial
                disabled={explicitSaveInProgress}
                onClick={() => setBackupRestoreCandidate(null)}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="primary-button"
                disabled={explicitSaveInProgress || storageTransitioning}
                onClick={() => void confirmBackupRestore()}
                type="button"
              >
                {explicitSaveInProgress ? "復元を保存中…" : "復元する"}
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="delete-title"
            aria-modal="true"
            className="confirm-dialog"
            ref={deleteDialogRef}
            role="alertdialog"
            tabIndex={-1}
          >
            <div className="confirm-icon">
              <Trash2 size={22} />
            </div>
            <h2 id="delete-title">セットを削除しますか？</h2>
            <p>
              「{deleteTarget.title}」と{deleteTarget.cards.length}
              枚のカードを、この端末から削除します。
            </p>
            <div>
              <button
                className="secondary-button"
                data-dialog-initial
                onClick={() => setDeleteTarget(null)}
                type="button"
              >
                キャンセル
              </button>
              <button
                className="danger-button"
                disabled={explicitSaveInProgress}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {explicitSaveInProgress ? "削除を保存中…" : "削除する"}
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && (
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
            onClick={() => setToast(null)}
            type="button"
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
