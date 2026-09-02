import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptedStudyAnswers,
  advanceStudyProgress,
  analyzeRows,
  cellToText,
  createStudyProgress,
  DEFAULT_STUDY_BATCH_SIZE,
  getCurrentStudyCardId,
  getStudyBatchIds,
  getStudyScore,
  hasAnyCardContent,
  hasCompleteCardPair,
  isStudyProgressResumable,
  matchesExactly,
  matchesStudyAnswer,
  parseLiteralRows,
  parseStoredSetsText,
  readStoredSets,
  recordCorrectStudyAnswer,
  recordSuccessfulRetype,
  recordWrongStudyAnswer,
  seedSets,
  serializeStudySets,
  shouldAdvanceStudyOnEnter,
  startNextStudyBatch,
  STUDY_BATCH_OPTIONS,
  trimStudyAnswerLineEndWhitespace,
} from '../app/model.ts';
import {
  inspectSpreadsheetArchive,
  MAX_CARD_TEXT_LENGTH,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_STORED_JSON_CHARS,
  preflightDelimitedText,
} from '../app/securityLimits.ts';

test('shared card-content predicates keep draft and import filtering consistent', () => {
  const blank = { id: 'blank', term: '  ', definition: '\n' };
  const partial = { id: 'partial', term: 'C++', definition: '  ' };
  const complete = { id: 'complete', term: '<script>', definition: '記号' };

  assert.equal(hasAnyCardContent(blank), false);
  assert.equal(hasCompleteCardPair(blank), false);
  assert.equal(hasAnyCardContent(partial), true);
  assert.equal(hasCompleteCardPair(partial), false);
  assert.equal(hasAnyCardContent(complete), true);
  assert.equal(hasCompleteCardPair(complete), true);
  const invisible = { id: 'invisible', term: '\u200B', definition: '\uFEFF' };
  assert.equal(hasAnyCardContent(invisible), false);
  assert.equal(hasCompleteCardPair(invisible), false);
});

test('answer comparison is exact and case-sensitive', () => {
  assert.equal(matchesExactly('TLS', 'TLS'), true);
  assert.equal(matchesExactly('tls', 'TLS'), false);
  assert.equal(matchesExactly('Tls', 'TLS'), false);
  assert.equal(matchesExactly(' TLS', 'TLS'), false);
  assert.equal(matchesExactly('TLS ', 'TLS'), false);
});

test('special characters are ordinary literal text', () => {
  const examples = [
    'C++',
    '<script>',
    'A+B=C?',
    'user@example.com',
    '[a-z]*',
    'a.b?c',
    'OAuth 2.0',
  ];
  for (const value of examples) {
    assert.equal(matchesExactly(value, value), true);
    assert.equal(matchesExactly(value + 'x', value), false);
  }
});

test('custom separators are split literally, never as regular expressions', () => {
  assert.deepEqual(
    parseLiteralRows('C++*language;A+B=C?*symbols', '*', ';'),
    [
      ['C++', 'language'],
      ['A+B=C?', 'symbols'],
    ],
  );
  assert.deepEqual(
    parseLiteralRows('<script>|tag\n[a-z]*|pattern', '|', '\n'),
    [
      ['<script>', 'tag'],
      ['[a-z]*', 'pattern'],
    ],
  );
});

test('CSV and TSV preflight bounds logical rows and columns without misreading quoted delimiters', () => {
  assert.equal(preflightDelimitedText('a,b\nc,d', ','), undefined);
  assert.equal(preflightDelimitedText('"a,b",c\n"line 1\nline 2",d', ','), undefined);
  assert.equal(preflightDelimitedText('"' + ','.repeat(300) + '",value', ','), undefined);
  assert.match(
    preflightDelimitedText(Array(MAX_IMPORT_COLUMNS + 1).fill('x').join(','), ','),
    /列数/u,
  );
  assert.match(
    preflightDelimitedText(
      Array(MAX_IMPORT_ROWS + 1).fill('x,y').join('\n'),
      ',',
    ),
    /行数/u,
  );
});

test('import analysis preserves case and symbols and flags only exact duplicates', () => {
  const result = analyzeRows(
    [
      ['TLS', 'Uppercase'],
      ['tls', 'Uppercase'],
      ['TLS', 'Uppercase'],
      ['C++', 'Language'],
      ['<script>', 'Tag'],
    ],
    false,
  );
  assert.equal(result.cards.length, 5);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.cards[3].term, 'C++');
  assert.equal(result.cards[4].term, '<script>');
});

