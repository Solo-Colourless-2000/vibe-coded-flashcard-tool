import {
  MAX_CARD_TEXT_LENGTH,
  MAX_CARDS_PER_SET,
  MAX_ID_LENGTH,
  MAX_IMPORT_CARDS,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ISSUES,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_TEXT_CHARS,
  MAX_IMPORT_TOTAL_CHARS,
  MAX_SEPARATOR_LENGTH,
  MAX_SET_DESCRIPTION_LENGTH,
  MAX_SET_TITLE_LENGTH,
  MAX_STORED_JSON_CHARS,
  MAX_STUDY_SETS,
  MAX_TOTAL_STORED_CARDS,
  MAX_WRONG_ATTEMPTS,
} from './securityLimits.ts';

export type Flashcard = {
  id: string;
  term: string;
  definition: string;
};

export type StudyDirection = 'definition-to-term' | 'term-to-definition';
export const STUDY_BATCH_OPTIONS = [1, 3, 5, 10, 15, 20] as const;
export type StudyBatchSize = (typeof STUDY_BATCH_OPTIONS)[number];
export const DEFAULT_STUDY_BATCH_SIZE: StudyBatchSize = 15;

export type StudyProgressPhase =
  | 'question'
  | 'retype'
  | 'correct'
  | 'batch-complete';

export type StudyProgress = {
  version: 3;
  direction: StudyDirection;
  shuffleEnabled: boolean;
  allowParentheticalOmission: boolean;
  batchSize: StudyBatchSize;
  courseOrder: string[];
  batchStart: number;
  roundOrder: string[];
  roundIndex: number;
  retryIds: string[];
  masteredIds: string[];
  firstTryCorrectIds: string[];
  missedIds: string[];
  wrongAttemptCount: number;
  phase: StudyProgressPhase;
  wrongAnswer: string;
  resolvedByRetype: boolean;
  startedAt: string;
  updatedAt: string;
};

export type StudySet = {
  id: string;
  title: string;
  description: string;
  cards: Flashcard[];
  createdAt: string;
  updatedAt: string;
  lastStudiedAt?: string;
  lastScore?: number;
  studyProgress?: StudyProgress;
};

export type ImportIssue = {
  row: number;
  message: string;
};

export type ImportAnalysis = {
  cards: Flashcard[];
  issues: ImportIssue[];
  duplicateCount: number;
  emptyCount: number;
  fatalError?: string;
};

export type StoredSetsParseResult =
  | { status: 'valid'; sets: StudySet[] }
  | { status: 'invalid-json' }
  | { status: 'invalid-data' }
  | { status: 'too-large' };

export const STORAGE_KEY = 'recall-study-sets-v1';
export const DRAFT_KEY = 'recall-editor-draft-v1';

let idCounter = 0;

export function makeId(prefix = 'item'): string {
  idCounter += 1;
  let randomPart: string;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    randomPart = crypto.randomUUID();
  } else if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const values = crypto.getRandomValues(new Uint32Array(4));
    randomPart = Array.from(values, (value) => value.toString(36)).join('-');
  } else {
    randomPart = 'fallback';
  }
  return prefix + '-' + Date.now().toString(36) + '-' + idCounter.toString(36) + '-' + randomPart;
}

export function createBlankCards(count = 4): Flashcard[] {
  return Array.from({ length: count }, () => ({
    id: makeId('card'),
    term: '',
    definition: '',
  }));
}

function hasVisibleText(value: string): boolean {
  return value
    .replace(/[\s\u200B\u200C\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu, "")
    .length > 0;
}

export function hasAnyCardContent(card: Flashcard): boolean {
  return hasVisibleText(card.term) || hasVisibleText(card.definition);
}

export function hasCompleteCardPair(card: Flashcard): boolean {
  return hasVisibleText(card.term) && hasVisibleText(card.definition);
}

export function matchesExactly(value: string, expected: string): boolean {
  return value === expected;
}

/**
 * Removes horizontal whitespace only when it appears at the end of a line.
 * Leading indentation, whitespace inside a line, line breaks, case, and all
 * other characters remain untouched.
 */
export function trimStudyAnswerLineEndWhitespace(value: string): string {
  return value.replace(/[^\S\r\n]+(?=\r\n|\r|\n|$)/gu, '');
}

type ParentheticalGroup = {
  start: number;
  end: number;
};

const MAX_OPTIONAL_MATCH_OPERATIONS = 250_000;
const MAX_OPTIONAL_MATCH_GROUPS = 512;
const MAX_OPTIONAL_VARIANT_OUTPUT_CHARS = 500_000;

function findOptionalParentheticalGroups(value: string): ParentheticalGroup[] {
  const groups: ParentheticalGroup[] = [];
  let index = 0;

  while (index < value.length) {
    if (value[index] !== '(') {
      index += 1;
      continue;
    }

    const start = index;
    let depth = 1;
    let hasNestedParentheses = false;
    index += 1;
    while (index < value.length && depth > 0) {
      if (value[index] === '(') {
        depth += 1;
        hasNestedParentheses = true;
      }
      if (value[index] === ')') depth -= 1;
      index += 1;
    }

    if (depth !== 0) break;
    const end = index;
    if (
      !hasNestedParentheses &&
      value.slice(start + 1, end - 1).length > 0
    ) {
      groups.push({ start, end });
    }
  }

  return groups;
}

function startsWithTightPunctuation(value: string): boolean {
  return /^[\/,.;:!?%\]}>、。・：；！？]/u.test(value);
}

