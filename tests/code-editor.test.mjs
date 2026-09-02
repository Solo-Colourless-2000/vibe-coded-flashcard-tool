import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  indentWithTab,
  insertNewlineAndIndent,
} from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { indentUnit } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import { matchesStudyAnswer } from '../app/model.ts';

const editorSource = await readFile(
  new URL('../app/CodeAnswerEditor.tsx', import.meta.url),
  'utf8',
);
const pageSource = await readFile(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);
const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

test('the study and retype inputs use the same CodeMirror editor', () => {
  assert.equal((pageSource.match(/<CodeAnswerEditor\b/gu) ?? []).length, 2);
  assert.match(pageSource, /ref=\{answerInputRef\}/u);
  assert.match(pageSource, /ref=\{retypeInputRef\}/u);
  assert.match(pageSource, /onChange=\{setAnswer\}/u);
  assert.match(pageSource, /onChange=\{setRetypeAnswer\}/u);
  assert.match(pageSource, /language=\{codeLanguage\}/u);
  assert.doesNotMatch(
    pageSource,
    /<textarea[^>]+id="study-(?:answer|retype)"/su,
  );
});

test('the editor provides code-focused keyboard and navigation features', () => {
  assert.match(editorSource, /basicSetup/u);
  assert.match(editorSource, /indentWithTab/u);
  assert.match(editorSource, /const CODE_INDENT_SIZE = 4/u);
  assert.match(
    editorSource,
    /const CODE_INDENT_UNIT = " "\.repeat\(CODE_INDENT_SIZE\)/u,
  );
  assert.match(editorSource, /indentUnit\.of\(CODE_INDENT_UNIT\)/u);
  assert.match(
    editorSource,
    /EditorState\.tabSize\.of\(CODE_INDENT_SIZE\)/u,
  );
  assert.doesNotMatch(editorSource, /EditorState\.tabSize\.of\(2\)/u);
  assert.match(editorSource, /key:\s*"Mod-Enter"/u);
  assert.match(editorSource, /Prec\.highest\(\s*keymap\.of/u);
  assert.match(editorSource, /preventDefault:\s*true/u);
  assert.match(editorSource, /currentView\.composing/u);
  assert.match(
    editorSource,
    /"aria-keyshortcuts":\s*"Control\+Enter Meta\+Enter"/u,
  );
  assert.match(editorSource, /EditorView\.lineWrapping/u);
  assert.match(editorSource, /EditorState\.changeFilter/u);
  assert.match(editorSource, /transaction\.newDoc\.length <= maxLength/u);
  assert.match(editorSource, /viewRef\.current\?\.focus\(\)/u);
  assert.match(editorSource, /行 \{status\.line\}、列 \{status\.column\}/u);
  assert.match(editorSource, /Tabで4スペース分インデント/u);
});

function runEditorCommand(state, command) {
  let nextState = state;
  const handled = command({
    state,
    dispatch(transaction) {
      nextState = transaction.state;
    },
  });
  assert.equal(handled, true);
  return nextState;
}

test('Tab and language-aware newline indentation both use four spaces', () => {
  const indentationExtensions = [
    indentUnit.of('    '),
    EditorState.tabSize.of(4),
  ];
  let tabState = EditorState.create({
    doc: 'answer',
    extensions: indentationExtensions,
  });

  tabState = runEditorCommand(tabState, indentWithTab.run);
  assert.equal(tabState.doc.toString(), '    answer');
  assert.equal(tabState.facet(indentUnit), '    ');
  assert.equal(tabState.tabSize, 4);

  let newlineState = EditorState.create({
    doc: 'if ready:',
    selection: { anchor: 'if ready:'.length },
    extensions: [...indentationExtensions, python()],
  });
  newlineState = runEditorCommand(newlineState, insertNewlineAndIndent);
  assert.equal(newlineState.doc.toString(), 'if ready:\n    ');
});

test('the CodeMirror search panel stays compact and localized', () => {
  assert.match(editorSource, /"\.cm-panel\.cm-search"/u);
  assert.match(editorSource, /flexWrap:\s*"wrap"/u);
  assert.match(
    editorSource,
    /"\.cm-panel\.cm-search input\[type=checkbox\]"[\s\S]*?width:\s*"14px"[\s\S]*?height:\s*"14px"/u,
  );
  assert.match(editorSource, /const japaneseEditorPhrases/u);
  assert.match(editorSource, /"match case":\s*"大文字・小文字"/u);
  assert.match(editorSource, /"replace all":\s*"すべて置換"/u);
  assert.match(
    editorSource,
    /"\.cm-searchMatch-selected\.cm-searchMatch-selected"[\s\S]*?rgba\(143, 169, 167, 0\.3\)/u,
  );
  assert.doesNotMatch(css, /\.study-answer-form input(?:\s|,|\{|:)/u);
  assert.doesNotMatch(css, /\.study-answer-form textarea(?:\s|,|\{|:)/u);
  assert.match(css, /\.study-answer-form > input/u);
  assert.match(css, /\.study-answer-form > textarea/u);
});

test('syntax highlighting uses a restrained low-saturation dark palette', () => {
  assert.match(editorSource, /HighlightStyle\.define/u);
  assert.match(editorSource, /syntaxHighlighting\(gentleSyntaxHighlighting\)/u);
  assert.doesNotMatch(editorSource, /oneDark|theme-one-dark/u);

  const styleSource = editorSource.match(
    /const gentleSyntaxHighlighting = HighlightStyle\.define\(\[([\s\S]*?)\]\);/u,
  )?.[1];
  assert.ok(styleSource);
  const colors = [...styleSource.matchAll(/color:\s*"#([\da-f]{6})"/giu)].map(
    (match) => match[1],
  );
  assert.ok(colors.length >= 8);

  for (const color of colors) {
    const channels = [0, 2, 4].map((offset) =>
      Number.parseInt(color.slice(offset, offset + 2), 16),
    );
    const maximum = Math.max(...channels);
    const minimum = Math.min(...channels);
    const lightness = (maximum + minimum) / (2 * 255);
    const saturation =
      maximum === minimum
        ? 0
        : (maximum - minimum) /
          (255 * (1 - Math.abs(2 * lightness - 1)));
    assert.ok(saturation <= 0.4, `#${color} is too saturated`);
    assert.ok(lightness >= 0.48 && lightness <= 0.72);
  }
});

test('the language menu covers common coding-answer formats', () => {
  for (const language of [
    'plain',
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'python',
    'html',
    'css',
    'json',
    'sql',
    'java',
  ]) {
    assert.match(editorSource, new RegExp('"' + language + '"', 'u'));
  }
  assert.match(editorSource, /await import\("@codemirror\/lang-javascript"\)/u);
  assert.doesNotMatch(editorSource, /^import \{ javascript \}/mu);
});

test('long code stays inside a responsive editor that can expand', () => {
  assert.match(
    css,
    /\.code-answer-editor\s*\{[^}]*min-width:\s*0;[^}]*border:/su,
  );
  assert.match(
    css,
    /\.code-editor-host \.cm-scroller\s*\{[^}]*overscroll-behavior:\s*contain/su,
  );
  assert.match(
    css,
    /\.code-answer-editor\.expanded\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*16px;[^}]*z-index:\s*130/su,
  );
  assert.match(
    css,
    /@media \(max-width:\s*650px\)[\s\S]*?\.code-answer-editor\.expanded\s*\{[^}]*inset:\s*0/su,
  );
});

test('CodeMirror text trims line ends but keeps indentation and case exact', () => {
  const expected = 'function add(a, b) {\n  return a + b;\n}';
  assert.equal(matchesStudyAnswer(expected, expected), true);
  assert.equal(
    matchesStudyAnswer('function add(a, b) {   \n  return a + b;\t\n}', expected),
    true,
  );
  assert.equal(
    matchesStudyAnswer('function add(a, b) {\n return a + b;\n}', expected),
    false,
  );
  assert.equal(
    matchesStudyAnswer('function Add(a, b) {\n  return a + b;\n}', expected),
    false,
  );
  assert.equal(matchesStudyAnswer(expected + '\n', expected), false);
});

test('both editor forms trim submitted line ends before processing', () => {
  assert.match(
    pageSource,
    /const submittedAnswer = trimStudyAnswerLineEndWhitespace\(answer\)/u,
  );
  assert.match(
    pageSource,
    /recordWrongStudyAnswer\(studyRun, submittedAnswer\)/u,
  );
  assert.match(
    pageSource,
    /const submittedRetype = trimStudyAnswerLineEndWhitespace\(retypeAnswer\)/u,
  );
  assert.match(
    pageSource,
    /matchesStudyAnswer\(submittedRetype, expectedAnswer, \{[\s\S]*?allowParentheticalOmission:[\s\S]*?studyRun\.allowParentheticalOmission/su,
  );
});
