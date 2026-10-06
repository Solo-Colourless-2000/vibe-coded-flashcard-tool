import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const ROOT = resolve(dirname(SCRIPT_PATH), "../..");
export const MANUAL_SOURCE = join(ROOT, "docs", "manual-source");
export const FOUNDATION_PATH = join(MANUAL_SOURCE, "foundation_pages.json");
export const SOURCE_CATALOG_PATH = join(MANUAL_SOURCE, "source_catalog.json");
export const TEMPLATE_PATH = join(MANUAL_SOURCE, "manual-template.html");
export const OUTPUT = join(
  ROOT,
  "docs",
  "RECALL_コードエディター版_初心者向け完全開発マニュアル_20260831.html",
);

export const AFFECTED_FOUNDATION_PAGES = new Set([
  ...range(4, 5),
  ...range(31, 43),
  ...range(87, 93),
  ...range(97, 101),
  ...range(108, 117),
  ...range(131, 174),
  ...range(192, 193),
  ...range(574, 577),
  ...range(606, 607),
  ...range(612, 624),
  ...range(629, 638),
  ...range(643, 647),
  ...range(656, 657),
]);

const FOUNDATION_SECTIONS = [
  {
    id: "foundation-cover",
    label: "基礎編",
    title: "旧版の表紙と改訂方針",
    start: 1,
    end: 1,
  },
  {
    id: "part-0",
    label: "Part 0",
    title: "この本の使い方と開発ループ",
    start: 2,
    end: 2,
  },
  {
    id: "part-1",
    label: "Part 1",
    title: "開発前に理解する最小限の言葉",
    start: 3,
    end: 3,
  },
  {
    id: "part-2",
    label: "Part 2",
    title: "Windows / Arch Linuxに開発環境を用意する",
    start: 4,
    end: 13,
  },
  {
    id: "part-3",
    label: "Part 3",
    title: "最小画面を起動し、最初の縦切りを通す",
    start: 14,
    end: 28,
  },
  {
    id: "part-4",
    label: "Part 4",
    title: "上限・厳密採点・学習進捗をmodelへ積み上げる",
    start: 29,
    end: 86,
  },
  {
    id: "part-5",
    label: "Part 5",
    title: "localStorage依存をやめ、IndexedDB主保存へ",
    start: 87,
    end: 107,
  },
  {
    id: "part-6",
    label: "Part 6",
    title: "全体バックアップJSONを書き出し・復元できる",
    start: 108,
    end: 130,
  },
  {
    id: "part-7",
    label: "Part 7",
    title: "プロジェクトフォルダー保存をトランザクション化する",
    start: 131,
    end: 174,
  },
  {
    id: "part-8",
    label: "Part 8",
    title: "インポートを検査 → Worker解析 → 再検証へ分離する",
    start: 175,
    end: 220,
  },
  {
    id: "part-9",
    label: "Part 9",
    title: "モーダルとCodeMirrorを独立コンポーネントとして作る",
    start: 221,
    end: 260,
  },
  {
    id: "part-10",
    label: "Part 10",
    title: "page.tsxを状態の司令塔として段階的につなぐ",
    start: 261,
    end: 299,
  },
  {
    id: "part-11",
    label: "Part 11",
    title: "10,000カード上限を維持しながら編集画面を作る",
    start: 300,
    end: 350,
  },
  {
    id: "part-12",
    label: "Part 12",
    title: "学習・再入力・再出題をUIへ接続する",
    start: 351,
    end: 406,
  },
  {
    id: "part-13",
    label: "Part 13",
    title: "CSSとアクセシビリティを機能単位で仕上げる",
    start: 407,
    end: 514,
  },
  {
    id: "part-14",
    label: "Part 14",
    title: "loopbackサーバーとHTTP防御を最後に共通化する",
    start: 515,
    end: 550,
  },
  {
    id: "part-15",
    label: "Part 15",
    title: "テスト、CI、SBOM、source release",
    start: 551,
    end: 569,
  },
  {
    id: "part-16",
    label: "Part 16",
    title: "完成後の手動試験",
    start: 570,
    end: 570,
  },
  {
    id: "part-17",
    label: "Part 17",
    title: "よくある失敗と切り分け",
    start: 571,
    end: 571,
  },
  {
    id: "part-18",
    label: "Part 18",
    title: "実際の開発のようにファイルを少しずつ往復するミニループ集",
    start: 572,
    end: 848,
  },
  {
    id: "part-19",
    label: "Part 19",
    title: "完成ファイル一覧と責務",
    start: 849,
    end: 849,
  },
];

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

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