test('incomplete rows are rejected with their source row number', () => {
  const result = analyzeRows(
    [
      ['Term', 'Definition'],
      ['Only term', ''],
      ['', 'Only definition'],
      ['', ''],
    ],
    true,
  );
  assert.equal(result.cards.length, 0);
  assert.deepEqual(
    result.issues.map((issue) => issue.row),
    [2, 3],
  );
  assert.equal(result.emptyCount, 1);
});

test('stored study sets validate and retain exact answer text', () => {
  const serialized = JSON.stringify(seedSets);
  const restored = readStoredSets(serialized);
  assert.ok(restored);
  assert.equal(restored[0].cards[0].term, 'TLS');
  assert.equal(restored[1].cards[0].term, 'C++');
  assert.equal(readStoredSets('{"not":"sets"}'), null);
});

test('multiline answers use canonical LF and still compare exactly', () => {
  assert.equal(cellToText('line 1\r\nline 2\rline 3'), 'line 1\nline 2\nline 3');
  assert.equal(matchesExactly('line 1\nline 2', 'line 1\nline 2'), true);
  assert.equal(matchesExactly('line 1\r\nline 2', 'line 1\nline 2'), false);

  const stored = readStoredSets(
    JSON.stringify([
      {
        ...seedSets[0],
        cards: [
          {
            ...seedSets[0].cards[0],
            term: 'line 1\r\nline 2',
            definition: 'question\rtext',
          },
        ],
      },
    ]),
  );
  assert.ok(stored);
  assert.equal(stored[0].cards[0].term, 'line 1\nline 2');
  assert.equal(stored[0].cards[0].definition, 'question\ntext');
});

test('submission trimming removes only whitespace at each line end', () => {
  const submitted =
    '  function example() {  \n\treturn "A  B";\t\r\n  }\u3000\r  final\u00a0';

  assert.equal(
    trimStudyAnswerLineEndWhitespace(submitted),
    '  function example() {\n\treturn "A  B";\r\n  }\r  final',
  );
  assert.equal(
    trimStudyAnswerLineEndWhitespace('line 1  \n   \n\tline 3\t'),
    'line 1\n\n\tline 3',
  );

  const expected = 'def parse(value):\n    return value';
  assert.equal(
    matchesStudyAnswer('def parse(value):   \n    return value\t', expected),
    true,
  );
  assert.equal(matchesStudyAnswer(expected, expected + '  '), true);
  assert.equal(
    matchesStudyAnswer('def parse(value):\n   return value', expected),
    false,
  );
  assert.equal(
    matchesStudyAnswer('def parse(value):\n    return  value', expected),
    false,
  );
  assert.equal(matchesStudyAnswer(expected + '\n', expected), false);
  assert.equal(matchesStudyAnswer('TLS   ', 'TLS'), true);
  assert.equal(matchesStudyAnswer('tls   ', 'TLS'), false);
  assert.equal(matchesStudyAnswer('<script>   ', '<script>'), true);
  assert.equal(matchesStudyAnswer('cafe\u0301', 'café'), false);
  assert.equal(matchesStudyAnswer('cafe\u0301', 'cafe\u0301'), true);
});

test('plain-text import preserves quotation marks and symbols literally', () => {
  assert.deepEqual(
    parseLiteralRows('"TLS"\t[a-z]*\nC++\tA+B=C?', '\t', '\n'),
    [
      ['"TLS"', '[a-z]*'],
      ['C++', 'A+B=C?'],
    ],
  );
});

test('stored data distinguishes empty, malformed JSON, and invalid structure', () => {
  assert.deepEqual(parseStoredSetsText('[]'), { status: 'valid', sets: [] });
  assert.deepEqual(parseStoredSetsText('{broken'), { status: 'invalid-json' });
  assert.deepEqual(parseStoredSetsText('{"sets":[]}'), {
    status: 'invalid-data',
  });
  assert.deepEqual(readStoredSets('[]'), []);
});

test('spreadsheet dates retain time in deterministic ISO text', () => {
  const value = new Date('2026-08-25T01:02:03.000Z');
  assert.equal(cellToText(value), '2026-08-25T01:02:03.000Z');
});