function omitParentheticalGroups(
  expected: string,
  groups: ParentheticalGroup[],
  omittedIndexes: Set<number>,
): string {
  let result = expected;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    if (!omittedIndexes.has(index)) continue;
    const group = groups[index];
    let before = result.slice(0, group.start);
    let after = result.slice(group.end);

    if (before.endsWith(' ') && (after.length === 0 || after.startsWith(' '))) {
      before = before.slice(0, -1);
    } else if (before.endsWith(' ') && startsWithTightPunctuation(after)) {
      before = before.slice(0, -1);
    } else if (before.length === 0 && after.startsWith(' ')) {
      after = after.slice(1);
    }

    result = before + after;
  }
  return result;
}

export function acceptedStudyAnswers(expected: string): string[] {
  if (expected.length > MAX_CARD_TEXT_LENGTH) return [expected];
  const groups = findOptionalParentheticalGroups(expected);
  if (groups.length === 0) return [expected];

  // This helper returns a concrete list, so bound both the variant count and
  // their combined worst-case text size. The matcher below preserves the same
  // acceptance rules without materializing every variant.
  if (
    groups.length > 10 ||
    2 ** groups.length * Math.max(expected.length, 1) >
      MAX_OPTIONAL_VARIANT_OUTPUT_CHARS
  ) {
    return [expected];
  }

  const variants = new Set<string>([expected]);
  const addVariant = (omittedIndexes: Set<number>) => {
    const candidate = omitParentheticalGroups(
      expected,
      groups,
      omittedIndexes,
    );
    if (candidate.length > 0) variants.add(candidate);
  };

  const combinationCount = 2 ** groups.length;
  for (let mask = 1; mask < combinationCount; mask += 1) {
    const omittedIndexes = new Set<number>();
    for (let index = 0; index < groups.length; index += 1) {
      if ((mask & (2 ** index)) !== 0) omittedIndexes.add(index);
    }
    addVariant(omittedIndexes);
  }

  return Array.from(variants);
}

function matchesManyOptionalGroups(
  value: string,
  expected: string,
  groups: ParentheticalGroup[],
): boolean {
  if (
    value.length === 0 ||
    groups.length > MAX_OPTIONAL_MATCH_GROUPS
  ) {
    return false;
  }

  function runReverseMatch(
    target: string,
    leadingSpaceWasTrimmed: boolean,
  ): boolean {
    const failedStates = new Set<string>();
    let operations = 0;

    function endsWithAt(text: string, end: number): boolean {
      const start = end - text.length;
      return start >= 0 && target.startsWith(text, start);
    }

    function search(
      groupIndex: number,
      expectedEnd: number,
      targetEnd: number,
    ): boolean {
      operations += 1;
      if (operations > MAX_OPTIONAL_MATCH_OPERATIONS) return false;
      const stateKey = groupIndex + ':' + expectedEnd + ':' + targetEnd;
      if (failedStates.has(stateKey)) return false;

      if (groupIndex < 0) {
        const prefix = expected.slice(0, expectedEnd);
        const matches =
          prefix.length === targetEnd && target.startsWith(prefix, 0);
        if (!matches) failedStates.add(stateKey);
        return matches;
      }

      const group = groups[groupIndex];
      const suffixLiteral = expected.slice(group.end, expectedEnd);
      if (!endsWithAt(suffixLiteral, targetEnd)) {
        failedStates.add(stateKey);
        return false;
      }
      const beforeSuffix = targetEnd - suffixLiteral.length;
      const groupText = expected.slice(group.start, group.end);
      const firstGroupAtStart = groupIndex === 0 && group.start === 0;

      if (!leadingSpaceWasTrimmed || !firstGroupAtStart) {
        if (
          endsWithAt(groupText, beforeSuffix) &&
          search(
            groupIndex - 1,
            group.start,
            beforeSuffix - groupText.length,
          )
        ) {
          return true;
        }
      }

      const afterFirstCharacter = target[beforeSuffix] ?? '';
      if (firstGroupAtStart) {
        const validLeadingSpaceMode = leadingSpaceWasTrimmed
          ? afterFirstCharacter === ' '
          : afterFirstCharacter !== ' ';
        if (
          validLeadingSpaceMode &&
          search(groupIndex - 1, group.start, beforeSuffix)
        ) {
          return true;
        }
      } else {
        let nextExpectedEnd = group.start;
        if (
          expected[group.start - 1] === ' ' &&
          (afterFirstCharacter === '' ||
            afterFirstCharacter === ' ' ||
            startsWithTightPunctuation(afterFirstCharacter))
        ) {
          nextExpectedEnd -= 1;
        }
        if (search(groupIndex - 1, nextExpectedEnd, beforeSuffix)) {
          return true;
        }
      }

      failedStates.add(stateKey);
      return false;
    }

    return search(groups.length - 1, expected.length, target.length);
  }

  if (runReverseMatch(value, false)) return true;
  return groups[0]?.start === 0
    ? runReverseMatch(' ' + value, true)
    : false;
}