const LINE_REFERENCE_PATTERN = /[0-9０-９]+(?:[〜～~－-][0-9０-９]+)?行目/gu;

function renderLegacyProse(value) {
  return escapeHtml(value).replace(LINE_REFERENCE_PATTERN, (label, offset) => {
    const lineBreak = offset === 0 ? "" : "<br>";
    return `${lineBreak}<span class="line-reference">${label}</span>`;
  });
}

function normalizeNewlines(value) {
  return value.replace(/\r\n?/gu, "\n");
}

function sourceLines(value) {
  const lines = normalizeNewlines(value).split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export async function loadFoundation() {
  const foundation = JSON.parse(await readFile(FOUNDATION_PATH, "utf8"));
  if (
    foundation.schemaVersion !== 1 ||
    foundation.pageCount !== 849 ||
    !Array.isArray(foundation.pages) ||
    foundation.pages.length !== 849
  ) {
    throw new Error("Invalid HTML foundation manual source");
  }
  foundation.pages.forEach((page, index) => {
    if (
      page.page !== index + 1 ||
      typeof page.text !== "string" ||
      !page.text.trim()
    ) {
      throw new Error(`Invalid foundation page ${index + 1}`);
    }
  });
  return foundation;
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

function applyCurrentCorrections(value) {
  return value
    .replaceAll(">=22.13.0 <24", ">=22.13.0 <25")
    .replaceAll("22.13.0以上24未満", "22.13.0以上25未満")
    .replaceAll("かつ <24", "かつ <25")
    .replaceAll("74/74合格", "76/76合格")
    .replaceAll("75/75合格", "76/76合格");
}

function cleanFoundationLines(page) {
  const lines = sourceLines(applyCurrentCorrections(page.text)).map((line) =>
    line.trimEnd(),
  );
  if (lines[0]?.trim() === "RECALL - コードエディター版 完全開発マニュアル")
    lines.shift();
  if (lines[0]?.trim() === String(page.page)) lines.shift();
  if (page.page === 515 && lines[0]?.trim() === "14" && lines[1]?.trim()) {
    lines.splice(0, 2, `14 ${lines[1].trim()}`);
  }
  return lines.filter(
    (line) =>
      !line.includes("再監査差替え対象：") &&
      !line.includes("最終再確認版：差分は冒頭章"),
  );
}

function joinProse(lines) {
  let result = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!result) {
      result = line;
      continue;
    }
    const asciiBoundary =
      /[A-Za-z0-9)\]}'".,;:]$/u.test(result) &&
      /^[A-Za-z0-9(\[{'"]/u.test(line);
    const likelySplitIdentifier =
      /[A-Za-z0-9_.][A-Z]$/u.test(result) && /^[a-z]{1,8}(?:\b|$)/u.test(line);
    result += asciiBoundary && !likelySplitIdentifier ? ` ${line}` : line;
  }
  return result;
}

function isMajorHeading(line) {
  return /^(?:[0-9]{1,2})\s+\S/u.test(line) && !/^\d{4}\s*\|/u.test(line);
}

function renderFoundationLines(lines) {
  const html = [];
  let paragraph = [];
  let bullets = [];
  let code = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${renderLegacyProse(joinProse(paragraph))}</p>`);
    paragraph = [];
  }

  function flushBullets() {
    if (!bullets.length) return;
    html.push(
      `<ul>${bullets.map((line) => `<li>${renderLegacyProse(joinProse([line]))}</li>`).join("")}</ul>`,
    );
    bullets = [];
  }

  function flushCode() {
    if (!code.length) return;
    html.push(
      `<div class="code-wrap"><button class="copy-btn" type="button">コピー</button><pre><code>${escapeHtml(code.join("\n"))}</code></pre></div>`,
    );
    code = [];
  }

  function flushAll() {
    flushParagraph();
    flushBullets();
    flushCode();
  }

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flushAll();
      continue;
    }
    if (/^\d{4}\s*\|/u.test(trimmed) || (/^>>/u.test(trimmed) && code.length)) {
      flushParagraph();
      flushBullets();
      code.push(trimmed);
      continue;
    }
    flushCode();
    if (/^[•・]\s*/u.test(trimmed)) {
      flushParagraph();
      bullets.push(trimmed.replace(/^[•・]\s*/u, ""));
      continue;
    }
    flushBullets();
    if (isMajorHeading(trimmed)) {
      flushParagraph();
      html.push(`<h2>${escapeHtml(trimmed)}</h2>`);
    } else if (/^ステップ\s*\d|^ステップ\d/u.test(trimmed)) {
      flushParagraph();
      html.push(`<h3>${escapeHtml(trimmed)}</h3>`);
    } else if (
      /^(?:このコード欄の行別・詳細解説|このコードを行番号に沿って読む|確認すること|最重要ルール|版の条件)$/u.test(
        trimmed,
      )
    ) {
      flushParagraph();
      html.push(`<h4>${escapeHtml(trimmed)}</h4>`);
    } else if (
      /^[0-9０-９]+(?:[〜～~－-][0-9０-９]+)?行目(?:\s|$|[：:])/u.test(trimmed)
    ) {
      flushParagraph();
      html.push(
        `<div class="line-explanation-title">${renderLegacyProse(trimmed)}</div>`,
      );
    } else {
      paragraph.push(raw);
    }
  }
  flushAll();
  return html.join("");
}

export function renderLegacyPage(page) {
  const affected = AFFECTED_FOUNDATION_PAGES.has(page.page);
  const pageHash = sha256(normalizeNewlines(page.text));
  const banner = affected
    ? '<div class="replacement-banner"><strong>最新版を優先:</strong> このページは開発順を理解するための基礎解説です。完成コード・現行行番号・現在の挙動は「2026-08-31 最新差分」と「付録A 完成ソース」を優先してください。</div>'
    : "";
  return `<article class="legacy-page${affected ? " affected" : ""}" data-source-page="${page.page}" data-source-sha256="${pageHash}"><div class="page-origin">旧版基礎解説 p.${page.page}（HTML移行済み）</div>${banner}${renderFoundationLines(cleanFoundationLines(page))}</article>`;
}

function renderCodeBlock(value, className = "code-wrap") {
  return `<div class="${className}"><button class="copy-btn" type="button">コピー</button><pre><code>${escapeHtml(value)}</code></pre></div>`;
}

function findSlice(value, startNeedle, endNeedle) {
  const start = value.indexOf(startNeedle);
  if (start < 0) throw new Error(`Missing source slice start: ${startNeedle}`);
  const end = value.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) throw new Error(`Missing source slice end: ${endNeedle}`);
  return value.slice(start, end).trimEnd();
}

async function currentChangesSection() {
  const proxy = await readFile(join(ROOT, "proxy.ts"), "utf8");
  const model = await readFile(join(ROOT, "app", "model.ts"), "utf8");
  const page = await readFile(
    join(ROOT, "app", "recall", "study", "StudyReadyView.tsx"),
    "utf8",
  );
  const packageJson = await readFile(join(ROOT, "package.json"), "utf8");
  const csp = findSlice(
    proxy,
    "function createContentSecurityPolicy",
    "function applyBaseSecurityHeaders",
  );
  const progress = findSlice(
    model,
    "export type StudyProgress = {",
    "export type StudySet = {",
  );
  const matcher = findSlice(
    model,
    "export function matchesStudyAnswer",
    "function appendUnique",
  );
  const settingStart = page.indexOf(
    '<label className="shuffle-setting parenthesis-setting">',
  );
  const settingEnd = page.indexOf(
    '<div className="strict-rule">',
    settingStart,
  );
  if (settingStart < 0 || settingEnd < 0)
    throw new Error("Missing parenthetical setting UI slice");
  const setting = page.slice(settingStart, settingEnd).trimEnd();
  const packageScripts = JSON.parse(packageJson).scripts;
  return `
    <div class="section-hero"><div class="section-kicker">CURRENT OVERRIDE</div><h1>2026-10-07 最新差分</h1><div class="lead">旧版基礎解説より優先する、現在のRECALL 0.2.1の確定事項です。機能別ファイル構成、Node.js 24、本番起動、カッコ省略設定、HTMLマニュアル運用をまとめます。</div></div>
    <div class="latest-grid">
      <article class="latest-card"><h3>画面・状態管理・保存を機能別に分離</h3><p>app/page.tsxはルートの入口、app/recall/RecallApp.tsxは画面とフックの組み立てを担当します。library、editor、study、flashcards、storage、navigation、sharedに責務を分け、既存の操作と保存形式を維持します。基礎編の分割前構成は歴史的な説明です。現行構成は付録のdocs/ARCHITECTURE.mdと完成ソースを参照してください。</p></article>
      <article class="latest-card"><h3>本番読み込みを修正</h3><p>Vinextの起動用インラインbootstrapをCSPが遮断しないようにし、loading shellから操作画面へ遷移します。同一originのscriptとscript属性禁止は維持します。</p></article>
      <article class="latest-card"><h3>カッコ省略を選択可能に</h3><p>学習開始前に半角 (...) 内を省略できるか選択できます。設定はStudyProgress version 3へ保存し、version 1/2は従来どおり省略可として移行します。</p></article>
      <article class="latest-card"><h3>Node.js 24対応</h3><p>対応範囲はNode.js &gt;=22.13.0 &lt;25です。既存の検証では22.14.0と24.19.0の双方で76件のtest、型検査、ESLint、本番buildを確認済みです。機能分割後の検証結果はdocs/VALIDATION.mdを参照してください。</p></article>
      <article class="latest-card"><h3>HTMLへ一本化</h3><p>本編と付録を1つの自己完結型HTMLへ統合しました。以後は <code>npm run manual:build</code> と <code>npm run manual:verify</code> で更新・検証し、PDFは使用しません。</p></article>
    </div>
    <h2>本番CSPとloading shellの修正</h2>${renderCodeBlock(csp)}
    <h2>途中進捗へ保存するカッコ省略設定</h2>${renderCodeBlock(progress)}
    <h2>設定に従う正答判定</h2>${renderCodeBlock(matcher)}
    <h2>学習開始前の選択UI</h2>${renderCodeBlock(setting)}
    <h2>HTMLマニュアルの更新コマンド</h2>${renderCodeBlock(`npm run manual:build\nnpm run manual:verify\n\n# 総合確認\nnpm run check\nnpm run build`, "terminal-wrap")}
    <p class="callout info">現在のpackage scriptsでは、manual:verifyも総合検査へ含めます。マニュアルに収録したソースのSHA-256や行数が現在のファイルと一致しない場合は、検証が失敗して更新漏れを知らせます。</p>
    <p hidden>${escapeHtml(JSON.stringify(packageScripts))}</p>`;
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
      "selectorとpropertyを組み合わせ、表示、layout、responsiveまたはaccessibility上の見え方を定義します。";
  else if ([".yml", ".yaml"].includes(extension))
    purpose =
      "CI jobのtrigger、OS matrix、command、権限またはartifact条件を宣言します。";
  else if (extension === ".svg")
    purpose = "SVG要素と属性でfaviconのvector形状、色、viewBoxを定義します。";
  else if (/^import\s/u.test(first))
    purpose =
      "この後の処理で使う型・関数・component・定数を別moduleから読み込みます。";
  else if (/^(?:export\s+type|type\s|interface\s)/u.test(first))
    purpose = "値の形を型契約として定義し、callerと実装の期待を一致させます。";
  else if (/function\s/u.test(first))
    purpose =
      "名前付き処理を定義し、引数を検証・変換して結果またはPromiseをcallerへ返します。";
  else if (/^(?:if\s|if\(|else|switch\s|case\s)/u.test(first))
    purpose = "条件に応じて処理経路を分け、異常値や競合を安全側で停止します。";
  else if (/^(?:try|catch|finally|throw\s)/u.test(first))
    purpose =
      "失敗時のcleanupとerror伝播を定義し、途中状態を成功として扱わないようにします。";
  else if (first.includes("await "))
    purpose = "非同期処理の完了を待ち、完了順序とerror処理を明確にします。";
  else if (first.startsWith("return "))
    purpose = "この分岐の結果をcallerへ返し、後続の不要な処理を止めます。";
  else if (/^(?:const|let)\s/u.test(first))
    purpose =
      "処理で使う値またはstateを名前付き変数へ保持し、後続の判定・描画・保存へ渡します。";
  else if (/^(?:test\(|assert\.)/u.test(first))
    purpose =
      "期待する挙動を自動検査として固定し、将来の変更で同じ不備が戻ることを防ぎます。";
  else if (/^(?:<|\{|\})/u.test(first) || first.includes("className="))
    purpose =
      "UI要素、属性、条件描画または構造境界を定義し、利用者操作とstateを接続します。";
  else if (/^(?:\/\/|\/\*|\*|#)/u.test(first))
    purpose = "実装理由、入力上の注意、運用上の前提をcommentとして残します。";
  else
    purpose =
      "前後の宣言・式・設定と組み合わさり、このファイルの責務を段階的に構成します。";
  return `<p><strong>${escapeHtml(lineLabel)}</strong>　${escapeHtml(purpose)} <span class="source-preview">対象コード: ${escapeHtml(preview)}</span> 入力時は掲載上の行番号を含めず、括弧・引用符・大文字小文字・indentを現行ソースどおり保ちます。</p>`;
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
      .map((line, index) => `${String(index + 1).padStart(4, "0")} | ${line}`)
      .join("\n");
    const digest = sha256(Buffer.from(value, "utf8"));
    files.push(
      `<details class="source-file"><summary>${escapeHtml(relativePath)}<span class="source-meta">${lines.length.toLocaleString("ja-JP")} lines / sha256 ${digest}</span></summary><div class="source-role"><strong>このファイルの役割:</strong> ${escapeHtml(catalog.roles[relativePath] ?? "現行プロジェクトを構成するファイルです。")}</div><div class="code-wrap"><button class="copy-btn" type="button">コピー</button><pre><code>${escapeHtml(numbered)}</code></pre></div><div class="source-explanations"><h4>行番号に沿った逐次解説</h4>${renderExplanations(relativePath, lines)}</div></details>`,
    );
  }
  return `<div class="section-hero"><div class="section-kicker">CURRENT SOURCE</div><h1>付録A - RECALL 0.2.1 完成ソース</h1><div class="lead">現在の${catalog.sourceFiles.length}プロジェクトファイルから自動生成した、行番号・SHA-256・役割・逐次解説付きの完成ソースです。</div></div><div class="source-intro"><strong>重要:</strong> 基礎解説の途中状態や古いversion記述と衝突した場合、この付録を優先してください。全文検索でファイル名・関数名・設定キーを検索できます。コピー時は表示用の行番号を自動的に除去します。</div>${files.join("")}`;
}

function htmlOperationsSection(foundation, catalog) {
  return `<div class="section-hero"><div class="section-kicker">HTML-ONLY WORKFLOW</div><h1>付録B - HTMLマニュアルの更新と検証</h1><div class="lead">2026-08-31以降はPDFを廃止し、この自己完結型HTMLだけを生成・更新します。</div></div>
    <div class="update-note"><strong>運用方針:</strong> 基礎解説はUTF-8のfoundation_pages.json、完成ソース付録は現行プロジェクトファイル、画面構造はmanual-template.htmlから再生成します。外部CDN・外部フォント・外部JavaScriptは使用しません。</div>
    <table class="status-table"><thead><tr><th>項目</th><th>現在値</th></tr></thead><tbody><tr><td>旧版本文から移行した基礎解説</td><td>${foundation.pageCount}ページ相当</td></tr><tr><td>差し替え注意付き基礎ページ</td><td>${AFFECTED_FOUNDATION_PAGES.size}ページ</td></tr><tr><td>完成ソース付録</td><td>${catalog.sourceFiles.length}ファイル</td></tr><tr><td>旧PDFの移行元SHA-256</td><td><code>${escapeHtml(foundation.formerPdfSha256)}</code></td></tr><tr><td>配布形式</td><td>UTF-8・単一HTML・オフライン閲覧対応</td></tr></tbody></table>
    <h2>更新手順</h2>${renderCodeBlock(`npm run manual:build\nnpm run manual:verify`, "terminal-wrap")}
    <ol><li>アプリまたは説明文を修正します。</li><li><code>npm run manual:build</code>で現行ソース、SHA-256、行番号、逐次解説をHTMLへ反映します。</li><li><code>npm run manual:verify</code>で基礎解説849ページ相当、完成ソース${catalog.sourceFiles.length}ファイル、目次、検索・コピー用script、外部依存なしを検査します。</li><li><code>npm run check</code>と<code>npm run build</code>を通してから配布します。</li></ol>
    <p class="callout warn"><strong>PDFへ戻さない:</strong> 今後の更新ではPDF生成script、PDF用baseline、フォント埋め込み、ページ画像検査は使用しません。印刷や保存が必要な場合は、このHTMLの印刷用スタイルを利用します。</p>`;
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
  const [foundation, catalog, template] = await Promise.all([
    loadFoundation(),
    loadCatalog(),
    readFile(TEMPLATE_PATH, "utf8"),
  ]);
  const foundationByPage = new Map(
    foundation.pages.map((page) => [page.page, page]),
  );
  const sections = [
    {
      id: "home",
      label: "はじめに",
      title: "最新版HTMLの読み方",
      group: "MANUAL",
    },
    {
      id: "part-r",
      label: "最新差分",
      title: "2026-08-31 確定変更",
      group: "MANUAL",
    },
    ...FOUNDATION_SECTIONS.map((section) => ({
      ...section,
      group: "FOUNDATION",
    })),
    {
      id: "appendix-a",
      label: "付録A",
      title: "RECALL 0.2.1 完成ソース",
      group: "APPENDIX",
    },
    {
      id: "appendix-b",
      label: "付録B",
      title: "HTMLマニュアルの更新と検証",
      group: "APPENDIX",
    },
  ];

  const home = `<div class="cover"><div class="cover-card"><div class="cover-logo">RECALL</div><h1>コードエディター版<br>初心者向け完全開発マニュアル</h1><div class="cover-sub">0.2.1 - HTML統合版</div><div class="cover-meta">改訂日 2026-08-31 / Node.js &gt;=22.13.0 &lt;25 / Windows 11・Arch Linux</div><div class="principle"><strong>このHTMLが唯一の現行マニュアルです。</strong><br>旧本編と付録を1ファイルへ統合し、基礎解説、最新差分、完成ソース、行番号別解説を全文検索できます。PDFは廃止しました。</div><div class="feature-grid"><div class="feature"><b>完全オフライン</b>外部CDN、外部フォント、外部scriptなしで単体閲覧できます。</div><div class="feature"><b>検索とコピー</b>Ctrl/⌘+Kで全文検索し、コード欄は行番号を除いてコピーできます。</div><div class="feature"><b>更新漏れ検出</b>基礎解説、現行ソースのSHA-256・行数、目次、script構文を自動確認します。</div></div></div></div>`;
  const bodies = new Map();
  bodies.set("home", home);
  bodies.set("part-r", await currentChangesSection());
  for (const section of FOUNDATION_SECTIONS) {
    const pages = range(section.start, section.end)
      .map((pageNumber) => {
        const page = foundationByPage.get(pageNumber);
        if (!page) throw new Error(`Missing foundation page ${pageNumber}`);
        return renderLegacyPage(page);
      })
      .join("");
    bodies.set(
      section.id,
      `<div class="section-hero"><div class="section-kicker">FOUNDATION + CURRENT OVERRIDE</div><h1>${escapeHtml(section.label)} - ${escapeHtml(section.title)}</h1><div class="lead">旧版から継承した初心者向け詳細解説です。現在の完成状態と衝突する場合は、「2026-08-31 最新差分」と「付録A 完成ソース」を優先してください。</div></div><div class="update-note"><strong>HTML移行メモ:</strong> 元のページ番号と選択可能文字を保持してHTMLへ移行しました。Node.js要件とtest件数は現行値へ補正し、変更されたコードページには差し替え注意を表示しています。</div>${pages}`,
    );
  }
  bodies.set("appendix-a", await renderSourceAppendix(catalog));
  bodies.set("appendix-b", htmlOperationsSection(foundation, catalog));

  const renderedSections = sections
    .map(
      (section, index) =>
        `<section class="manual-section" id="${section.id}" data-title="${escapeHtml(section.title)}">${bodies.get(section.id)}${sectionNavigation(sections, index)}</section>`,
    )
    .join("");
  let currentGroup = "";
  const toc = sections
    .map((section) => {
      const group =
        section.group !== currentGroup
          ? `<div class="toc-group-title">${section.group}</div>`
          : "";
      currentGroup = section.group;
      return group + tocButton(section);
    })
    .join("");
  const html = template
    .replace("<!--MANUAL_TOC-->", () => toc)
    .replace("<!--MANUAL_SECTIONS-->", () => renderedSections);
  if (
    html === template ||
    html.includes("<!--MANUAL_TOC-->") ||
    html.includes("<!--MANUAL_SECTIONS-->")
  ) {
    throw new Error(
      "Manual template placeholders were not replaced exactly once",
    );
  }
  return { html, foundation, catalog, sections };
}

async function main() {
  const { html, foundation, catalog, sections } = await buildManualHtml();
  const temporary = `${OUTPUT}.tmp`;
  await writeFile(temporary, html, { encoding: "utf8", mode: 0o644 });
  await rm(OUTPUT, { force: true });
  await rename(temporary, OUTPUT);
  console.log(
    `MANUAL_HTML_CREATED sections=${sections.length} foundation_pages=${foundation.pageCount} source_files=${catalog.sourceFiles.length} bytes=${Buffer.byteLength(html)} sha256=${sha256(Buffer.from(html, "utf8"))}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