test('balanced ASCII parenthetical text is optional without weakening significant matching', () => {
  const expected =
    'SOC 2 (System and Organization Controls 2) Type 2 report (SOC 2 Type 2レポート)';
  const variants = acceptedStudyAnswers(expected);

  assert.equal(matchesStudyAnswer(expected, expected), true);
  assert.equal(matchesStudyAnswer('SOC 2 Type 2 report', expected), true);
  assert.equal(
    matchesStudyAnswer('SOC 2 Type 2 report', expected, {
      allowParentheticalOmission: false,
    }),
    false,
  );
  assert.equal(
    matchesStudyAnswer(expected + '  ', expected, {
      allowParentheticalOmission: false,
    }),
    true,
  );
  assert.equal(
    matchesStudyAnswer(
      'SOC 2 (System and Organization Controls 2) Type 2 report',
      expected,
    ),
    true,
  );
  assert.equal(
    matchesStudyAnswer(
      'SOC 2 Type 2 report (SOC 2 Type 2レポート)',
      expected,
    ),
    true,
  );
  assert.equal(variants.includes('SOC 2 Type 2 report'), true);
  assert.equal(matchesStudyAnswer('soc 2 Type 2 report', expected), false);
  assert.equal(matchesStudyAnswer(' SOC 2 Type 2 report', expected), false);
  assert.equal(matchesStudyAnswer('SOC 2 Type 2 report ', expected), true);
  assert.equal(matchesStudyAnswer('System and Organization Controls 2', expected), false);
});

test('many optional annotations support arbitrary omissions without exponential variants', () => {
  const expected =
    'A (1) B (2) C (3) D (4) E (5) F (6) G (7) H (8) I (9) J (10) K (11) L';
  const twoOmissions =
    'A (1) B C (3) D (4) E (5) F (6) G (7) H (8) I (9) J K (11) L';

  assert.equal(matchesStudyAnswer(twoOmissions, expected), true);
  assert.equal(matchesStudyAnswer(twoOmissions.replace('A', 'a'), expected), false);
  assert.equal(matchesStudyAnswer(twoOmissions.replace('B C', 'B  C'), expected), false);
  assert.deepEqual(acceptedStudyAnswers(expected), [expected]);

  const adjacentGroups = Array.from(
    { length: 11 },
    (_, index) => '(' + (index + 1) + ')',
  ).join('');
  const leadingAdjacent = adjacentGroups + ' Tail';
  assert.equal(matchesStudyAnswer('(2)(10) Tail', leadingAdjacent), true);
  assert.equal(matchesStudyAnswer('Tail', leadingAdjacent), true);
  assert.equal(matchesStudyAnswer(' Tail', leadingAdjacent), false);
  assert.equal(matchesStudyAnswer('(2)(10)Tail', leadingAdjacent), false);

  const trailingAdjacent = 'Head ' + adjacentGroups;
  assert.equal(matchesStudyAnswer('Head (2)(10)', trailingAdjacent), true);
  assert.equal(matchesStudyAnswer('Head', trailingAdjacent), true);
  assert.equal(matchesStudyAnswer('Head ', trailingAdjacent), true);

  const pathological = Array.from({ length: 6_000 }, () => '(x)').join('');
  assert.doesNotThrow(() => matchesStudyAnswer('not-a-match', pathological));
  assert.equal(matchesStudyAnswer('not-a-match', pathological), false);
});

test('optional parentheses preserve surrounding punctuation and literal symbols', () => {
  const iso =
    'ISO (International Organization for Standardization)/IEC (International Electrotechnical Commission) 27001 (日本語)';
  assert.equal(matchesStudyAnswer('ISO/IEC 27001', iso), true);
  assert.equal(
    matchesStudyAnswer('Point-in-time assessment', 'Point-in-time (one-time) assessment (一時点評価)'),
    true,
  );

  const symbols = ['C++', '[a-z]*', '<script>', 'A+B=C?', 'user@example.com'];
  for (const symbol of symbols) {
    assert.equal(matchesStudyAnswer(symbol, symbol + ' (annotation)'), true);
    assert.equal(matchesStudyAnswer(symbol + 'x', symbol + ' (annotation)'), false);
  }
});

test('unbalanced, empty, nested, and full-width parentheses have deterministic behavior', () => {
  assert.deepEqual(acceptedStudyAnswers('A (B'), ['A (B']);
  assert.equal(matchesStudyAnswer('A', 'A (B'), false);
  assert.deepEqual(acceptedStudyAnswers('printf()'), ['printf()']);
  assert.equal(matchesStudyAnswer('printf', 'printf()'), false);
  assert.deepEqual(acceptedStudyAnswers('A （B）'), ['A （B）']);
  assert.equal(matchesStudyAnswer('A', 'A （B）'), false);
  assert.deepEqual(acceptedStudyAnswers('Alpha (Beta (Gamma))'), [
    'Alpha (Beta (Gamma))',
  ]);
  assert.equal(matchesStudyAnswer('Alpha', 'Alpha (Beta (Gamma))'), false);
  assert.equal(matchesStudyAnswer('', '(only optional text)'), false);
});