export type StudyAnswerMatchOptions = {
  allowParentheticalOmission?: boolean;
};

export function matchesStudyAnswer(
  value: string,
  expected: string,
  options: StudyAnswerMatchOptions = {},
): boolean {
  const submittedValue = trimStudyAnswerLineEndWhitespace(value);
  const comparableExpected = trimStudyAnswerLineEndWhitespace(expected);
  if (submittedValue === comparableExpected) return true;
  if (options.allowParentheticalOmission === false) return false;
  if (comparableExpected.length > MAX_CARD_TEXT_LENGTH) return false;
  const groups = findOptionalParentheticalGroups(comparableExpected);
  if (
    groups.length <= 10 &&
    2 ** groups.length * Math.max(comparableExpected.length, 1) <=
      MAX_OPTIONAL_VARIANT_OUTPUT_CHARS
  ) {
    return acceptedStudyAnswers(comparableExpected).some(
      (variant) => submittedValue === variant,
    );
  }
  return matchesManyOptionalGroups(
    submittedValue,
    comparableExpected,
    groups,
  );
}

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function isStudyBatchSize(value: unknown): value is StudyBatchSize {
  return (
    typeof value === 'number' &&
    STUDY_BATCH_OPTIONS.some((size) => size === value)
  );
}

export function getStudyBatchIds(progress: StudyProgress): string[] {
  return progress.courseOrder.slice(
    progress.batchStart,
    progress.batchStart + progress.batchSize,
  );
}

export function createStudyProgress(
  courseOrder: string[],
  direction: StudyDirection,
  shuffleEnabled: boolean,
  batchSize: StudyBatchSize = DEFAULT_STUDY_BATCH_SIZE,
  allowParentheticalOmission = true,
  now = new Date().toISOString(),
): StudyProgress | null {
  if (
    courseOrder.length === 0 ||
    !hasUniqueStrings(courseOrder) ||
    !isStudyBatchSize(batchSize) ||
    typeof allowParentheticalOmission !== 'boolean'
  ) {
    return null;
  }
  return {
    version: 3,
    direction,
    shuffleEnabled,
    allowParentheticalOmission,
    batchSize,
    courseOrder: [...courseOrder],
    batchStart: 0,
    roundOrder: courseOrder.slice(0, batchSize),
    roundIndex: 0,
    retryIds: [],
    masteredIds: [],
    firstTryCorrectIds: [],
    missedIds: [],
    wrongAttemptCount: 0,
    phase: 'question',
    wrongAnswer: '',
    resolvedByRetype: false,
    startedAt: now,
    updatedAt: now,
  };
}

export function getCurrentStudyCardId(
  progress: StudyProgress,
): string | undefined {
  return progress.roundOrder[progress.roundIndex];
}

export function recordCorrectStudyAnswer(
  progress: StudyProgress,
  now = new Date().toISOString(),
): StudyProgress {
  if (progress.phase !== 'question') return progress;
  const cardId = getCurrentStudyCardId(progress);
  if (!cardId) return progress;
  const firstTryCorrectIds = progress.missedIds.includes(cardId)
    ? progress.firstTryCorrectIds
    : appendUnique(progress.firstTryCorrectIds, cardId);
  return {
    ...progress,
    masteredIds: appendUnique(progress.masteredIds, cardId),
    firstTryCorrectIds,
    phase: 'correct',
    wrongAnswer: '',
    resolvedByRetype: false,
    updatedAt: now,
  };
}

export function recordWrongStudyAnswer(
  progress: StudyProgress,
  wrongAnswer: string,
  now = new Date().toISOString(),
): StudyProgress {
  if (progress.phase !== 'question') return progress;
  const cardId = getCurrentStudyCardId(progress);
  if (!cardId) return progress;
  return {
    ...progress,
    retryIds: appendUnique(progress.retryIds, cardId),
    missedIds: appendUnique(progress.missedIds, cardId),
    wrongAttemptCount: progress.wrongAttemptCount + 1,
    phase: 'retype',
    wrongAnswer: trimStudyAnswerLineEndWhitespace(wrongAnswer),
    resolvedByRetype: false,
    updatedAt: now,
  };
}

export function recordSuccessfulRetype(
  progress: StudyProgress,
  now = new Date().toISOString(),
): StudyProgress {
  if (progress.phase !== 'retype') return progress;
  return {
    ...progress,
    phase: 'correct',
    resolvedByRetype: true,
    updatedAt: now,
  };
}

export type AdvanceStudyResult =
  | { status: 'active'; progress: StudyProgress }
  | { status: 'batch-complete'; progress: StudyProgress }
  | { status: 'complete'; progress: StudyProgress };

function questionPhaseState(now: string) {
  return {
    phase: 'question' as const,
    wrongAnswer: '',
    resolvedByRetype: false,
    updatedAt: now,
  };
}

