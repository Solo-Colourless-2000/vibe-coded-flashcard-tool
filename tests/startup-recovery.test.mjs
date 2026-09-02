import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageSource = await readFile(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);
const fileStorageSource = await readFile(
  new URL('../app/fileStorage.ts', import.meta.url),
  'utf8',
);
const browserStorageSource = await readFile(
  new URL('../app/browserStorage.ts', import.meta.url),
  'utf8',
);
const importDialogSource = await readFile(
  new URL('../app/ImportDialog.tsx', import.meta.url),
  'utf8',
);
const localServerSource = await readFile(
  new URL('../start-local.mjs', import.meta.url),
  'utf8',
);
const npmConfigSource = await readFile(
  new URL('../.npmrc', import.meta.url),
  'utf8',
);
const spreadsheetWorkerSource = await readFile(
  new URL('../app/spreadsheetWorker.ts', import.meta.url),
  'utf8',
);

test('valid browser data unlocks the interface before optional folder recovery', () => {
  const earlyCommit = pageSource.indexOf('commitInitialSets(nextSets);');
  const folderRestore = pageSource.indexOf(
    'const handle = await getStoredDirectoryHandle();',
  );
  assert.ok(earlyCommit >= 0);
  assert.ok(folderRestore >= 0);
  assert.ok(earlyCommit < folderRestore);
});

test('startup has a fail-safe that cannot silently overwrite fallback samples', () => {
  assert.match(
    pageSource,
    /const INITIAL_STORAGE_RESTORE_TIMEOUT_MS = 3_000;/u,
  );
  assert.match(
    pageSource,
    /const restoreTimeout = window\.setTimeout\(\(\) => \{[\s\S]*?setHydrated\(true\);[\s\S]*?setBrowserStorageBlocked\(true\);/u,
  );
  assert.match(pageSource, /window\.clearTimeout\(restoreTimeout\);/u);
});

test('IndexedDB opening is bounded and treats blocked upgrades as recoverable', () => {
  assert.match(fileStorageSource, /INDEXED_DB_OPEN_TIMEOUT_MS = 2_500/u);
  assert.match(fileStorageSource, /indexed_db_open_timeout/u);
  assert.match(fileStorageSource, /request\.onblocked/u);
  assert.match(fileStorageSource, /database\.close\(\);/u);
  assert.match(
    fileStorageSource,
    /if \(settled\) \{\s*database\.close\(\);\s*return;/u,
  );
  assert.match(
    browserStorageSource,
    /if \(settled\) \{\s*database\.close\(\);\s*return;/u,
  );
});

test('timed-out IndexedDB writes are aborted instead of committing later', () => {
  assert.match(
    fileStorageSource,
    /indexed_db_transaction_timeout[\s\S]*?transaction\.abort\(\)|transaction\.abort\(\)[\s\S]*?indexed_db_transaction_timeout/u,
  );
  assert.match(
    browserStorageSource,
    /indexed_db_transaction_timeout[\s\S]*?transaction\.abort\(\)|transaction\.abort\(\)[\s\S]*?indexed_db_transaction_timeout/u,
  );
});

test('folder disconnect cannot bypass a browser revision conflict', () => {
  const disconnectStart = pageSource.indexOf(
    'async function disconnectProjectFolder()',
  );
  const disconnectEnd = pageSource.indexOf(
    'async function makeBrowserStoragePersistent()',
  );
  const disconnectSource = pageSource.slice(disconnectStart, disconnectEnd);
  assert.match(disconnectSource, /readBrowserStudySnapshot\(\)/u);
  assert.match(disconnectSource, /current\.snapshot\.revision !== browserRevisionRef\.current/u);
  assert.match(disconnectSource, /expectedRevision:/u);
});

test('spreadsheet results are bounded inside the worker before cloning to the UI', () => {
  const validationCall = spreadsheetWorkerSource.indexOf(
    'validateParsedSheets(sheets)',
  );
  const successPost = spreadsheetWorkerSource.indexOf(
    'worker.postMessage(response)',
  );
  assert.ok(validationCall >= 0);
  assert.ok(successPost >= 0);
  assert.ok(validationCall < successPost);
  assert.match(spreadsheetWorkerSource, /MAX_IMPORT_SHEETS/u);
  assert.match(spreadsheetWorkerSource, /MAX_IMPORT_TOTAL_CHARS/u);
  assert.match(spreadsheetWorkerSource, /validateImportRows/u);
});

test('closing or replacing an import cancels the active file parser', () => {
  assert.match(importDialogSource, /const fileAbortRef = useRef<AbortController \| null>\(null\);/u);
  assert.match(importDialogSource, /fileAbortRef\.current\?\.abort\(\);/u);
  assert.match(importDialogSource, /fileRequestIdRef\.current \+= 1;/u);
  assert.match(importDialogSource, /signal\.addEventListener\("abort"/u);
  assert.match(importDialogSource, /if \(requestId !== fileRequestIdRef\.current\) return;/u);
});

test('production startup finishes the first local render before reporting ready', () => {
  assert.match(localServerSource, /STARTUP_WARMUP_TIMEOUT_MS = 30_000/u);
  assert.match(
    localServerSource,
    /await fetch\(`\$\{CANONICAL_ORIGIN\}\/`[\s\S]*?AbortSignal\.timeout\(STARTUP_WARMUP_TIMEOUT_MS\)/u,
  );
  assert.match(localServerSource, /await warmupResponse\.arrayBuffer\(\);/u);
  assert.ok(
    localServerSource.indexOf('await warmupResponse.arrayBuffer();') <
      localServerSource.indexOf('Production server running'),
  );
});

test('unsupported Node.js versions are rejected before local production starts', () => {
  assert.match(npmConfigSource, /^engine-strict=true$/mu);
  assert.match(localServerSource, /process\.versions\.node/u);
  assert.match(localServerSource, />=22\.13\.0 <25/u);
  assert.ok(
    localServerSource.indexOf('assertSupportedNodeVersion();') <
      localServerSource.indexOf('await startProdServer'),
  );
});
