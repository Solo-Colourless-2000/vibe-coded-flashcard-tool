import { type StudySet, isStudyProgressResumable, STUDY_BATCH_OPTIONS } from "../../model";
import type { StudySession } from "./useStudySession";
import { Keyboard, Play, Shuffle, LockKeyhole, Layers3, RotateCcw } from "lucide-react";
import { StudyMessage } from "./StudyMessage";

type Props = { activeSet: StudySet | undefined; study: StudySession };
export function StudyReadyView({ activeSet, study }: Props) {
  const { studyBatchSize, setStudyBatchSize, direction, setDirection, shuffleEnabled,
    setShuffleEnabled, allowParentheticalOmission, setAllowParentheticalOmission,
    resumeSession, requestFreshSession, studyMessage } = study;

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
