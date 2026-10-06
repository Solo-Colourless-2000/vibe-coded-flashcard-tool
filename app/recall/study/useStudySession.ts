import {
  type StudySet,
  type StudyDirection,
  type StudyBatchSize,
  DEFAULT_STUDY_BATCH_SIZE,
  type StudyProgress,
  getCurrentStudyCardId,
  shouldAdvanceStudyOnEnter,
  createStudyProgress,
  isStudyProgressResumable,
  trimStudyAnswerLineEndWhitespace,
  matchesStudyAnswer,
  recordCorrectStudyAnswer,
  recordWrongStudyAnswer,
  recordSuccessfulRetype,
  getStudyScore,
  advanceStudyProgress,
  startNextStudyBatch,
} from "../../model";
import type { SetState, View, StudyScreen, StudyPhase } from "../types";
import { useState, useRef, useEffect, type FormEvent } from "react";
import type { CodeLanguage, CodeAnswerEditorHandle } from "../../CodeAnswerEditor";
import { shuffleIds, hasResumableProgress } from "../shared/setHelpers";
import { MAX_CARD_TEXT_LENGTH } from "../../securityLimits";

type Options = {
  sets: StudySet[];
  setSets: SetState<StudySet[]>;
  activeSetId: string;
  setActiveSetId: SetState<string>;
  view: View;
  modalOpen: boolean;
  goTo: (view: View) => void;
};
export function useStudySession({ sets, setSets, activeSetId, setActiveSetId, view, modalOpen, goTo }: Options) {
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

  const answerInputRef = useRef<CodeAnswerEditorHandle>(null);
  const retypeInputRef = useRef<CodeAnswerEditorHandle>(null);
  const answerFormRef = useRef<HTMLFormElement>(null);
  const retypeFormRef = useRef<HTMLFormElement>(null);
  const nextQuestionButtonRef = useRef<HTMLButtonElement>(null);

  const activeSet = sets.find((set) => set.id === activeSetId) ?? sets[0];

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
      modalOpen
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
  }, [modalOpen, studyPhase, view]);

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

  function resetSession() { setStudyRun(null); setStudyScreen("ready"); }
  function clearStudyMessage() { setStudyMessage(""); }

  return {
    direction,
    setDirection,
    shuffleEnabled,
    setShuffleEnabled,
    allowParentheticalOmission,
    setAllowParentheticalOmission,
    studyBatchSize,
    setStudyBatchSize,
    studyRun,
    studyPhase,
    answer,
    setAnswer,
    retypeAnswer,
    setRetypeAnswer,
    studyMessage,
    codeLanguage,
    setCodeLanguage,
    answerInputRef,
    retypeInputRef,
    answerFormRef,
    retypeFormRef,
    nextQuestionButtonRef,
    currentStudyCard,
    activeStudyDirection,
    expectedAnswer,
    currentPrompt,
    openStudy,
    beginSession,
    requestFreshSession,
    resumeSession,
    submitAnswer,
    submitRetype,
    nextQuestion,
    beginNextBatch,
    resetSession,
    clearStudyMessage,
  };
}
export type StudySession = ReturnType<typeof useStudySession>;