export function advanceStudyProgress(
  progress: StudyProgress,
  now = new Date().toISOString(),
): AdvanceStudyResult {
  if (progress.phase !== 'correct') {
    return { status: 'active', progress };
  }

  if (progress.roundIndex + 1 < progress.roundOrder.length) {
    return {
      status: 'active',
      progress: {
        ...progress,
        roundIndex: progress.roundIndex + 1,
        ...questionPhaseState(now),
      },
    };
  }

  if (progress.retryIds.length > 0) {
    return {
      status: 'active',
      progress: {
        ...progress,
        roundOrder: [...progress.retryIds],
        roundIndex: 0,
        retryIds: [],
        ...questionPhaseState(now),
      },
    };
  }

  const batchIds = getStudyBatchIds(progress);
  const missingIds = batchIds.filter(
    (cardId) => !progress.masteredIds.includes(cardId),
  );
  if (missingIds.length > 0) {
    return {
      status: 'active',
      progress: {
        ...progress,
        roundOrder: missingIds,
        roundIndex: 0,
        ...questionPhaseState(now),
      },
    };
  }

  if (progress.batchStart + batchIds.length < progress.courseOrder.length) {
    const next = {
      ...progress,
      phase: 'batch-complete' as const,
      wrongAnswer: '',
      resolvedByRetype: false,
      updatedAt: now,
    };
    return { status: 'batch-complete', progress: next };
  }

  return {
    status: 'complete',
    progress: { ...progress, updatedAt: now },
  };
}

export function startNextStudyBatch(
  progress: StudyProgress,
  now = new Date().toISOString(),
): StudyProgress {
  if (progress.phase !== 'batch-complete') return progress;
  const currentBatch = getStudyBatchIds(progress);
  const batchStart = progress.batchStart + currentBatch.length;
  const roundOrder = progress.courseOrder.slice(
    batchStart,
    batchStart + progress.batchSize,
  );
  if (roundOrder.length === 0) return progress;
  return {
    ...progress,
    batchStart,
    roundOrder,
    roundIndex: 0,
    retryIds: [],
    masteredIds: [],
    ...questionPhaseState(now),
  };
}

export function getStudyScore(progress: StudyProgress): number {
  return progress.courseOrder.length > 0
    ? Math.round(
        (progress.firstTryCorrectIds.length / progress.courseOrder.length) *
          100,
      )
    : 0;
}

export function shouldAdvanceStudyOnEnter(input: {
  key: string;
  isComposing?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  interactiveTarget?: boolean;
}): boolean {
  return (
    input.key === 'Enter' &&
    !input.isComposing &&
    !input.repeat &&
    !input.defaultPrevented &&
    !input.altKey &&
    !input.ctrlKey &&
    !input.metaKey &&
    !input.shiftKey &&
    !input.interactiveTarget
  );
}

export function normalizeTextLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text =
    value instanceof Date && !Number.isNaN(value.getTime())
      ? value.toISOString()
      : String(value);
  return normalizeTextLineEndings(text);
}

export function flashcardPairKey(term: string, definition: string): string {
  return JSON.stringify([term, definition]);
}

function fatalImport(message: string): ImportAnalysis {
  return {
    cards: [],
    issues: [],
    duplicateCount: 0,
    emptyCount: 0,
    fatalError: message,
  };
}

export function validateImportRows(rows: unknown[][]): string | undefined {
  if (rows.length > MAX_IMPORT_ROWS) {
    return (
      '行数が上限（見出しを除いて' +
      MAX_IMPORT_CARDS +
      '行）を超えています'
    );
  }

  let totalCharacters = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length > MAX_IMPORT_COLUMNS) {
      return '列数が上限（' + MAX_IMPORT_COLUMNS + '列）を超えています';
    }
    for (const value of row) {
      const text = cellToText(value);
      if (text.length > MAX_CARD_TEXT_LENGTH) {
        return (
          '1つのセルが上限（' +
          MAX_CARD_TEXT_LENGTH +
          '文字）を超えています'
        );
      }
      totalCharacters += text.length;
      if (totalCharacters > MAX_IMPORT_TOTAL_CHARS) {
        return '取込データ全体の文字数が上限を超えています';
      }
    }
  }
  return undefined;
}

