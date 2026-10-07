import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";
import {
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
  const [{ html: expected, catalog, sections, development }, actual, packageText, readme] = await Promise.all([
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
  requireCondition(Buffer.byteLength(actual) > 300_000, "HTML is unexpectedly small");
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
  for (const id of matches(actual, /\bhref="#([^"]+)"/gu).map((match) => match[1])) {
    requireCondition(allIds.includes(id), `Internal manual link references missing id: ${id}`);
  }
  for (const id of matches(actual, /\bdata-target="([^"]+)"/gu).map((match) => match[1])) {
    requireCondition(sectionIds.includes(id), `Manual navigation references missing section: ${id}`);
  }
  const referencedIds = matches(actual, /getElementById\(\s*["']([^"']+)["']\s*\)/gu).map((match) => match[1]);
  for (const id of referencedIds) requireCondition(allIds.includes(id), `Inline script references missing id: ${id}`);

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
    "24章・102工程",
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
  requireCondition(actual.includes("searchIndex = sections.map"), "Full-text search must cover every section");
  requireCondition(sectionIds.every((id) => /^(?:home|learn-[a-z-]+|appendix-[ab])$/u.test(id)), "Unexpected manual section");
  requireCondition(!/<article class="legacy-page|data-history="true"/u.test(actual), "Unexpected archived content");
  const narrative = actual
    .replace(/<style>[\s\S]*?<\/style>/gu, "")
    .replace(/<script>[\s\S]*?<\/script>/gu, "")
    .replace(/<details class="source-file"[\s\S]*?<\/details>/gu, "")
    .replace(/<pre>[\s\S]*?<\/pre>/gu, "");
  const obsoleteProse = /旧版|旧バージョン|従来版|旧形式|旧進捗|localStorage|foundation_pages|849ページ|HISTORICAL REFERENCE/u;
  requireCondition(!obsoleteProse.test(narrative), "Manual narrative must describe the current application");
  requireCondition(!obsoleteProse.test(readme), "README must describe the current application");
  const guideNarrative = JSON.stringify(development.guide, (key, value) => key === "excerpt" ? undefined : value);
  requireCondition(!obsoleteProse.test(guideNarrative), "Tutorial data must describe the current application");
  const sourceDetails = matches(actual, /<details class="source-file" data-file="([^"]+)"/gu).map((match) => match[1]);
  for (const file of matches(actual, /class="manual-jump"[^>]*data-file="([^"]+)"/gu).map((match) => match[1])) {
    requireCondition(sourceDetails.includes(file), "Teaching link references a missing source: " + file);
  }
  console.log("MANUAL_CONTENT_OK chapters=" + development.guide.chapters.length + " teaching_steps=" + development.excerpts.length + " module_coverage=" + covered.size);
  const basic = await verifyWorkshop(ROOT);
  console.log("MANUAL_WORKSHOP_OK steps=" + basic.steps + " files=" + basic.files + " grading_tests=" + basic.gradingTests);
  const maintenance = await verifySearchWorkshop(ROOT);
  console.log("MANUAL_MAINTENANCE_OK steps=" + maintenance.steps + " files=" + maintenance.files + " search_tests=" + maintenance.gradingTests + " recheck_states=" + maintenance.recheckStates + " rejected_invalid_states=" + maintenance.rejectedInvalidStates);

  const bytes = Buffer.byteLength(actual);
  console.log(`MANUAL_HTML_OK sections=${sections.length} source_files=${catalog.sourceFiles.length} bytes=${bytes} sha256=${sha256(Buffer.from(actual, "utf8"))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
