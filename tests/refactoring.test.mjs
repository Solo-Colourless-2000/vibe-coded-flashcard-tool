import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageSource = await readFile(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);
const importDialogSource = await readFile(
  new URL('../app/ImportDialog.tsx', import.meta.url),
  'utf8',
);
const modalHookSource = await readFile(
  new URL('../app/useModalDialog.ts', import.meta.url),
  'utf8',
);

test('every modal uses the shared focus, inert, Escape, and Tab controller', () => {
  assert.equal((pageSource.match(/useModalDialog\(/gu) ?? []).length, 3);
  assert.equal((importDialogSource.match(/useModalDialog\(/gu) ?? []).length, 1);
  assert.doesNotMatch(pageSource, /FOCUSABLE_ELEMENT_SELECTOR/u);
  assert.doesNotMatch(importDialogSource, /FOCUSABLE_ELEMENT_SELECTOR/u);

  assert.match(modalHookSource, /element\.inert = true/u);
  assert.match(modalHookSource, /event\.key === "Escape"/u);
  assert.match(modalHookSource, /event\.key !== "Tab"/u);
  assert.match(modalHookSource, /previousFocus\?\.focus\(\)/u);
});