export function analyzeRows(rows: unknown[][], skipHeader: boolean): ImportAnalysis {
  const validationError = validateImportRows(rows);
  if (validationError) return fatalImport(validationError);

  const cards: Flashcard[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  let emptyCount = 0;

  const startIndex = skipHeader ? 1 : 0;
  for (let rowIndex = startIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const sourceRow = rowIndex + 1;
    let term = cellToText(row[0]);
    const definition = cellToText(row[1]);

    if (cards.length === 0 && term.startsWith('\uFEFF')) {
      term = term.slice(1);
    }

    const termBlank = term.trim().length === 0;
    const definitionBlank = definition.trim().length === 0;

    if (termBlank && definitionBlank) {
      emptyCount += 1;
      continue;
    }

    if (termBlank || definitionBlank) {
      if (issues.length < MAX_IMPORT_ISSUES) {
        issues.push({
          row: sourceRow,
          message: termBlank ? '問題／用語が空です' : '正しい解答／定義が空です',
        });
      }
      continue;
    }

    if (row.slice(2).some((value) => cellToText(value).trim().length > 0)) {
      if (issues.length < MAX_IMPORT_ISSUES) {
        issues.push({
          row: sourceRow,
          message: '3列目以降はプレビューから除外しました',
        });
      }
    }

    const duplicateKey = flashcardPairKey(term, definition);
    if (seen.has(duplicateKey)) {
      duplicateCount += 1;
    }
    seen.add(duplicateKey);

    cards.push({
      id: makeId('card'),
      term,
      definition,
    });
    if (cards.length > MAX_IMPORT_CARDS) {
      return fatalImport(
        'カード枚数が上限（' + MAX_IMPORT_CARDS + '枚）を超えています',
      );
    }
  }

  return { cards, issues, duplicateCount, emptyCount };
}

export function splitByLiteralSeparator(text: string, separator: string): string[] {
  if (
    separator.length === 0 ||
    separator.length > MAX_SEPARATOR_LENGTH ||
    text.length > MAX_IMPORT_TEXT_CHARS
  ) {
    return [];
  }
  return text.split(separator);
}

export function parseLiteralRows(
  text: string,
  fieldSeparator: string,
  cardSeparator: string,
): unknown[][] {
  if (
    !fieldSeparator ||
    !cardSeparator ||
    fieldSeparator.length > MAX_SEPARATOR_LENGTH ||
    cardSeparator.length > MAX_SEPARATOR_LENGTH ||
    text.length > MAX_IMPORT_TEXT_CHARS
  ) {
    return [];
  }
  const normalized =
    cardSeparator === '\n'
      ? text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
      : text;
  const rows: unknown[][] = [];
  let start = 0;
  while (start <= normalized.length) {
    if (rows.length > MAX_IMPORT_ROWS) return rows;
    const separatorIndex = normalized.indexOf(cardSeparator, start);
    const rawRow =
      separatorIndex === -1
        ? normalized.slice(start)
        : normalized.slice(start, separatorIndex);
    const firstSeparator = rawRow.indexOf(fieldSeparator);
    rows.push(
      firstSeparator === -1
        ? [rawRow]
        : [
            rawRow.slice(0, firstSeparator),
            rawRow.slice(firstSeparator + fieldSeparator.length),
          ],
    );
    if (separatorIndex === -1) break;
    start = separatorIndex + cardSeparator.length;
  }
  return rows;
}

function isCard(value: unknown): value is Flashcard {
  if (!value || typeof value !== 'object') return false;
  const card = value as Record<string, unknown>;
  return (
    isSafeIdentifier(card.id) &&
    typeof card.term === 'string' &&
    card.term.length <= MAX_CARD_TEXT_LENGTH &&
    typeof card.definition === 'string' &&
    card.definition.length <= MAX_CARD_TEXT_LENGTH
  );
}

const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;

export function isSafeIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_ID_LENGTH &&
    SAFE_ID_PATTERN.test(value) &&
    !RESERVED_IDS.has(value)
  );
}

function hasUniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 24) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isStructurallyValidStudyProgress(
  value: unknown,
): value is StudyProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Record<string, unknown>;
  const batchSize = progress.batchSize;
  return (
    progress.version === 3 &&
    isStudyBatchSize(batchSize) &&
    (progress.direction === 'definition-to-term' ||
      progress.direction === 'term-to-definition') &&
    typeof progress.shuffleEnabled === 'boolean' &&
    typeof progress.allowParentheticalOmission === 'boolean' &&
    isStringArray(progress.courseOrder) &&
    progress.courseOrder.length <= MAX_CARDS_PER_SET &&
    progress.courseOrder.every(isSafeIdentifier) &&
    isNonNegativeInteger(progress.batchStart) &&
    isStringArray(progress.roundOrder) &&
    progress.roundOrder.length <= batchSize &&
    progress.roundOrder.every(isSafeIdentifier) &&
    isNonNegativeInteger(progress.roundIndex) &&
    isStringArray(progress.retryIds) &&
    progress.retryIds.length <= batchSize &&
    progress.retryIds.every(isSafeIdentifier) &&
    isStringArray(progress.masteredIds) &&
    progress.masteredIds.length <= batchSize &&
    progress.masteredIds.every(isSafeIdentifier) &&
    isStringArray(progress.firstTryCorrectIds) &&
    progress.firstTryCorrectIds.length <= MAX_CARDS_PER_SET &&
    progress.firstTryCorrectIds.every(isSafeIdentifier) &&
    isStringArray(progress.missedIds) &&
    progress.missedIds.length <= MAX_CARDS_PER_SET &&
    progress.missedIds.every(isSafeIdentifier) &&
    isNonNegativeInteger(progress.wrongAttemptCount) &&
    progress.wrongAttemptCount <= MAX_WRONG_ATTEMPTS &&
    (progress.phase === 'question' ||
      progress.phase === 'retype' ||
      progress.phase === 'correct' ||
      progress.phase === 'batch-complete') &&
    typeof progress.wrongAnswer === 'string' &&
    progress.wrongAnswer.length <= MAX_CARD_TEXT_LENGTH &&
    typeof progress.resolvedByRetype === 'boolean' &&
    isIsoTimestamp(progress.startedAt) &&
    isIsoTimestamp(progress.updatedAt) &&
    progress.startedAt <= progress.updatedAt
  );
}