test('all six selectable question group sizes enforce their boundaries', () => {
  assert.deepEqual(STUDY_BATCH_OPTIONS, [1, 3, 5, 10, 15, 20]);
  assert.equal(DEFAULT_STUDY_BATCH_SIZE, 15);
  assert.equal(
    createStudyProgress(
      [],
      'definition-to-term',
      false,
      DEFAULT_STUDY_BATCH_SIZE,
      true,
      '2026-08-25T00:00:00.000Z',
    ),
    null,
  );
  assert.equal(
    createStudyProgress(
      ['duplicate-card', 'duplicate-card'],
      'definition-to-term',
      false,
      DEFAULT_STUDY_BATCH_SIZE,
      true,
      '2026-08-25T00:00:00.000Z',
    ),
    null,
  );

  for (const batchSize of STUDY_BATCH_OPTIONS) {
    for (const size of [Math.max(1, batchSize - 1), batchSize, batchSize + 1]) {
      const ids = Array.from(
        { length: size },
        (_, index) => 'card-' + (index + 1),
      );
      const progress = createStudyProgress(
        ids,
        'definition-to-term',
        false,
        batchSize,
        true,
        '2026-08-25T00:00:00.000Z',
      );
      assert.ok(progress);
      assert.equal(progress.batchSize, batchSize);
      assert.equal(getStudyBatchIds(progress).length, Math.min(size, batchSize));
      assert.equal(progress.roundOrder.length, Math.min(size, batchSize));
      assert.deepEqual(progress.roundOrder, ids.slice(0, batchSize));
    }
  }

  for (const unsupportedSize of [0, 2, 4, 21, '10']) {
    assert.equal(
      createStudyProgress(
        ['card-1'],
        'definition-to-term',
        false,
        unsupportedSize,
      ),
      null,
    );
  }
  assert.equal(
    createStudyProgress(
      ['card-1'],
      'definition-to-term',
      false,
      DEFAULT_STUDY_BATCH_SIZE,
      'yes',
    ),
    null,
  );
});

test('the next group stays locked until the selected group is mastered', () => {
  for (const batchSize of STUDY_BATCH_OPTIONS) {
    const ids = Array.from(
      { length: batchSize + 1 },
      (_, index) => 'card-' + (index + 1),
    );
    let progress = createStudyProgress(
      ids,
      'definition-to-term',
      false,
      batchSize,
      true,
      '2026-08-25T00:00:00.000Z',
    );
    assert.ok(progress);

    for (let index = 0; index < batchSize; index += 1) {
      assert.equal(getCurrentStudyCardId(progress), ids[index]);
      progress = recordCorrectStudyAnswer(progress);
      const result = advanceStudyProgress(progress);
      progress = result.progress;
      assert.equal(
        result.status,
        index === batchSize - 1 ? 'batch-complete' : 'active',
      );
      assert.equal(progress.roundOrder.includes(ids[batchSize]), false);
    }

    assert.equal(progress.phase, 'batch-complete');
    progress = startNextStudyBatch(progress);
    assert.equal(progress.batchSize, batchSize);
    assert.deepEqual(progress.roundOrder, [ids[batchSize]]);
    assert.equal(getCurrentStudyCardId(progress), ids[batchSize]);
  }
});

