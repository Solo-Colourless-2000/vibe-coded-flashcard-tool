import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workshop, replayWorkshop } from "./beginner-workshop.mjs";
import { searchWorkshop } from "./search-workshop.mjs";

const escape = (value) => String(value).replace(/[&<>"']/gu, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const p = (value) => `<p>${escape(value)}</p>`;
const code = (value, label = "この部分をコピー") => `<div class="code-wrap"><button class="copy-btn" type="button">${escape(label)}</button><pre><code>${escape(value)}</code></pre></div>`;
const field = (label, value) => `<div class="lesson-field"><h4>${escape(label)}</h4>${p(value)}</div>`;
const table = (headers, rows, className = "") => `<div class="table-scroll${className ? ` ${escape(className)}` : ""}"${className ? ' tabindex="0"' : ""}><table class="status-table"><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const references = (items = []) => items.length
  ? `<p>参考資料（リンク先の閲覧にはインターネット接続が必要です）：${items.map((item) => `<a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a>`).join(" ／ ")}</p>`
  : "";

export function sourceLink(file) {
  return `<a class="manual-jump" href="#appendix-a" data-target="appendix-a" data-file="${escape(file)}">${escape(file)}</a>`;
}

export async function loadDevelopmentGuide(root) {
  const guide = JSON.parse(await readFile(join(root, "docs", "manual-source", "development-guide.json"), "utf8"));
  if (guide.schemaVersion !== 1 || !Array.isArray(guide.chapters) || guide.chapters.length < 20) {
    throw new Error("Invalid development guide");
  }
  for (const change of [...workshop.map((step) => step.change), ...searchWorkshop.flatMap((step) => step.changes)]) {
    for (const value of [change.before, change.after].filter(Boolean)) {
      if (value.trimEnd().split("\n").length > 36) throw new Error(`Workshop code block exceeds 36 lines: ${change.file}`);
    }
  }
  const allIds = new Set();
  const excerpts = [];
  for (const chapter of guide.chapters) {
    if (allIds.has(chapter.id) || !/^[a-z][a-z-]+$/u.test(chapter.id)) throw new Error(`Invalid chapter id: ${chapter.id}`);
    allIds.add(chapter.id);
    if (!chapter.steps.length || !chapter.goal || !chapter.before || !chapter.route.length || !chapter.checkpoint) {
      throw new Error(`Incomplete chapter: ${chapter.id}`);
    }
    for (const [index, step] of chapter.steps.entries()) {
      for (const key of ["title", "file", "action", "why", "check", "trouble"]) {
        if (typeof step[key] !== "string" || !step[key].trim()) throw new Error(`Missing ${key}: ${chapter.id}/${index + 1}`);
      }
      if (!step.file.startsWith("app/") && !step.file.startsWith("tests/")) throw new Error(`Unexpected source path: ${step.file}`);
      const text = (await readFile(join(root, ...step.file.split("/")), "utf8")).replace(/\r\n?/gu, "\n");
      const { anchor, lines } = step.source;
      if (!anchor || text.split(anchor).length !== 2) throw new Error(`Guide anchor must match once: ${chapter.id}: ${step.file}: ${anchor}`);
      if (!Number.isInteger(lines) || lines < 1 || lines > 36) throw new Error(`Oversized teaching excerpt: ${step.file}`);
      const start = text.slice(0, text.indexOf(anchor)).split("\n").length - 1;
      const sourceLines = text.split("\n");
      if (!sourceLines.at(-1)) sourceLines.pop();
      const value = sourceLines.slice(start, start + lines).join("\n");
      step.excerpt = { value, firstLine: start + 1, lastLine: Math.min(start + lines, sourceLines.length) };
      excerpts.push({ chapter: chapter.id, file: step.file, anchor, ...step.excerpt });
    }
  }
  return { guide, excerpts };
}

function hero(label, title, lead) {
  return `<div class="section-hero"><div class="section-kicker">${escape(label)}</div><h1>${escape(title)}</h1><div class="lead">${escape(lead)}</div></div>`;
}

function renderWorkshop() {
  const snapshots = replayWorkshop();
  const articles = workshop.map((step, index) => {
    const { file, kind, after, before } = step.change;
    const previous = workshop[index - 1]?.change.file;
    const next = workshop[index + 1]?.change.file;
    const move = previous && previous !== file ? `前工程の${previous}から${file}へ移動します。` : "このファイルを開いて次の小さな変更を行います。";
    const location = kind === "create" ? "新規作成：このファイルだけを作る" : kind === "append" ? "追加：ファイルの末尾に加える" : "置換：変更前の範囲だけを書き換える";
    return `<article class="lesson-step" id="workshop-step-${index + 1}" data-workshop-step="${index + 1}">
      <div class="step-number">基礎実習 ${index + 1} / ${workshop.length}</div><h2>${escape(step.title)}</h2>
      <div class="file-travel">${escape(move)}</div><div class="source-position"><strong>開くファイル:</strong> <code>${escape(file)}</code><br><strong>操作:</strong> ${escape(location)}</div>
      ${field("入力する前に行うこと", step.how)}${before ? `\n      <details class="before-code"><summary>検索して選択する変更前の部分</summary>${code(before)}</details>` : ""}
      <h3>${kind === "create" ? "今回だけ入力するコード" : "変更後の小さな部分"}</h3>${code(after)}
      ${field("なぜこのコードを書くのか・語句の意味", step.why)}
      ${field("この段階の画面・確認方法", step.check)}${field("つまずいたときに見る場所", step.troubleshoot)}
      <div class="next-file">${escape(next ? `次に開くファイル：${next}。完成ファイルをまとめて入力せず、次の工程の差分だけ進めます。` : "基礎実習はここまでです。次は同じ役割分担を本番の実装へ広げます。")}</div>
    </article>`;
  }).join("\n");
  return hero("BASIC WORKSHOP", "基礎実習：小さなカード機能をファイル間で育てる", "動く土台へ/practiceを追加し、型→表示→フック→採点→テストを往復します。途中も型検査が通るように契約を少しずつ広げ、最後に仮の契約を片付けます。")
    + `<div class="update-note"><strong>開始条件:</strong> 実習用コピーで変更前の検査が通っています。この章で作るapp/practiceとtests/practice-answer.test.mjsは教材専用で、本番のapp/recallへ混ぜません。既存の同名ファイルがある場合は上書きせず別の実習用コピーで始めます。実習が終わったら、残して参照するか、自分がこの章で作った6ファイルだけを別フォルダーへ保管して元の構成へ戻します。自分の別の変更や学習データを削除しません。</div>`
    + table(["往復", "目的"], [["page → types → View → page", "型付きのデータを独立した表示へ渡す"], ["hook → View → page → View", "状態とイベントを接続し仮のPropsを必須へ戻す"], ["rule → hook → View → page → rule → tests", "採点を独立させ本番モデルと検査へつなぐ"]])
    + articles
    + `<div class="callout success"><strong>検証できる途中状態:</strong> この章の${snapshots.length}工程は生成時に順序どおり再適用し、各工程のTypeScript接続を検査します。最終段階の採点テストも実行します。全文の完成ファイルは照合用で、作業は上の小さな差分の順に行います。</div>`;
}

function renderSearchWorkshop() {
  return `<h2>ここから実習コピーで入力する、実際の小さな差分</h2><div class="update-note"><strong>読解から入力へ:</strong> 前半の事前読解3工程では変更していません。ここから保守実習1〜5を一度だけ順に入力します。基礎実習の/practiceとは別に、完成アプリの一覧へ変更します。追加する2ファイルは実習用です。初めて始めるときに同名ファイルが既にあれば別の実習コピーを使い、中断からの再開なら記録した工程へ戻ります。新規作成を重ねません。</div>`
    + searchWorkshop.map((step, index) => `<article class="lesson-step" id="search-workshop-step-${index + 1}" data-search-step="${index + 1}"><div class="step-number">保守実習 ${index + 1} / ${searchWorkshop.length}</div><h2>${escape(step.title)}</h2>
      ${field("今回行うこと", step.how)}
      ${step.changes.map((change) => `<h3>${escape(change.file)}：${change.kind === "create" ? "新規作成" : "指定範囲を置換"}</h3>${change.before ? `<details class="before-code"><summary>検索して選ぶ変更前の範囲</summary>${code(change.before)}</details>` : ""}<h4>この部分だけ入力する変更後</h4>${code(change.after)}`).join("\n")}
      ${field("処理の意味と実装順の理由", step.why)}${field("期待する結果と確認", step.check)}${field("つまずいたとき", step.trouble)}
      <div class="next-file">${escape(index < searchWorkshop.length - 1 ? `次は${searchWorkshop[index + 1].changes[0].file}へ移動します。` : "最後にnpm run manual:build、npm run checkを一行ずつ実行し、動く変更と更新した本文を記録します。")}</div></article>`).join("\n")
    + `<div class="callout success"><strong>完了したコピーの再検証:</strong> manual:verifyは教材に記載した変更前・変更後を照合し、メモリー内だけで実習の出発点を組み直して5工程を検査します。編集中・完了後の実ファイルを書き戻す処理ではありません。実際に追加した関数とテストはnpm run checkのテスト・型検査・lintでも確認します。依存配列の欠落など、教材の変更前・変更後と一致しない差分はエラーになります。</div>`;
}

export async function renderDevelopmentGuide(root, catalog) {
  const { guide, excerpts } = await loadDevelopmentGuide(root);
  const sections = [];
  const bodies = new Map();
  const add = (id, label, title, body) => {
    sections.push({ id, label, title, group: "開発手順" });
    bodies.set(id, body);
  };
  add("learn-prepare", "準備", "作業環境と実習の進め方", hero("START HERE", "準備：変更前の成功を確かめてから実習する", "完成プロジェクトを土台に、別の実習用コピーで少しずつ入力・確認します。コマンドを打つ場所、ファイルを開く場所、保存データの場所を区別します。")
    + guide.preparation.map((item, index) => `<article class="lesson-step"><div class="step-number">準備 ${index + 1}</div><h2>${escape(item.title)}</h2>${item.paragraphs.map(p).join("")}${item.table ? p("狭い画面では、表の中を左右にスクロールして全ての列を確認してください。") + table(item.table.headers, item.table.rows, "browser-table") : ""}${references(item.references)}${item.commands ? `<h3>ターミナルで一行ずつ実行</h3>${code(item.commands)}${field("期待する結果", item.expected)}` : ""}</article>`).join("\n"));
  add("learn-language", "基礎語句", "コードを読むための言葉と記号", hero("VOCABULARY", "基礎語句：ファイルを往復するための最小限の言葉", "一度ですべて覚える必要はありません。手順で出会った名前へ戻り、型・値・状態・保存を区別しながら読みます。")
    + table(["言葉・記号", "このプロジェクトでの意味"], guide.glossary)
    + `<h2>役割を一つの流れで確認する</h2><div class="flow-diagram">利用者の入力 → 表示部品のイベント → フックの操作 → モデルの検証・状態遷移 → 共有セットの更新 → 保存キュー → 保存結果の通知</div>${p("表示を変更するときはView、操作を変更するときはuseで始まるフック、判定を変更するときはmodelや純粋関数、保存順序を変更するときはstorageです。共通型と入口の接続へ何度も戻るのが通常の作業です。")}`);
  add("learn-workshop", "基礎実習", "小さなカード機能を段階的に作る", renderWorkshop());
  for (const [chapterIndex, chapter] of guide.chapters.entries()) {
    const id = `learn-${chapter.id}`;
    const chapterNumber = chapterIndex + 1;
    const route = chapter.route.map((file, index) => `<span>${index + 1}. ${escape(file)}</span>`).join('<span class="travel-arrow" aria-hidden="true">→</span>');
    let body = hero(`IMPLEMENTATION ${String(chapterNumber).padStart(2, "0")}`, `実装 ${chapterNumber}：${chapter.title}`, chapter.goal)
      + field("この章を始める状態", chapter.before)
      + `<h2>往復する順序</h2><div class="travel-route">${route}</div><div class="callout info"><strong>完成コードの抜粋:</strong> 次の短いコードは現在の実ファイルと照合するための範囲です。既にあるコードは重複追加せず、各工程の対象だけを確認・変更します。${chapter.id === "maintenance" ? "この章の前半3工程は読むだけです。実際の入力は後半の保守実習1〜5で行います。" : "新しい機能を足す場合も、型・処理・テスト・表示の小さな差分へ分けます。"}</div>`;
    body += chapter.steps.map((step, index) => {
      const prev = chapter.steps[index - 1]?.file;
      const next = chapter.steps[index + 1]?.file;
      const move = prev && prev !== step.file ? `${prev}から${step.file}へ戻る／移る` : step.file;
      const { value, firstLine, lastLine } = step.excerpt;
      return `<article class="lesson-step" id="${id}-step-${index + 1}" data-guide-step="${chapter.id}/${index + 1}">
        <div class="step-number">実装 ${chapterNumber}・工程 ${index + 1} / ${chapter.steps.length}</div><h2>${escape(step.title)}</h2><div class="file-travel">${escape(move)}</div>
        <div class="source-position"><strong>開くファイル:</strong> ${sourceLink(step.file)}<br><strong>検索アンカー:</strong> <code>${escape(step.source.anchor)}</code><br><strong>掲載コードの範囲:</strong> ${firstLine}〜${lastLine}行（コードは下の小さな部分だけ）</div>
        ${field(chapter.id === "maintenance" ? "読む場所と、後半で変更する工程" : "どこを、どの順で作業するか", step.action)}${code(value, "照合用の抜粋をコピー")}
        ${field("処理の意味と、このファイルに置く理由", step.why)}${field("確認すること・期待する結果", step.check)}${field("間違えやすい点と直す場所", step.trouble)}
        <div class="next-file">${escape(next ? `次の工程では${next}を開きます。` : "この章の確認へ進み、成功した状態を記録します。")}</div>
      </article>`;
    }).join("\n");
    if (chapter.id === "maintenance") body += renderSearchWorkshop();
    body += `<div class="chapter-checkpoint"><h2>この章の確認と次へ進む条件</h2>${p(chapter.checkpoint)}${p("エラーがある間は次の機能を重ねません。最初のエラー、最後に触ったファイル、依存先の型の順に確認します。本番のソースを変更した章の区切りではnpm run manual:buildで掲載ソースを更新し、その後にnpm run checkを行います。")}</div>`;
    add(id, `実装 ${chapterNumber}`, chapter.title, body);
  }
  add("learn-verification", "確認・配布", "変更の確認、マニュアル更新、配布", hero("VERIFY AND DELIVER", "確認：小さな検査から本番と配布まで進める", "変更の性質に合う検査を行い、完成コード・マニュアル・配布物を一致させます。単にbuildが通っただけで、保存と学習の確認を終えたことにはしません。")
    + table(["確認場面", "実行するもの", "分かること"], [["純粋な採点・検証の変更", "node --experimental-strip-types --test tests/model.test.mjs tests/editor-draft.test.mjs", "入力と結果の仕様"], ["型・Props・フックの接続", "npm run typecheck", "引数、戻り値、importの接続"], ["変更ファイルの記述", "npx eslint app/recall/変更したファイル.tsx", "記述・フック依存の問題。実際のパスに置き換える"], ["章を終えた状態", "npm run manual:build → npm run check", "掲載ソースの更新と全体検査"], ["本番画面", "npm run build → npm run start", "生成された本番コードでの挙動"], ["配布用ソース", "npm run release:prepare → npm run release:verify", "同梱ファイルとSHA-256の整合性"]])
    + `<h2>実習用ルートを本番へ混ぜず、完成状態を確かめる</h2>${p("/practiceのファイルとテストを残す場合は実習用コピーだけで保管します。本番へ反映する変更をgit diffなどで選び、教材のサンプルデータや練習用UIを配布対象へ混ぜません。生成HTMLは直接編集せず、development-guide.json、beginner-workshop.mjs、テンプレートを更新して再生成します。")}`
    + `<h2>ターミナルBで順に実行</h2>${code("npm run manual:build\nnpm run check\nnpm run build\nnpm run release:prepare\nnpm run release:verify")}`
    + `${p("release:prepareはこのプロジェクトのrelease/recall-0.2.1-sourceを作り直します。ここへ手作業の唯一の原本を保存しません。配布前は元のソースとバックアップを保ち、出力が新しいマニュアル名を含むことを確認します。startのサーバーは確認後にCtrl+Cで終了します。")}`
    + `<h2>ブラウザーで行う具体的な確認</h2>${table(["機能", "操作順", "期待する結果"], guide.manualScenarios)}
      <h2>今回の掲載内容を検証する範囲</h2>${p(`基礎実習${workshop.length}工程を順序どおり再適用して各段階を型検査し、採点テストを実行します。本番実装編は${guide.chapters.length}章・${excerpts.length}工程の検索アンカーが実ソースに一意に存在すること、コード欄が一度に36行以下であることを検査します。手動確認項目は読者が変更後に行う項目であり、すべての環境の動作を自動検査が代替する意味ではありません。`)}`);
  add("learn-troubleshooting", "困ったとき", "エラーを一つずつ切り分ける", hero("TROUBLESHOOTING", "困ったとき：直前の小さな変更から切り分ける", "新しいコードを重ねる前に、最初のエラーと最後の成功を比べます。エラーを隠す変更と、本来の接続を直す変更は違います。")
    + table(["見える症状", "最初に調べる場所", "確認すること"], guide.troubleshooting)
    + `${field("中断して翌日に再開する手順", "Ctrl+Sで保存し、サーバーをCtrl+Cで止めます。実習の章番号・工程番号・最後に通った検査・残るエラーを短く記録します。再開したら同じフォルダーとブラウザープロファイルを開き、変更前の検査を一つ実行してから次の工程へ進みます。別のフォルダーの成功と混同しません。")}
      <h2>現在の全ファイルと責務</h2>${table(["ファイル", "役割"], catalog.sourceFiles.map((file) => [file, catalog.roles[file]]))}
      ${p("付録Aの完成ソースは照合のための資料です。学習を進める順序は本文の工程を使い、指定されたファイルと検索アンカーへ移動します。全文検索は本文と付録の全セクションを対象に、ファイル名・関数名・説明文を探せます。")}`);
  return { sections, bodies, guide, excerpts, workshopSteps: workshop.length, searchWorkshopSteps: searchWorkshop.length };
}