export function isStudyProgressResumable(
  progress: StudyProgress | undefined,
  cardIds: string[],
): progress is StudyProgress {
  if (!progress || !isStructurallyValidStudyProgress(progress)) return false;
  if (
    cardIds.length === 0 ||
    !hasUniqueStrings(cardIds) ||
    !hasUniqueStrings(progress.courseOrder) ||
    progress.courseOrder.length !== cardIds.length
  ) {
    return false;
  }

  const cardIdSet = new Set(cardIds);
  if (!progress.courseOrder.every((cardId) => cardIdSet.has(cardId))) {
    return false;
  }
  if (
    progress.batchStart >= progress.courseOrder.length ||
    progress.batchStart % progress.batchSize !== 0
  ) {
    return false;
  }

  const batchIds = getStudyBatchIds(progress);
  const batchIdSet = new Set(batchIds);
  const retryIdSet = new Set(progress.retryIds);
  const masteredIdSet = new Set(progress.masteredIds);
  const missedIdSet = new Set(progress.missedIds);
  const arraysAreUnique = [
    progress.roundOrder,
    progress.retryIds,
    progress.masteredIds,
    progress.firstTryCorrectIds,
    progress.missedIds,
  ].every(hasUniqueStrings);
  if (!arraysAreUnique) return false;
  if (
    progress.roundOrder.length === 0 ||
    progress.roundOrder.length > progress.batchSize ||
    progress.roundIndex >= progress.roundOrder.length ||
    !progress.roundOrder.every((cardId) => batchIdSet.has(cardId)) ||
    !progress.retryIds.every((cardId) => batchIdSet.has(cardId)) ||
    !progress.masteredIds.every((cardId) => batchIdSet.has(cardId)) ||
    !progress.firstTryCorrectIds.every((cardId) => cardIdSet.has(cardId)) ||
    !progress.missedIds.every((cardId) => cardIdSet.has(cardId)) ||
    progress.firstTryCorrectIds.some((cardId) => missedIdSet.has(cardId)) ||
    progress.wrongAttemptCount < progress.missedIds.length
  ) {
    return false;
  }

  const currentCardId = getCurrentStudyCardId(progress);
  if (!currentCardId) return false;

  const recordedResultIds = new Set([
    ...progress.firstTryCorrectIds,
    ...progress.missedIds,
  ]);
  const eligibleResultIds = new Set(
    progress.courseOrder.slice(0, progress.batchStart + batchIds.length),
  );
  const previousBatchIds = progress.courseOrder.slice(0, progress.batchStart);
  const currentFirstTryIds = progress.firstTryCorrectIds.filter((cardId) =>
    batchIdSet.has(cardId),
  );
  const roundContainsWholeBatch =
    progress.roundOrder.length === batchIds.length &&
    batchIds.every((cardId) => progress.roundOrder.includes(cardId));
  if (
    !progress.firstTryCorrectIds.every((cardId) =>
      eligibleResultIds.has(cardId),
    ) ||
    !progress.missedIds.every((cardId) => eligibleResultIds.has(cardId)) ||
    !previousBatchIds.every((cardId) => recordedResultIds.has(cardId)) ||
    !progress.masteredIds.every((cardId) => recordedResultIds.has(cardId)) ||
    !currentFirstTryIds.every((cardId) => masteredIdSet.has(cardId)) ||
    (!roundContainsWholeBatch &&
      progress.roundOrder.some(
        (cardId) => !missedIdSet.has(cardId),
      )) ||
    progress.masteredIds.some((cardId) => retryIdSet.has(cardId))
  ) {
    return false;
  }

  const answeredBeforeCurrent = progress.roundOrder.slice(
    0,
    progress.roundIndex,
  );
  if (
    !answeredBeforeCurrent.every((cardId) => recordedResultIds.has(cardId))
  ) {
    return false;
  }
  const allowedRetryIds = new Set(answeredBeforeCurrent);
  if (
    progress.phase === 'retype' ||
    (progress.phase === 'correct' && progress.resolvedByRetype)
  ) {
    allowedRetryIds.add(currentCardId);
  }
  if (!progress.retryIds.every((cardId) => allowedRetryIds.has(cardId))) {
    return false;
  }

  const pendingIds = new Set<string>();
  if (progress.phase !== 'batch-complete') {
    const pendingStart =
      progress.phase === 'correct' && !progress.resolvedByRetype
        ? progress.roundIndex + 1
        : progress.roundIndex;
    for (const cardId of progress.roundOrder.slice(pendingStart)) {
      pendingIds.add(cardId);
    }
    for (const cardId of progress.retryIds) pendingIds.add(cardId);
  }
  if (
    batchIds.some(
      (cardId) =>
        masteredIdSet.has(cardId) === pendingIds.has(cardId),
    )
  ) {
    return false;
  }

  if (
    progress.phase === 'question' &&
    (masteredIdSet.has(currentCardId) ||
      retryIdSet.has(currentCardId) ||
      progress.wrongAnswer !== '' ||
      progress.resolvedByRetype)
  ) {
    return false;
  }
  if (
    progress.phase === 'retype' &&
    (!retryIdSet.has(currentCardId) ||
      progress.resolvedByRetype)
  ) {
    return false;
  }
  if (
    progress.phase === 'correct' &&
    progress.resolvedByRetype &&
    !retryIdSet.has(currentCardId)
  ) {
    return false;
  }
  if (
    progress.phase === 'correct' &&
    !progress.resolvedByRetype &&
    (!masteredIdSet.has(currentCardId) ||
      retryIdSet.has(currentCardId) ||
      progress.wrongAnswer !== '')
  ) {
    return false;
  }
  if (progress.phase === 'batch-complete') {
    if (
      progress.retryIds.length > 0 ||
      progress.wrongAnswer !== '' ||
      progress.resolvedByRetype ||
      batchIds.some((cardId) => !masteredIdSet.has(cardId)) ||
      progress.batchStart + batchIds.length >= progress.courseOrder.length
    ) {
      return false;
    }
  }

  return true;
}

