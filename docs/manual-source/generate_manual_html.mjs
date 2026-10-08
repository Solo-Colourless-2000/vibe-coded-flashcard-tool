import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDevelopmentGuide } from "./render-development-guide.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const ROOT = resolve(dirname(SCRIPT_PATH), "../..");
export const MANUAL_SOURCE = join(ROOT, "docs", "manual-source");
export const SOURCE_CATALOG_PATH = join(MANUAL_SOURCE, "source_catalog.json");
export const TEMPLATE_PATH = join(MANUAL_SOURCE, "manual-template.html");
export const MANUAL_REVISION = "2026-10-08";
export const MANUAL_FILE_NAME = "TOTAL_RECALL_機能別開発_初心者向け完全開発マニュアル_20261008.html";
export const OUTPUT = join(
  ROOT,
  "docs",
  MANUAL_FILE_NAME,
);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/gu,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function normalizeNewlines(value) {
  return value.replace(/\r\n?/gu, "\n");
}

function sourceLines(value) {
  const lines = normalizeNewlines(value).split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

async function loadCatalog() {
  const catalog = JSON.parse(await readFile(SOURCE_CATALOG_PATH, "utf8"));
  if (
    catalog.schemaVersion !== 1 ||
    !Array.isArray(catalog.sourceFiles) ||
    catalog.sourceFiles.length === 0 ||
    new Set(catalog.sourceFiles).size !== catalog.sourceFiles.length ||
    !catalog.roles ||
    typeof catalog.roles !== "object"
  ) {
    throw new Error("Invalid manual source catalog");
  }
  if (
    catalog.sourceFiles.some((file) => typeof catalog.roles[file] !== "string")
  ) {
    throw new Error("Every manual source file must have a documented role");
  }
  return catalog;
}

function renderCodeBlock(value, className = "code-wrap") {
  return `<div class="${className}"><button class="copy-btn" type="button">コピー</button><pre><code>${escapeHtml(value)}</code></pre></div>`;
}

function explainGroup(relativePath, lineNumbers, lines) {
  const compact = lines
    .filter((line) => line.trim())
    .map((line) => line.trim())
    .join(" ");
  const preview = compact.length > 150 ? `${compact.slice(0, 150)}…` : compact;
  const first = lines.find((line) => line.trim())?.trim() ?? "";
  const extension = relativePath
    .slice(relativePath.lastIndexOf("."))
    .toLocaleLowerCase();
  const lineLabel =
    lineNumbers.length === 1
      ? `${lineNumbers[0]}行目`
      : `${lineNumbers[0]}〜${lineNumbers.at(-1)}行目`;
  let purpose;
  if (relativePath.endsWith(".json"))
    purpose =
      "JSONのkey/valueまたは階層境界を定義し、build・runtimeが読む設定を構成します。";
  else if (extension === ".md")
    purpose =
      "利用者または開発者が守る手順・契約・注意点を文章として記録します。";
  else if (extension === ".css")
    purpose =
      "対象要素を選ぶ記法と見た目の指定を組み合わせ、配置、画面幅への対応、操作や読み上げに関係する表示を決めます。";
  else if ([".yml", ".yaml"].includes(extension))
    purpose =
      "自動検査を実行する条件、検査するOS、コマンド、権限、保存する成果物を設定します。";
  else if (extension === ".svg")
    purpose = "SVGの要素と属性で、ブラウザーのタブに出る小さなアイコンの形、色、描画範囲を定義します。";
  else if (/^import\s/u.test(first))
    purpose =
      "この後の処理で使う型・関数・画面部品・定数を別ファイルから読み込みます。";
  else if (/^(?:export\s+type|type\s|interface\s)/u.test(first))
    purpose = "値の形を型として定義し、呼び出す側と処理する側で項目や引数を一致させます。";
  else if (/function\s/u.test(first))
    purpose =
      "名前付きの処理を定義します。引数が入力で、returnの値が呼び出し側へ返す結果です。具体的な処理は関数の本体を追って確認します。";
  else if (/^(?:if\s|if\(|else|switch\s|case\s)/u.test(first))
    purpose = "条件によって進む処理を分けます。何と比較しているか、成立した後にどの値を変えるかを前後の行で確認します。";
  else if (/^(?:try|catch|finally|throw\s)/u.test(first))
    purpose =
      "例外の発生と受け取り、終了時の後片付けを扱います。catchが受け取る失敗と、finallyが行う解除を確認します。";
  else if (first.includes("await "))
    purpose = "時間のかかる処理の完了を待ってから、この関数内の続きを実行します。失敗をどのcatchが受け取るかも確認します。";
  else if (first.startsWith("return "))
    purpose = "この関数の実行を終え、結果を呼び出し側へ返します。何を返しているかを呼び出し先の利用と照合します。";
  else if (/^(?:const|let)\s/u.test(first))
    purpose =
      "値に名前を付けて保持し、後続の処理から使います。useStateで受け取る値と通常の変数は、画面更新の仕組みが異なります。";
  else if (/^(?:test\(|assert\.)/u.test(first))
    purpose =
      "期待する挙動を自動検査として固定し、将来の変更で同じ不備が戻ることを防ぎます。";
  else if (/^(?:<|\{|\})/u.test(first) || first.includes("className="))
    purpose =
      "タグ、属性、条件付きの表示や括弧の構造を記述します。画面の値やイベントの接続は、対応するViewとフックの本文で確認します。";
  else if (/^(?:\/\/|\/\*|\*|#)/u.test(first))
    purpose = "コメントとして説明を残します。コメント自体は実行されないため、書かれた条件と実際の処理を照合します。";
  else
    purpose =
      "前後の宣言・式・設定と組み合わさり、このファイルの責務を段階的に構成します。";
  return `<p><strong>${escapeHtml(lineLabel)}</strong>　${escapeHtml(purpose)} <span class="source-preview">対象コード: ${escapeHtml(preview)}</span> 参照時は行番号と実ファイルの位置を照合します。作業は本文の小さな差分の順に進めます。</p>`;
}

function renderExplanations(relativePath, lines) {
  const result = [];
  let groupNumbers = [];
  let groupLines = [];
  function flush() {
    if (!groupLines.length) return;
    result.push(explainGroup(relativePath, groupNumbers, groupLines));
    groupNumbers = [];
    groupLines = [];
  }
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (!line.trim()) {
      flush();
      return;
    }
    if (
      groupNumbers.length &&
      (lineNumber !== groupNumbers.at(-1) + 1 || groupLines.length >= 4)
    )
      flush();
    groupNumbers.push(lineNumber);
    groupLines.push(line);
  });
  flush();
  return result.join("");
}

async function renderSourceAppendix(catalog) {
  const files = [];
  for (const relativePath of catalog.sourceFiles) {
    const absolutePath = join(ROOT, ...relativePath.split("/"));
    const value = await readFile(absolutePath, "utf8");
    const lines = sourceLines(value);
    const numbered = lines
      .map((line, index) => `${String(index + 1).padStart(4, "0")} |${line ? " " + line : ""}`)
      .join("\n");
    const digest = sha256(Buffer.from(value, "utf8"));
    files.push(
      `<details class="source-file" data-file="${escapeHtml(relativePath)}"><summary>${escapeHtml(relativePath)}<span class="source-meta">${lines.length.toLocaleString("ja-JP")} lines / sha256 ${digest}</span></summary><div class="source-role"><strong>このファイルの役割:</strong> ${escapeHtml(catalog.roles[relativePath] ?? "現行プロジェクトを構成するファイルです。")}</div><div class="code-wrap"><pre><code>${escapeHtml(numbered)}</code></pre></div><div class="source-explanations"><h4>行番号に沿った逐次解説</h4>${renderExplanations(relativePath, lines)}</div></details>`,
    );
  }
  return `<div class="section-hero"><div class="section-kicker">CURRENT SOURCE</div><h1>付録A - TOTAL RECALL 0.2.1 完成ソース</h1><div class="lead">現在の${catalog.sourceFiles.length}プロジェクトファイルから自動生成した、行番号・SHA-256・役割付きの照合資料です。開発の順番は本文の工程を使います。</div></div><button type="button" class="nav-btn" id="returnToLesson" hidden>本文の工程へ戻る</button><div class="source-intro"><strong>重要:</strong> 本文で指定したファイルと検索アンカーを使い、対応する部分を照合してください。全文検索でファイル名・関数名・設定キーを検索できます。ここは完成状態の照合専用です。ファイル全文を一括で入力する教材ではありません。本文の小さな変更を順に進めます。</div>${files.join("")}`;
}

function htmlOperationsSection(catalog, development) {
  return `<div class="section-hero"><div class="section-kicker">MANUAL WORKFLOW</div><h1>付録B - HTMLマニュアルの更新と検証</h1><div class="lead">本文、実習、実ファイルの照合資料を編集元から再生成し、アプリの実装と一致させます。</div></div>
    <div class="update-note"><strong>編集するファイル:</strong> 本文はdevelopment-guide.json、基礎実習はbeginner-workshop.mjs、保守実習はsearch-workshop.mjs、Linuxの準備はlinux-workshop.mjsです。render-development-guide.mjsが短い抜粋と実習を描画し、verify-workshop.mjsが各途中状態を検査します。付録の収録対象と役割はsource_catalog.json、画面構造はmanual-template.htmlで管理します。</div>
    <table class="status-table"><thead><tr><th>項目</th><th>内容</th></tr></thead><tbody><tr><td>機能別の手順</td><td>${development.guide.chapters.length}章・${development.excerpts.length}工程</td></tr><tr><td>基礎実習</td><td>${development.workshopSteps}工程</td></tr><tr><td>保守実習</td><td>${development.searchWorkshopSteps}工程</td></tr><tr><td>完成ソース付録</td><td>${catalog.sourceFiles.length}ファイル</td></tr><tr><td>配布形式</td><td>UTF-8・単一HTML・オフライン閲覧対応</td></tr></tbody></table>
    <h2>編集元から更新する手順</h2><ol><li>本文の説明を直す場合はdevelopment-guide.jsonの該当工程を探し、実ファイル、検索アンカー、理由、期待する結果を一緒に照合します。</li><li>Linuxの準備を直す場合はlinux-workshop.mjsでBashと実行結果、OS固有の条件を一緒に確認します。</li><li>実習を直す場合は、入力する順序と変更前・変更後の範囲を確認します。一つのファイル全体をまとめて置換する手順にしません。</li><li>本番ソースを追加した場合はsource_catalog.jsonへファイル名と役割を加え、本文からの参照先も確認します。</li><li>プロジェクトのルートで、次のコマンドを一行ずつ実行します。先のコマンドが成功してから次へ進みます。</li></ol>
    ${renderCodeBlock("npm run manual:build\nnpm run manual:verify", "terminal-wrap")}
    <p>manual:buildは実ファイルのコード、行番号、SHA-256をHTMLへ反映します。manual:verifyは本文とソースの検索位置、教材の途中状態、HTML/CSS/scriptの構文、目次・内部リンク、コピー・検索用の要素、外部依存がないことを検査します。生成したHTMLを直接直すと次の生成で失われるため、編集元へ戻って修正します。</p>
    <h2>アプリと配布物を確認する</h2>${renderCodeBlock("npm run check\nnpm run build\nnpm run release:prepare\nnpm run release:verify", "terminal-wrap")}
    <p>配布前は本文のファイル名リンク、本文へ戻る操作、検索、コードのコピー、文字サイズ、集中表示、狭い画面、印刷表示をブラウザーでも確認します。release:prepareは配布フォルダーを作り直すため、生成先へ手作業の唯一の原本を保存しません。HTMLは外部CDN・外部フォント・外部JavaScriptを読み込まず、ファイル単体で閲覧できます。</p>`;
}

function sectionNavigation(sections, index) {
  const previous = sections[index - 1];
  const next = sections[index + 1];
  return `<div class="section-nav"><button class="nav-btn prev" data-action="prev" type="button"${previous ? "" : " disabled"}>← 前へ<br><small>${previous ? escapeHtml(previous.title) : ""}</small></button><button class="nav-btn next" data-action="next" type="button"${next ? "" : " disabled"}>次へ →<br><small>${next ? escapeHtml(next.title) : ""}</small></button></div>`;
}

function tocButton(section) {
  return `<button class="toc-item" data-target="${section.id}" type="button"><span class="toc-label">${escapeHtml(section.label)}</span><span class="toc-title">${escapeHtml(section.title)}</span></button>`;
}

export async function buildManualHtml() {
  const [catalog, template, packageText] = await Promise.all([
    loadCatalog(),
    readFile(TEMPLATE_PATH, "utf8"),
    readFile(join(ROOT, "package.json"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);
  const development = await renderDevelopmentGuide(ROOT, catalog);
  const sections = [
    { id: "home", label: "はじめに", title: "TOTAL RECALLの作成・保守手順", group: "開発手順" },
    ...development.sections,
    { id: "appendix-a", label: "付録A・照合用", title: "全ファイルと完成ソース", group: "照合・更新資料" },
    { id: "appendix-b", label: "付録B", title: "HTMLマニュアルの更新と検証", group: "照合・更新資料" },
  ];
  const home = `<div class="cover"><div class="cover-card"><div class="cover-logo">TOTAL RECALL</div><h1>機能別開発<br>初心者向け完全開発マニュアル</h1><div class="cover-sub">アプリ ${escapeHtml(packageJson.version)} / ${MANUAL_REVISION}版</div><div class="cover-meta">Windows（PowerShell）/ Linux（Bash） / Node.js ${escapeHtml(packageJson.engines.node)} / 検証環境24.20.0</div><div class="principle"><strong>関連するファイルを往復し、小さな差分と確認を積み重ねます。</strong><br>準備（Windows/Linux）→基礎語句→基礎実習${development.workshopSteps}工程→機能別の実装${development.guide.chapters.length}章・${development.excerpts.length}工程→保守実習${development.searchWorkshopSteps}工程→検証と配布の順で進めます。各工程に開くファイル、編集位置、短いコード、理由、期待する結果、失敗時の確認先を示します。</div><div class="feature-grid"><div class="feature"><b>途中も確かめる実習</b>型、表示、フック、採点、テストを別ファイルに作り、接続を少しずつ広げます。</div><div class="feature"><b>実ファイルと照合</b>検索アンカーと行番号を実ソースから検証します。完成ソースは付録の照合資料です。</div><div class="feature"><b>作業と確認をつなぐ</b>書く場所、処理の理由、期待する画面を確認してから次の小さな工程へ進みます。</div></div><p>ファイル名：<code>${MANUAL_FILE_NAME}</code></p><a class="start-reading manual-jump" href="#learn-prepare" data-target="learn-prepare">準備の章から読み始める →</a></div></div>`;
  const bodies = new Map([["home", home], ...development.bodies]);
  bodies.set("appendix-a", await renderSourceAppendix(catalog));
  bodies.set("appendix-b", htmlOperationsSection(catalog, development));
  const renderedSections = sections.map((section, index) => {
    const body = bodies.get(section.id);
    if (!body) throw new Error("Missing manual section: " + section.id);
    return `<section class="manual-section" id="${section.id}" data-title="${escapeHtml(section.title)}">${body}${sectionNavigation(sections, index)}</section>`;
  }).join("");
  let currentGroup = "";
  const toc = sections.map((section) => {
    const group = section.group !== currentGroup ? `<div class="toc-group-title">${escapeHtml(section.group)}</div>` : "";
    currentGroup = section.group;
    return group + tocButton(section);
  }).join("");
  const html = template.replace("<!--MANUAL_TOC-->", () => toc).replace("<!--MANUAL_SECTIONS-->", () => renderedSections);
  if (html === template || html.includes("<!--MANUAL_TOC-->") || html.includes("<!--MANUAL_SECTIONS-->")) {
    throw new Error("Manual template placeholders were not replaced exactly once");
  }
  return { html, catalog, sections, development };
}

async function main() {
  const { html, catalog, sections, development } = await buildManualHtml();
  const temporary = `${OUTPUT}.tmp`;
  await writeFile(temporary, html, { encoding: "utf8", mode: 0o644 });
  await rm(OUTPUT, { force: true });
  await rename(temporary, OUTPUT);
  console.log(
    `MANUAL_HTML_CREATED sections=${sections.length} teaching_steps=${development.excerpts.length} source_files=${catalog.sourceFiles.length} bytes=${Buffer.byteLength(html)} sha256=${sha256(Buffer.from(html, "utf8"))}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
