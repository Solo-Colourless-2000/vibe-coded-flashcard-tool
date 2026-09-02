import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
const pageSource = await readFile(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);

test('the page does not force a horizontal scrollbar at the narrowest viewport', () => {
  assert.match(css, /body\s*\{[^}]*min-width:\s*0;/su);
  assert.doesNotMatch(css, /body\s*\{[^}]*min-width:\s*320px;/su);
});

test('medium widths release the fixed sidebar before the study editor is cramped', () => {
  assert.match(
    css,
    /@media \(max-width:\s*960px\)[\s\S]*?\.app-shell\s*\{[^}]*grid-template-columns:\s*1fr/su,
  );
  assert.match(
    css,
    /@media \(max-width:\s*960px\)[\s\S]*?\.study-main-grid\s*\{[^}]*grid-template-columns:\s*1fr/su,
  );
});

test('the narrowest header uses icon navigation without wrapped text', () => {
  assert.match(
    css,
    /@media \(max-width:\s*440px\)[\s\S]*?\.nav-item\s*\{[^}]*width:\s*40px;[^}]*white-space:\s*nowrap;[^}]*font-size:\s*0;/su,
  );
  assert.match(
    css,
    /@media \(max-width:\s*440px\)[\s\S]*?\.nav-item svg\s*\{[^}]*display:\s*block/su,
  );
  assert.match(pageSource, /aria-label="TOTAL RECALL ホームへ戻る"/u);
});

test('save errors and warnings are not announced as successful operations', () => {
  assert.match(pageSource, /type ToastTone = "success" \| "info" \| "warning" \| "error"/u);
  assert.match(pageSource, /className=\{"toast toast-" \+ toast\.tone\}/u);
  assert.match(pageSource, /toast\.tone === "error" \|\| toast\.tone === "warning"/u);
  assert.match(css, /\.toast-error\s*\{[^}]*border-color:\s*var\(--danger\)/su);
  assert.match(css, /\.toast-warning\s*\{[^}]*border-color:\s*#c7a75c/su);
});

test('the current-group score excludes answers from earlier groups', () => {
  assert.match(
    pageSource,
    /const firstTryCorrectInBatch = batchIds\.filter[\s\S]*?const attemptedInBatch = batchIds\.filter/su,
  );
  assert.match(
    pageSource,
    /firstTryCorrectInBatch \/ attemptedInBatch/u,
  );
});

test('parenthetical omission is selectable and the saved session setting drives matching', () => {
  assert.match(
    pageSource,
    /checked=\{allowParentheticalOmission\}[\s\S]*?setAllowParentheticalOmission\(event\.target\.checked\)/su,
  );
  assert.match(
    pageSource,
    /createStudyProgress\([\s\S]*?studyBatchSize,[\s\S]*?allowParentheticalOmission,[\s\S]*?\)/su,
  );
  assert.ok(
    (pageSource.match(/studyRun\.allowParentheticalOmission/gu) ?? []).length >= 5,
  );
  assert.match(
    pageSource,
    /activeSet\.studyProgress\.allowParentheticalOmission/u,
  );
});

test('study typography uses the requested prompt and post-correct sizes', () => {
  assert.match(
    css,
    /\.question-copy\s*\{[^}]*font-size:\s*clamp\(14px, 2vw, 22px\)/su,
  );
  assert.match(
    css,
    /\.correct-answer-box strong\s*\{[^}]*font-size:\s*17px/su,
  );
  assert.match(
    css,
    /\.correct-state small\s*\{[^}]*font-size:\s*14px/su,
  );
});

test('study workspace expands while retaining a bounded outer margin', () => {
  assert.match(
    css,
    /\.content\.view-study\s*\{[^}]*padding-inline:\s*clamp\(8px, 1\.5vw, 23px\)/su,
  );
  assert.match(css, /\.study-workspace\s*\{[^}]*max-width:\s*1600px/su);
});

test('a 3:2 or wider viewport places the prompt beside the answer area', () => {
  assert.match(css, /@media \(min-aspect-ratio:\s*3 \/ 2\)/u);
  assert.match(
    css,
    /\.question-panel\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/su,
  );
  assert.match(
    css,
    /\.question-copy\s*\{[^}]*grid-column:\s*1;[^}]*border-right:\s*1px solid var\(--line\);[^}]*border-bottom:\s*0/su,
  );
  assert.match(
    css,
    /\.question-panel > \.study-answer-form,[\s\S]*?grid-column:\s*2;/u,
  );
});