function migrateLegacyStudyProgress(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const progress = value as Record<string, unknown>;
  if (progress.version === 1 && progress.batchSize === undefined) {
    return {
      ...progress,
      version: 3,
      batchSize: DEFAULT_STUDY_BATCH_SIZE,
      allowParentheticalOmission:
        typeof progress.allowParentheticalOmission === 'boolean'
          ? progress.allowParentheticalOmission
          : true,
    };
  }
  if (progress.version === 2) {
    return {
      ...progress,
      version: 3,
      allowParentheticalOmission:
        typeof progress.allowParentheticalOmission === 'boolean'
          ? progress.allowParentheticalOmission
          : true,
    };
  }
  return value;
}

function sanitizeStudyProgress(
  value: unknown,
  cardIds: string[],
): StudyProgress | undefined {
  const candidate = migrateLegacyStudyProgress(value);
  if (!isStructurallyValidStudyProgress(candidate)) return undefined;
  const progress: StudyProgress = {
    version: 3,
    direction: candidate.direction,
    shuffleEnabled: candidate.shuffleEnabled,
    allowParentheticalOmission: candidate.allowParentheticalOmission,
    batchSize: candidate.batchSize,
    courseOrder: [...candidate.courseOrder],
    batchStart: candidate.batchStart,
    roundOrder: [...candidate.roundOrder],
    roundIndex: candidate.roundIndex,
    retryIds: [...candidate.retryIds],
    masteredIds: [...candidate.masteredIds],
    firstTryCorrectIds: [...candidate.firstTryCorrectIds],
    missedIds: [...candidate.missedIds],
    wrongAttemptCount: candidate.wrongAttemptCount,
    phase: candidate.phase,
    wrongAnswer: trimStudyAnswerLineEndWhitespace(
      normalizeTextLineEndings(candidate.wrongAnswer),
    ),
    resolvedByRetype: candidate.resolvedByRetype,
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
  };
  return isStudyProgressResumable(progress, cardIds) ? progress : undefined;
}

function isStudySet(value: unknown): value is StudySet {
  if (!value || typeof value !== 'object') return false;
  const set = value as Record<string, unknown>;
  return (
    isSafeIdentifier(set.id) &&
    typeof set.title === 'string' &&
    set.title.trim().length > 0 &&
    set.title.length <= MAX_SET_TITLE_LENGTH &&
    typeof set.description === 'string' &&
    set.description.length <= MAX_SET_DESCRIPTION_LENGTH &&
    isIsoTimestamp(set.createdAt) &&
    isIsoTimestamp(set.updatedAt) &&
    set.createdAt <= set.updatedAt &&
    Array.isArray(set.cards) &&
    set.cards.length > 0 &&
    set.cards.length <= MAX_CARDS_PER_SET &&
    set.cards.every(isCard) &&
    hasUniqueStrings(set.cards.map((card) => card.id)) &&
    (set.lastStudiedAt === undefined ||
      (isIsoTimestamp(set.lastStudiedAt) &&
        set.lastStudiedAt >= set.createdAt)) &&
    (set.lastScore === undefined ||
      (isNonNegativeInteger(set.lastScore) && set.lastScore <= 100)) &&
    (set.studyProgress === undefined ||
      (typeof set.studyProgress === 'object' && set.studyProgress !== null))
  );
}

function hasExcessiveJsonNesting(value: string, maxDepth = 64): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of value) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{' || character === '[') {
      depth += 1;
      if (depth > maxDepth) return true;
    } else if (character === '}' || character === ']') {
      depth = Math.max(0, depth - 1);
    }
  }
  return false;
}

function normalizeStoredSetsValue(parsed: unknown): StoredSetsParseResult {
  if (
    !Array.isArray(parsed) ||
    parsed.length > MAX_STUDY_SETS ||
    !parsed.every(isStudySet)
  ) {
    return { status: 'invalid-data' };
  }

  const setIds = parsed.map((set) => set.id);
  const cardIds = parsed.flatMap((set) => set.cards.map((card) => card.id));
  const totalCardCount = parsed.reduce(
    (total, set) => total + set.cards.length,
    0,
  );
  if (
    !hasUniqueStrings(setIds) ||
    !hasUniqueStrings(cardIds) ||
    totalCardCount > MAX_TOTAL_STORED_CARDS
  ) {
    return { status: 'invalid-data' };
  }

  const sets = parsed.map((set) => {
    const cards = set.cards.map((card) => ({
      id: card.id,
      term: normalizeTextLineEndings(card.term),
      definition: normalizeTextLineEndings(card.definition),
    }));
    const studyProgress = sanitizeStudyProgress(
      set.studyProgress,
      cards.map((card) => card.id),
    );
    const normalized: StudySet = {
      id: set.id,
      title: set.title,
      description: normalizeTextLineEndings(set.description),
      cards,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
      studyProgress,
    };
    if (set.lastStudiedAt !== undefined) {
      normalized.lastStudiedAt = set.lastStudiedAt;
    }
    if (set.lastScore !== undefined) normalized.lastScore = set.lastScore;
    return normalized;
  });
  return { status: 'valid', sets };
}