test('wrong answers are retyped and then recalled again before a batch unlocks', () => {
  const ids = Array.from({ length: 16 }, (_, index) => 'card-' + (index + 1));
  let progress = createStudyProgress(ids, 'definition-to-term', false);
  assert.ok(progress);

  progress = recordWrongStudyAnswer(progress, '  wrong  \n\tcode\t');
  assert.equal(progress.phase, 'retype');
  assert.equal(progress.wrongAnswer, '  wrong\n\tcode');
  assert.deepEqual(progress.retryIds, [ids[0]]);
  assert.deepEqual(progress.masteredIds, []);

  progress = recordSuccessfulRetype(progress);
  let result = advanceStudyProgress(progress);
  progress = result.progress;
  assert.equal(result.status, 'active');
  assert.equal(getCurrentStudyCardId(progress), ids[1]);

  for (let index = 1; index < 15; index += 1) {
    progress = recordCorrectStudyAnswer(progress);
    result = advanceStudyProgress(progress);
    progress = result.progress;
  }

  assert.equal(result.status, 'active');
  assert.deepEqual(progress.roundOrder, [ids[0]]);
  assert.equal(getCurrentStudyCardId(progress), ids[0]);
  assert.equal(progress.masteredIds.length, 14);

  progress = recordWrongStudyAnswer(progress, 'wrong again');
  progress = recordSuccessfulRetype(progress);
  result = advanceStudyProgress(progress);
  progress = result.progress;
  assert.equal(result.status, 'active');
  assert.deepEqual(progress.roundOrder, [ids[0]]);

  progress = recordCorrectStudyAnswer(progress);
  result = advanceStudyProgress(progress);
  progress = result.progress;
  assert.equal(result.status, 'batch-complete');
  assert.equal(progress.firstTryCorrectIds.includes(ids[0]), false);
  assert.equal(progress.wrongAttemptCount, 2);

  progress = startNextStudyBatch(progress);
  progress = recordCorrectStudyAnswer(progress);
  result = advanceStudyProgress(progress);
  assert.equal(result.status, 'complete');
  assert.equal(getStudyScore(result.progress), 94);
});

test('valid progress round-trips while stale or malformed progress is discarded only', () => {
  const set = seedSets[0];
  const ids = set.cards.map((card) => card.id);
  const progress = createStudyProgress(
    ids,
    'term-to-definition',
    true,
    DEFAULT_STUDY_BATCH_SIZE,
    true,
    '2026-08-25T00:00:00.000Z',
  );
  assert.ok(progress);
  const parsed = parseStoredSetsText(JSON.stringify([{ ...set, studyProgress: progress }]));
  assert.equal(parsed.status, 'valid');
  assert.deepEqual(parsed.sets[0].studyProgress, progress);
  assert.equal(isStudyProgressResumable(parsed.sets[0].studyProgress, ids), true);
  assert.equal(isStudyProgressResumable(progress, ids.slice(1)), false);

  const strictProgress = createStudyProgress(
    ids,
    'term-to-definition',
    true,
    DEFAULT_STUDY_BATCH_SIZE,
    false,
    '2026-08-25T00:00:00.000Z',
  );
  assert.ok(strictProgress);
  const strictParsed = parseStoredSetsText(
    JSON.stringify([{ ...set, studyProgress: strictProgress }]),
  );
  assert.equal(strictParsed.status, 'valid');
  assert.deepEqual(strictParsed.sets[0].studyProgress, strictProgress);
  assert.equal(
    strictParsed.sets[0].studyProgress.allowParentheticalOmission,
    false,
  );

  const malformed = {
    ...progress,
    roundOrder: [...progress.roundOrder, 'unknown-card'],
  };
  const recovered = parseStoredSetsText(
    JSON.stringify([{ ...set, studyProgress: malformed }]),
  );
  assert.equal(recovered.status, 'valid');
  assert.equal(recovered.sets[0].cards.length, set.cards.length);
  assert.equal(recovered.sets[0].studyProgress, undefined);

  const legacyProgress = { ...progress, version: 1 };
  delete legacyProgress.batchSize;
  const migrated = parseStoredSetsText(
    JSON.stringify([{ ...set, studyProgress: legacyProgress }]),
  );
  assert.equal(migrated.status, 'valid');
  assert.deepEqual(migrated.sets[0].studyProgress, progress);
  assert.equal(migrated.sets[0].studyProgress.batchSize, 15);

  const versionTwoProgress = { ...progress, version: 2 };
  delete versionTwoProgress.allowParentheticalOmission;
  const migratedVersionTwo = parseStoredSetsText(
    JSON.stringify([{ ...set, studyProgress: versionTwoProgress }]),
  );
  assert.equal(migratedVersionTwo.status, 'valid');
  assert.deepEqual(migratedVersionTwo.sets[0].studyProgress, progress);
  assert.equal(
    migratedVersionTwo.sets[0].studyProgress.allowParentheticalOmission,
    true,
  );
});

