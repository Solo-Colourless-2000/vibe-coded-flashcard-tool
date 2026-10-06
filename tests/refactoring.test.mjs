import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modalSource = await readFile(
  new URL('../app/recall/shared/ModalDialog.tsx', import.meta.url),
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
  assert.equal((modalSource.match(/useModalDialog\(/gu) ?? []).length, 1);
  assert.equal((importDialogSource.match(/useModalDialog\(/gu) ?? []).length, 1);
  assert.doesNotMatch(modalSource, /FOCUSABLE_ELEMENT_SELECTOR/u);
  assert.doesNotMatch(importDialogSource, /FOCUSABLE_ELEMENT_SELECTOR/u);

  assert.match(modalHookSource, /element\.inert = true/u);
  assert.match(modalHookSource, /event\.key === "Escape"/u);
  assert.match(modalHookSource, /event\.key !== "Tab"/u);
  assert.match(modalHookSource, /previousFocus\?\.focus\(\)/u);
});

test('storage, restore, and delete dialogs all use the shared modal shell', async () => {
  for (const file of [
    'storage/StorageDialog.tsx',
    'storage/BackupRestoreDialog.tsx',
    'library/DeleteSetDialog.tsx',
  ]) {
    const source = await readFile(new URL('../app/recall/' + file, import.meta.url), 'utf8');
    assert.match(source, /<ModalDialog\b/u);
    assert.doesNotMatch(source, /useModalDialog\(|FOCUSABLE_ELEMENT_SELECTOR/u);
  }
});

test('backup confirmation replaces storage settings instead of stacking focus traps', async () => {
  const source = await readFile(
    new URL('../app/recall/storage/StorageDialog.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /if \(!storageDialogOpen \|\| storage\.backupRestoreCandidate\) return null/u);
});
