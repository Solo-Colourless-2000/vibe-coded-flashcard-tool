import { type StudySet, getStudyScore, getStudyBatchIds } from "../../model";
import type { StudySession } from "./useStudySession";
import { StudyReadyView } from "./StudyReadyView";
import { CheckCircle2, RotateCcw, ArrowRight, X, XCircle, Check, ShieldCheck } from "lucide-react";
import CodeAnswerEditor from "../../CodeAnswerEditor";
import { MAX_CARD_TEXT_LENGTH } from "../../securityLimits";
import { StudyMessage } from "./StudyMessage";

type Props = { activeSet: StudySet | undefined; study: StudySession; openSets: () => void };
export function StudyView({ activeSet, study, openSets }: Props) {
  const { studyPhase, studyRun, beginSession, beginNextBatch, currentStudyCard,
    activeStudyDirection, currentPrompt, submitAnswer, answerFormRef, codeLanguage,
    setCodeLanguage, setAnswer, answerInputRef, answer, expectedAnswer, submitRetype,
    retypeFormRef, setRetypeAnswer, retypeInputRef, retypeAnswer, nextQuestion,
    nextQuestionButtonRef, studyMessage } = study;

  if (!activeSet) return null;
  if (studyPhase === "ready") return <StudyReadyView activeSet={activeSet} study={study} />;

  if (studyPhase === "complete") {
    if (!studyRun) return <StudyReadyView activeSet={activeSet} study={study} />;
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

  if (!studyRun) return <StudyReadyView activeSet={activeSet} study={study} />;

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

  if (!currentStudyCard) return <StudyReadyView activeSet={activeSet} study={study} />;

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
          className={`question-panel${studyPhase === "retype" ? " is-retype" : ""
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