test('the retype view keeps feedback below the prompt and the form on the right', () => {
  const leftColumnIndex = pageSource.indexOf('className="retype-left"');
  const promptIndex = pageSource.indexOf(
    '<div className="question-copy">{currentPrompt}</div>',
    leftColumnIndex,
  );
  const feedbackIndex = pageSource.indexOf('className="retype-feedback"');
  const formIndex = pageSource.indexOf(
    'className="study-answer-form retype-form"',
  );

  assert.match(
    pageSource,
    /className=\{`question-panel\$\{[\s\S]*?studyPhase === "retype" \? " is-retype" : ""/u,
  );
  assert.ok(leftColumnIndex >= 0, 'the retype left column must exist');
  assert.ok(
    promptIndex > leftColumnIndex && feedbackIndex > promptIndex,
    'the feedback must follow the prompt inside the retype left column',
  );
  assert.ok(feedbackIndex >= 0, 'the retype feedback wrapper must exist');
  assert.ok(
    formIndex > feedbackIndex,
    'the retype form must follow the feedback in narrow-layout document order',
  );
  assert.match(
    css,
    /\.question-panel\.is-retype\s*\{[^}]*min-height:\s*0;[^}]*grid-template-rows:\s*auto auto auto;/su,
  );
  assert.match(
    css,
    /\.question-panel\.is-retype > \.retype-left\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*justify-content:\s*space-between;/su,
  );
  assert.match(
    css,
    /\.question-panel\.is-retype > \.retype-form\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*2;/su,
  );
});

test('dense counts and user-authored titles cannot escape their cards', () => {
  assert.match(
    css,
    /\.score-box\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*88px;[^}]*max-width:\s*100%/su,
  );
  assert.match(
    css,
    /\.score-box strong\s*\{[^}]*font-size:\s*clamp\(15px, 1\.4vw, 18px\);[^}]*white-space:\s*nowrap/su,
  );
  for (const selector of [
    '\\.continue-top h2',
    '\\.set-card h3',
    '\\.library-copy h2',
    '\\.study-ready h1',
    '\\.flashcard-view > header h1',
  ]) {
    assert.match(
      css,
      new RegExp(selector + '\\s*\\{[^}]*overflow-wrap:\\s*anywhere', 'su'),
    );
  }
  for (const selector of [
    '\\.sidebar-note strong',
    '\\.confirm-dialog p',
    '\\.storage-status strong',
  ]) {
    assert.match(
      css,
      new RegExp(selector + '\\s*\\{[^}]*overflow-wrap:\\s*anywhere', 'su'),
    );
  }
});

test('dialogs and compact landscape study views retain usable space', () => {
  assert.match(
    css,
    /\.sidebar\s*\{[^}]*height:\s*100dvh;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain/su,
  );
  assert.match(
    css,
    /\.dialog-body\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow:\s*auto/su,
  );
  assert.match(
    css,
    /@media \(min-aspect-ratio:\s*3 \/ 2\) and \(max-width:\s*1500px\)[\s\S]*?\.content\.view-study \.study-main-grid\s*\{[^}]*grid-template-columns:\s*1fr/su,
  );
  assert.match(
    css,
    /\.toast\s*\{[^}]*max-width:\s*min\(460px, calc\(100vw - 48px\)\);[^}]*overflow-wrap:\s*anywhere/su,
  );
});

test('saved sets finish loading before the sample collection can render', () => {
  const guardIndex = pageSource.indexOf('if (!hydrated) {');
  const appShellIndex = pageSource.indexOf('<main className="app-shell">');

  assert.ok(guardIndex >= 0, 'the hydration guard must exist');
  assert.ok(
    appShellIndex > guardIndex,
    'the data-backed application shell must render only after hydration',
  );
  assert.match(
    pageSource.slice(guardIndex, appShellIndex),
    /aria-busy="true" className="app-loading"/u,
  );
});