test('retype, correct, and batch-complete checkpoints resume without skipping work', () => {
  const set = seedSets[0];
  const ids = set.cards.map((card) => card.id);
  const restore = (progress) => {
    const parsed = parseStoredSetsText(
      JSON.stringify([{ ...set, studyProgress: progress }]),
    );
    assert.equal(parsed.status, 'valid');
    assert.ok(parsed.sets[0].studyProgress);
    assert.deepEqual(parsed.sets[0].studyProgress, progress);
    return parsed.sets[0].studyProgress;
  };

  let retype = createStudyProgress(ids, 'definition-to-term', false);
  assert.ok(retype);
  retype = recordWrongStudyAnswer(retype, 'Wrong\nanswer');
  retype = restore(retype);
  assert.equal(retype.phase, 'retype');
  assert.equal(retype.wrongAnswer, 'Wrong\nanswer');
  assert.deepEqual(retype.masteredIds, []);

  let correctedRetype = recordSuccessfulRetype(retype);
  correctedRetype = restore(correctedRetype);
  assert.equal(correctedRetype.phase, 'correct');
  assert.equal(correctedRetype.resolvedByRetype, true);
  assert.deepEqual(correctedRetype.masteredIds, []);
  const afterRetype = advanceStudyProgress(correctedRetype);
  assert.equal(afterRetype.status, 'active');
  assert.equal(getCurrentStudyCardId(afterRetype.progress), ids[1]);
  assert.deepEqual(afterRetype.progress.retryIds, [ids[0]]);

  let directCorrect = createStudyProgress(ids, 'definition-to-term', false);
  assert.ok(directCorrect);
  directCorrect = recordCorrectStudyAnswer(directCorrect);
  directCorrect = restore(directCorrect);
  assert.equal(directCorrect.phase, 'correct');
  assert.deepEqual(directCorrect.masteredIds, [ids[0]]);
  assert.deepEqual(directCorrect.firstTryCorrectIds, [ids[0]]);
  const afterDirectCorrect = advanceStudyProgress(directCorrect);
  assert.equal(getCurrentStudyCardId(afterDirectCorrect.progress), ids[1]);
  assert.deepEqual(afterDirectCorrect.progress.firstTryCorrectIds, [ids[0]]);

  let batchComplete = createStudyProgress(ids, 'definition-to-term', false);
  assert.ok(batchComplete);
  for (let index = 0; index < 15; index += 1) {
    batchComplete = recordCorrectStudyAnswer(batchComplete);
    batchComplete = advanceStudyProgress(batchComplete).progress;
  }
  batchComplete = restore(batchComplete);
  assert.equal(batchComplete.phase, 'batch-complete');
  assert.equal(batchComplete.masteredIds.length, 15);
  const nextBatch = startNextStudyBatch(batchComplete);
  assert.deepEqual(nextBatch.roundOrder, [ids[15]]);
  assert.equal(getCurrentStudyCardId(nextBatch), ids[15]);
  assert.equal(nextBatch.firstTryCorrectIds.length, 15);
});

test('plain Enter advances only in the safe non-interactive case', () => {
  assert.equal(shouldAdvanceStudyOnEnter({ key: 'Enter' }), true);
  assert.equal(
    shouldAdvanceStudyOnEnter({ key: 'Enter', isComposing: true }),
    false,
  );
  assert.equal(shouldAdvanceStudyOnEnter({ key: 'Enter', repeat: true }), false);
  assert.equal(shouldAdvanceStudyOnEnter({ key: 'Enter', ctrlKey: true }), false);
  assert.equal(shouldAdvanceStudyOnEnter({ key: 'Enter', metaKey: true }), false);
  assert.equal(shouldAdvanceStudyOnEnter({ key: 'Enter', shiftKey: true }), false);
  assert.equal(
    shouldAdvanceStudyOnEnter({ key: 'Enter', interactiveTarget: true }),
    false,
  );
  assert.equal(shouldAdvanceStudyOnEnter({ key: 'Space' }), false);
});

test('tuple-safe duplicate detection cannot be confused by literal NUL text', () => {
  const result = analyzeRows(
    [
      ['a', 'b\u0000c'],
      ['a\u0000b', 'c'],
    ],
    false,
  );
  assert.equal(result.fatalError, undefined);
  assert.equal(result.cards.length, 2);
  assert.equal(result.duplicateCount, 0);
});

