import type { StudySet } from "../../model";
import type { SetActions } from "../types";
import { studyActivityTimestamp, hasResumableProgress, formatRelativeDate } from "../shared/setHelpers";
import { Plus, Layers3, RotateCcw, Play, BookOpen, ShieldCheck, ArrowRight, Pencil, Upload } from "lucide-react";

type Props = {
  sets: StudySet[];
  totalCards: number;
  averageScore: number;
  actions: Pick<SetActions, "startNewSet" | "openStudy" | "openFlashcards" | "openSets" | "editSet" | "startImportingSet">;
};
export function DashboardView({ sets, totalCards, averageScore, actions }: Props) {
  const { startNewSet, openStudy, openFlashcards, openSets, editSet, startImportingSet } = actions;

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