export function parseStoredSetsText(value: string): StoredSetsParseResult {
  if (value.length > MAX_STORED_JSON_CHARS) return { status: 'too-large' };
  if (hasExcessiveJsonNesting(value)) return { status: 'invalid-data' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { status: 'invalid-json' };
  }
  return normalizeStoredSetsValue(parsed);
}

export function serializeStudySets(
  sets: StudySet[],
  pretty = false,
): string {
  const normalized = normalizeStoredSetsValue(sets);
  if (normalized.status !== 'valid') {
    throw new Error('stored_sets_invalid');
  }
  const serialized = JSON.stringify(
    normalized.sets,
    null,
    pretty ? 2 : undefined,
  );
  if (serialized.length > MAX_STORED_JSON_CHARS) {
    throw new Error('stored_sets_too_large');
  }
  return serialized + (pretty ? '\n' : '');
}

export function readStoredSets(value: string | null): StudySet[] | null {
  if (value === null) return null;
  const result = parseStoredSetsText(value);
  return result.status === 'valid' ? result.sets : null;
}

export const seedSets: StudySet[] = [
  {
    id: 'security-plus',
    title: 'CompTIA Security+ 用語学習',
    description: '日本語の説明を読み、英語の用語・略語を正確に入力するセットです。',
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-24T10:20:00.000Z',
    lastStudiedAt: '2026-08-24T10:20:00.000Z',
    lastScore: 82,
    cards: [
      { id: 'sec-tls', term: 'TLS', definition: '通信中のデータを暗号化し、完全性を保護するSSL後継のプロトコルは？' },
      { id: 'sec-mfa', term: 'MFA', definition: '知識・所持・生体など、独立した2種類以上の認証要素を要求する統制は？' },
      { id: 'sec-zero-trust', term: 'Zero Trust', definition: '接続元を暗黙に信頼せず、要求ごとに主体・端末・状況を検証する考え方は？' },
      { id: 'sec-least-privilege', term: 'Least privilege', definition: '利用者やプロセスへ、業務に必要な権限だけを与える原則は？' },
      { id: 'sec-pki', term: 'PKI', definition: '証明書の発行・配布・失効と公開鍵への信頼を管理する仕組みは？' },
      { id: 'sec-ids-ips', term: 'IDS / IPS', definition: 'ネットワーク通信を監視し、悪意ある活動を検知または遮断する技術の組み合わせは？' },
      { id: 'sec-sase', term: 'SASE', definition: '接続機能とSWG・CASB・FWaaSなどをクラウドから統合提供するアーキテクチャは？' },
      { id: 'sec-xss', term: 'XSS', definition: '入力値を通じ、攻撃者のスクリプトを他利用者のブラウザーで実行させる攻撃は？' },
      { id: 'sec-dlp', term: 'DLP', definition: '機密情報の不正送信を検知し、必要に応じて遮断する統制は？' },
      { id: 'sec-ransomware', term: 'Ransomware', definition: 'データを利用不能にし、復旧と引き換えに支払いを要求するマルウェアは？' },
      { id: 'sec-edr', term: 'EDR', definition: '端末上のプロセスや挙動を監視し、悪意ある実行を検知・隔離する製品は？' },
      { id: 'sec-siem', term: 'SIEM', definition: '複数のログを集中収集・正規化・相関分析してアラートを生成する基盤は？' },
      { id: 'sec-cvss', term: 'CVSS', definition: '脆弱性の技術的深刻度を標準化された数値で表す評価方式は？' },
      { id: 'sec-rto', term: 'RTO', definition: '障害発生後、何時間以内にサービスを再開すべきかを示す目標は？' },
      { id: 'sec-rpo', term: 'RPO', definition: 'どの時点までデータを復元できればよいかという許容損失量を示す目標は？' },
      { id: 'sec-aes', term: 'AES-256', definition: '256ビット鍵を使うAdvanced Encryption Standardの表記は？' },
    ],
  },
  {
    id: 'exact-text',
    title: '大文字・小文字と記号の確認',
    description: '英字のケースや特殊文字を、表示どおり正確に入力する練習です。',
    createdAt: '2026-08-24T11:00:00.000Z',
    updatedAt: '2026-08-24T11:00:00.000Z',
    cards: [
      { id: 'exact-1', term: 'C++', definition: 'Cにクラスなどの機能を加えたプログラミング言語を、記号込みで入力してください。' },
      { id: 'exact-2', term: 'user@example.com', definition: '例示用メールアドレスを小文字と記号を含めて入力してください。' },
      { id: 'exact-3', term: '<script>', definition: 'HTMLのscript開始タグを、山括弧を含む文字列として入力してください。' },
      { id: 'exact-4', term: 'A+B=C?', definition: '大文字、プラス、イコール、疑問符を含む文字列を入力してください。' },
      { id: 'exact-5', term: 'TLS', definition: '小文字のtlsでは不正解になる、3文字の暗号プロトコル略語は？' },
      { id: 'exact-6', term: 'OAuth 2.0', definition: 'スペースと小数点を含む認可フレームワーク名は？' },
    ],
  },
];
