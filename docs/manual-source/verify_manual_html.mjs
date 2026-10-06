import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";
import {
  AFFECTED_FOUNDATION_PAGES,
  MANUAL_SOURCE,
  MANUAL_FILE_NAME,
  MANUAL_REVISION,
  OUTPUT,
  ROOT,
  buildManualHtml,
  sha256,
} from "./generate_manual_html.mjs";

import { verifyWorkshop, verifySearchWorkshop } from "./verify-workshop.mjs";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function matches(value, expression) {
  return [...value.matchAll(expression)];
}

function syntaxErrors(parser, value) {
  const errors = [];
  parser.parse(value).iterate({
    enter(node) {
      if (node.type.isError) errors.push(`${node.from}-${node.to}`);
    },
  });
  return errors;
}

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

async function main() {
  const [{ html: expected, foundation, catalog, sections, development }, actual, packageText, readme] = await Promise.all([
    buildManualHtml(),
    readFile(OUTPUT, "utf8"),
    readFile(join(ROOT, "package.json"), "utf8"),
    readFile(join(ROOT, "README.md"), "utf8"),
  ]);
  requireCondition(actual === expected, "Generated HTML is stale; run npm run manual:build");
  requireCondition(/^<!doctype html>/iu.test(actual), "Missing HTML5 doctype");
  requireCondition(actual.includes('<html lang="ja">'), "Missing Japanese document language");
  requireCondition(/<meta\s+charset="utf-8"\s*\/?[>]/u.test(actual), "Missing UTF-8 declaration");
  requireCondition(!actual.includes("<!--MANUAL_"), "Unresolved manual template placeholder");
  requireCondition(!actual.includes("\0"), "HTML contains a NUL character");
  requireCondition(Buffer.byteLength(actual) > 5_000_000, "HTML is unexpectedly small");
  const htmlErrors = syntaxErrors(htmlLanguage.parser, actual);
  requireCondition(htmlErrors.length === 0, `HTML parser errors: ${htmlErrors.slice(0, 20).join(", ")}`);
  const styleMatches = matches(actual, /<style>([\s\S]*?)<\/style>/gu);
  requireCondition(styleMatches.length === 1, `Expected one inline style, found ${styleMatches.length}`);
  const cssErrors = syntaxErrors(cssLanguage.parser, styleMatches[0][1]);
  requireCondition(cssErrors.length === 0, `CSS parser errors: ${cssErrors.slice(0, 20).join(", ")}`);
  const compactStyle = styleMatches[0][1].replace(/\s+/gu, "");
  requireCondition(
    compactStyle.includes('font-family:-apple-system,BlinkMacSystemFont,"SegoeUI","YuGothicUI"'),
    "Manual body must prefer Segoe UI for Windows Latin text",
  );
  requireCondition(
    compactStyle.includes('font-family:ui-monospace,"CascadiaMono","SFMono-Regular",Consolas'),
    "Manual code blocks must prefer Windows Latin monospace fonts",
  );
  requireCondition(
    compactStyle.includes(".legacy-pagebr+.line-reference{display:inline-block;margin-top:0.55em;}"),
    "Line-by-line explanations must visually separate each line reference",
  );
  requireCondition(
    /id="searchBtn"[^>]*>\s*Search\s*<\/button/u.test(actual),
    "Desktop search button must use the English Search label",
  );
  requireCondition(
    /id="focusBtn"[^>]*>\s*<svg[\s\S]*?<path\s+d="M4 6h16M4 12h16M4 18h16"/u.test(actual),
    "Focus button must display the hamburger menu icon",
  );
  requireCondition(!actual.includes('id="desktopMenuBtn"'), "Unrequested desktop menu button remains");

  const sectionIds = matches(actual, /<section class="manual-section" id="([^"]+)"/gu).map((match) => match[1]);
  requireCondition(sectionIds.length === sections.length, `Expected ${sections.length} sections, found ${sectionIds.length}`);
  requireCondition(new Set(sectionIds).size === sectionIds.length, "Duplicate manual section id");
  const tocTargets = matches(actual, /class="toc-item" data-target="([^"]+)"/gu).map((match) => match[1]);
  requireCondition(JSON.stringify(tocTargets) === JSON.stringify(sectionIds), "Table of contents does not match section order");

  const allIds = matches(actual, /\bid="([^"]+)"/gu).map((match) => match[1]);
  requireCondition(new Set(allIds).size === allIds.length, "Duplicate HTML id");
  const referencedIds = matches(actual, /getElementById\(\s*["']([^"']+)["']\s*\)/gu).map((match) => match[1]);
  for (const id of referencedIds) requireCondition(allIds.includes(id), `Inline script references missing id: ${id}`);

  const legacyPages = matches(actual, /<article class="legacy-page(?: affected)?" data-source-page="(\d+)" data-source-sha256="([a-f0-9]{64})"/gu);
  requireCondition(legacyPages.length === foundation.pageCount, `Expected ${foundation.pageCount} foundation pages, found ${legacyPages.length}`);
  legacyPages.forEach((match, index) => {
    requireCondition(Number(match[1]) === index + 1, `Foundation page sequence mismatch at ${index + 1}`);
    const sourceText = foundation.pages[index].text.replace(/\r\n?/gu, "\n");
    requireCondition(match[2] === sha256(sourceText), `Foundation page ${index + 1} text hash mismatch`);
  });
  requireCondition(matches(actual, /class="legacy-page affected"/gu).length === AFFECTED_FOUNDATION_PAGES.size, "Affected foundation page count mismatch");

  const legacyArticles = matches(actual, /<article class="legacy-page(?: affected)?"[\s\S]*?<\/article>/gu);
  let lineReferenceCount = 0;
  let insertedLineBreakCount = 0;
  const lineReferenceExpression = /[0-9０-９]+(?:[〜～~－-][0-9０-９]+)?行目/gu;
  for (const article of legacyArticles) {
    const proseOnly = article[0].replace(/<pre>[\s\S]*?<\/pre>/gu, "");
    const references = matches(proseOnly, lineReferenceExpression);
    const wrappedReferences = matches(
      proseOnly,
      /<span class="line-reference">[0-9０-９]+(?:[〜～~－-][0-9０-９]+)?行目<\/span>/gu,
    );
    requireCondition(
      references.length === wrappedReferences.length,
      "Every prose line reference must use the readable line-reference markup",
    );
    for (const reference of wrappedReferences) {
      const prefix = proseOnly.slice(Math.max(0, reference.index - 48), reference.index);
      const beginsVisualLine = prefix.endsWith("<br>")
        || prefix.endsWith("<p>")
        || prefix.endsWith("<li>")
        || prefix.endsWith('<div class="line-explanation-title">');
      requireCondition(beginsVisualLine, `Line reference is not on a new visual line: ${reference[0]}`);
      if (prefix.endsWith("<br>")) insertedLineBreakCount += 1;
    }
    lineReferenceCount += wrappedReferences.length;
  }
  requireCondition(lineReferenceCount > 18_000, `Unexpectedly few readable line references: ${lineReferenceCount}`);
  requireCondition(insertedLineBreakCount > 5_000, `Unexpectedly few inserted line breaks: ${insertedLineBreakCount}`);

  const sourceFiles = matches(actual, /<details class="source-file" /gu).length;
  requireCondition(sourceFiles === catalog.sourceFiles.length, `Expected ${catalog.sourceFiles.length} source files, found ${sourceFiles}`);
  for (const relativePath of catalog.sourceFiles) {
    requireCondition(actual.includes(relativePath.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")), `Missing source appendix entry: ${relativePath}`);
  }

  const scriptMatches = matches(actual, /<script>([\s\S]*?)<\/script>/gu);
  requireCondition(scriptMatches.length === 1, `Expected one inline script, found ${scriptMatches.length}`);
  new Function(scriptMatches[0][1]);
  for (const required of [
    "全文検索",
    "recallWebManualFontScale",
    "navigator.clipboard",
    "data-action=\"prev\"",
    "@media print",
    "HTMLマニュアルの更新と検証",
    "半角カッコ内の省略を許可",
    "script-src &#39;self&#39; &#39;unsafe-inline&#39;",
    "Node.js &gt;=22.13.0 &lt;25",
    "85件のtest",
    "往復する順序",
    "なぜこのコードを書くのか",
    "検索アンカー",
  ]) requireCondition(actual.includes(required), `Missing required HTML manual content: ${required}`);

  requireCondition(!/<script\b[^>]*\bsrc\s*=/iu.test(actual), "External script is not allowed");
  requireCondition(!/<link\b[^>]*\bhref\s*=/iu.test(actual), "External stylesheet is not allowed");
  requireCondition(!/<img\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//iu.test(actual), "External image is not allowed");
  requireCondition(!/@import\s+url\s*\(/iu.test(actual), "CSS import is not allowed");
  requireCondition(!/url\(\s*["']?https?:\/\//iu.test(actual), "External CSS asset is not allowed");
  requireCondition(!/href\s*=\s*["'][^"']+\.pdf(?:[?#][^"']*)?["']/iu.test(actual), "HTML must not link to a PDF manual");

  const packageJson = JSON.parse(packageText);
  requireCondition(packageJson.scripts?.["manual:build"] === "node docs/manual-source/generate_manual_html.mjs", "Missing manual:build script");
  requireCondition(packageJson.scripts?.["manual:verify"] === "node docs/manual-source/verify_manual_html.mjs", "Missing manual:verify script");
  requireCondition(packageJson.scripts?.check?.includes("npm run manual:verify"), "npm run check must verify the HTML manual");
  requireCondition(readme.includes("HTMLマニュアル"), "README does not describe the HTML manual");

  const docsFiles = await walk(join(ROOT, "docs"));
  const remainingPdfs = docsFiles.filter((path) => path.toLocaleLowerCase().endsWith(".pdf"));
  requireCondition(remainingPdfs.length === 0, `PDF manuals remain: ${remainingPdfs.map((path) => relative(ROOT, path)).join(", ")}`);
  for (const retired of ["generate_reaudit_manuals.py", "verify_manuals.py", "inspect_rendered_pages.py"]) {
    const retiredPath = join(MANUAL_SOURCE, retired);
    const exists = await stat(retiredPath).then(() => true, () => false);
    requireCondition(!exists, `Retired PDF manual tool remains: ${retired}`);
  }

  requireCondition(readme.includes("](docs/" + MANUAL_FILE_NAME + ")"), "README must link to the exact current manual filename");
  requireCondition(actual.includes(MANUAL_REVISION), "Manual revision is missing");
  const manuals = docsFiles.filter((path) => /^docs[\\/]([^\\/]+)\.html$/u.test(relative(ROOT, path)));
  requireCondition(manuals.length === 1 && manuals[0] === OUTPUT, "Only the current manual may remain at docs root");
  requireCondition(development.guide.chapters.length >= 24 && development.excerpts.length >= 100, "The detailed current tutorial is incomplete");
  const covered = new Set(development.excerpts.map((item) => item.file));
  for (const file of catalog.sourceFiles.filter((file) => file.startsWith("app/recall/"))) {
    requireCondition(covered.has(file), "Current feature module lacks a teaching step: " + file);
  }
  requireCondition(matches(actual, /data-guide-step="/gu).length === development.excerpts.length, "Teaching step count mismatch");
  requireCondition(matches(actual, /data-workshop-step="/gu).length === development.workshopSteps, "Basic workshop step count mismatch");
  requireCondition(matches(actual, /data-search-step="/gu).length === development.searchWorkshopSteps, "Maintenance workshop step count mismatch");
  requireCondition(actual.includes('section.dataset.history !== "true"'), "Default search must exclude historical chapters");
  requireCondition(sections.findIndex((section) => section.history) > sections.findIndex((section) => section.id === "appendix-b"), "Historical material must follow the current manual");
  const sourceDetails = matches(actual, /<details class="source-file" data-file="([^"]+)"/gu).map((match) => match[1]);
  for (const file of matches(actual, /class="manual-jump"[^>]*data-file="([^"]+)"/gu).map((match) => match[1])) {
    requireCondition(sourceDetails.includes(file), "Teaching link references a missing source: " + file);
  }
  console.log("MANUAL_CONTENT_OK chapters=" + development.guide.chapters.length + " teaching_steps=" + development.excerpts.length + " module_coverage=" + covered.size);
  const basic = await verifyWorkshop(ROOT);
  console.log("MANUAL_WORKSHOP_OK steps=" + basic.steps + " files=" + basic.files + " grading_tests=" + basic.gradingTests);
  const maintenance = await verifySearchWorkshop(ROOT);
  console.log("MANUAL_MAINTENANCE_OK steps=" + maintenance.steps + " files=" + maintenance.files + " search_tests=" + maintenance.gradingTests);

  const bytes = Buffer.byteLength(actual);
  console.log(`MANUAL_HTML_OK sections=${sections.length} foundation_pages=${foundation.pageCount} affected_pages=${AFFECTED_FOUNDATION_PAGES.size} line_references=${lineReferenceCount} inserted_line_breaks=${insertedLineBreakCount} source_files=${catalog.sourceFiles.length} bytes=${bytes} sha256=${sha256(Buffer.from(actual, "utf8"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