test('import limits reject excessive rows, columns, cells, and separators', () => {
  const tooManyRows = Array.from(
    { length: MAX_IMPORT_ROWS + 1 },
    () => ['', ''],
  );
  assert.match(analyzeRows(tooManyRows, false).fatalError, /行数/u);
  assert.match(
    analyzeRows([Array(MAX_IMPORT_COLUMNS + 1).fill('x')], false).fatalError,
    /列数/u,
  );
  assert.match(
    analyzeRows([['x'.repeat(MAX_CARD_TEXT_LENGTH + 1), 'y']], false)
      .fatalError,
    /セル/u,
  );
  assert.deepEqual(parseLiteralRows('a|b', 'x'.repeat(101), '\n'), []);

  const bounded = parseLiteralRows(
    Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => 'a|b').join('\n'),
    '|',
    '\n',
  );
  assert.equal(bounded.length, MAX_IMPORT_ROWS + 1);
  assert.match(analyzeRows(bounded, false).fatalError, /行数/u);
});

test('stored data rejects oversized, duplicate, reserved, and malformed fields', () => {
  const source = seedSets[1];
  const duplicateSet = JSON.stringify([source, { ...source }]);
  assert.equal(parseStoredSetsText(duplicateSet).status, 'invalid-data');

  const duplicateCard = {
    ...source,
    cards: [source.cards[0], { ...source.cards[0] }],
  };
  assert.equal(
    parseStoredSetsText(JSON.stringify([duplicateCard])).status,
    'invalid-data',
  );
  assert.equal(
    parseStoredSetsText(
      JSON.stringify([{ ...source, id: '__proto__' }]),
    ).status,
    'invalid-data',
  );
  assert.equal(
    parseStoredSetsText(JSON.stringify([{ ...source, lastScore: 101 }])).status,
    'invalid-data',
  );
  assert.equal(
    parseStoredSetsText(
      JSON.stringify([{ ...source, updatedAt: 'not-a-date' }]),
    ).status,
    'invalid-data',
  );
  assert.equal(
    parseStoredSetsText(
      JSON.stringify([
        {
          ...source,
          cards: [
            {
              ...source.cards[0],
              term: 'x'.repeat(MAX_CARD_TEXT_LENGTH + 1),
            },
          ],
        },
      ]),
    ).status,
    'invalid-data',
  );
  assert.equal(
    parseStoredSetsText(' '.repeat(MAX_STORED_JSON_CHARS + 1)).status,
    'too-large',
  );
  assert.equal({}.polluted, undefined);
});

test('stored objects are rebuilt from an allowlist and hostile text stays literal', () => {
  const payload = '</script><img src=x onerror=globalThis.pwned=true>';
  const source = {
    ...seedSets[1],
    unexpected: { deeply: { nested: true } },
    title: payload,
    cards: [
      {
        ...seedSets[1].cards[0],
        term: payload,
        unexpectedCardField: '<svg onload=alert(1)>',
      },
    ],
  };
  const parsed = parseStoredSetsText(JSON.stringify([source]));
  assert.equal(parsed.status, 'valid');
  assert.equal(parsed.sets[0].title, payload);
  assert.equal(parsed.sets[0].cards[0].term, payload);
  assert.equal('unexpected' in parsed.sets[0], false);
  assert.equal('unexpectedCardField' in parsed.sets[0].cards[0], false);

  const serialized = serializeStudySets(parsed.sets);
  assert.equal(parseStoredSetsText(serialized).status, 'valid');
  assert.equal(globalThis.pwned, undefined);
});

test('forged progress that skips cards or preloads future results is discarded', () => {
  const set = seedSets[0];
  const ids = set.cards.map((card) => card.id);
  const progress = createStudyProgress(
    ids,
    'definition-to-term',
    false,
    DEFAULT_STUDY_BATCH_SIZE,
    true,
    '2026-08-25T00:00:00.000Z',
  );
  assert.ok(progress);

  const forgedSkip = {
    ...progress,
    roundOrder: [ids[0]],
    masteredIds: ids.slice(1, 15),
    firstTryCorrectIds: ids.slice(1, 15),
  };
  const forgedFuture = {
    ...progress,
    firstTryCorrectIds: [ids[15]],
  };
  const forgedPhase = {
    ...progress,
    wrongAnswer: 'already supplied',
    resolvedByRetype: true,
  };
  const forgedCounter = {
    ...progress,
    wrongAttemptCount: Number.MAX_SAFE_INTEGER + 1,
  };
  const forgedBatchSize = {
    ...progress,
    batchSize: 2,
  };

  for (const forged of [
    forgedSkip,
    forgedFuture,
    forgedPhase,
    forgedCounter,
    forgedBatchSize,
  ]) {
    const parsed = parseStoredSetsText(
      JSON.stringify([{ ...set, studyProgress: forged }]),
    );
    assert.equal(parsed.status, 'valid');
    assert.equal(parsed.sets[0].studyProgress, undefined);
  }
});

function makeSpreadsheetArchive(entries) {
  const encoder = new TextEncoder();
  const encoded = entries.map((entry) => ({
    ...entry,
    nameBytes: encoder.encode(entry.name),
  }));
  const localSize = encoded.reduce(
    (total, entry) =>
      total + 30 + entry.nameBytes.length + (entry.compressed ?? 0),
    0,
  );
  const centralSize = encoded.reduce(
    (total, entry) => total + 46 + entry.nameBytes.length,
    0,
  );
  const buffer = new ArrayBuffer(localSize + centralSize + 22);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let localOffset = 0;
  let centralOffset = localSize;

  for (const entry of encoded) {
    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 4, 20, true);
    view.setUint16(localOffset + 6, entry.flags ?? 0, true);
    view.setUint16(localOffset + 8, 8, true);
    view.setUint32(localOffset + 18, entry.compressed ?? 0, true);
    view.setUint32(localOffset + 22, entry.uncompressed ?? 0, true);
    view.setUint16(localOffset + 26, entry.nameBytes.length, true);
    bytes.set(entry.nameBytes, localOffset + 30);

    view.setUint32(centralOffset, 0x02014b50, true);
    view.setUint16(centralOffset + 4, 20, true);
    view.setUint16(centralOffset + 6, 20, true);
    view.setUint16(centralOffset + 8, entry.flags ?? 0, true);
    view.setUint16(centralOffset + 10, 8, true);
    view.setUint32(centralOffset + 20, entry.compressed ?? 0, true);
    view.setUint32(centralOffset + 24, entry.uncompressed ?? 0, true);
    view.setUint16(centralOffset + 28, entry.nameBytes.length, true);
    view.setUint32(centralOffset + 42, localOffset, true);
    bytes.set(entry.nameBytes, centralOffset + 46);

    localOffset += 30 + entry.nameBytes.length + (entry.compressed ?? 0);
    centralOffset += 46 + entry.nameBytes.length;
  }

  const endOffset = localSize + centralSize;
  view.setUint32(endOffset, 0x06054b50, true);
  view.setUint16(endOffset + 8, encoded.length, true);
  view.setUint16(endOffset + 10, encoded.length, true);
  view.setUint32(endOffset + 12, centralSize, true);
  view.setUint32(endOffset + 16, localSize, true);
  return buffer;
}

test('spreadsheet ZIP preflight accepts a bounded workbook and rejects bombs', () => {
  const requiredEntries = [
    { name: '[Content_Types].xml' },
    { name: 'xl/workbook.xml' },
  ];
  assert.equal(inspectSpreadsheetArchive(makeSpreadsheetArchive(requiredEntries)).ok, true);

  const expanded = inspectSpreadsheetArchive(
    makeSpreadsheetArchive([
      { name: '[Content_Types].xml', compressed: 1, uncompressed: 21_000_000 },
      { name: 'xl/workbook.xml' },
    ]),
  );
  assert.deepEqual(expanded, { ok: false, reason: 'expanded-too-large' });

  const compressed = inspectSpreadsheetArchive(
    makeSpreadsheetArchive([
      { name: '[Content_Types].xml', compressed: 1, uncompressed: 101 },
      { name: 'xl/workbook.xml' },
    ]),
  );
  assert.deepEqual(compressed, {
    ok: false,
    reason: 'suspicious-compression',
  });

  const encrypted = inspectSpreadsheetArchive(
    makeSpreadsheetArchive([
      { name: '[Content_Types].xml', flags: 1 },
      { name: 'xl/workbook.xml' },
    ]),
  );
  assert.deepEqual(encrypted, { ok: false, reason: 'encrypted' });

  const unsafePath = inspectSpreadsheetArchive(
    makeSpreadsheetArchive([
      ...requiredEntries,
      { name: '../outside.xml' },
    ]),
  );
  assert.deepEqual(unsafePath, { ok: false, reason: 'unsafe-path' });

  const malformedLocalHeader = makeSpreadsheetArchive(requiredEntries);
  new DataView(malformedLocalHeader).setUint32(0, 0, true);
  assert.deepEqual(inspectSpreadsheetArchive(malformedLocalHeader), {
    ok: false,
    reason: 'malformed',
  });

  assert.deepEqual(inspectSpreadsheetArchive(new ArrayBuffer(24)), {
    ok: false,
    reason: 'malformed',
  });
});
