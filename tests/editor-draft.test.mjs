import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudyProgress, seedSets } from '../app/model.ts';
import { MAX_CARD_TEXT_LENGTH, MAX_SET_TITLE_LENGTH } from '../app/securityLimits.ts';
import { validDraftFromStorage } from '../app/recall/editor/draft.ts';
import { prepareDraftSave } from '../app/recall/editor/prepareDraftSave.ts';
import { mergeStudySets } from '../app/recall/storage/mergeStudySets.ts';

const now = '2026-10-07T00:00:00.000Z';
const original = {
  ...seedSets[0],
  lastStudiedAt: now,
  lastScore: 75,
  studyProgress: createStudyProgress(seedSets[0].cards.map((card) => card.id), 'definition-to-term', false),
};
const draftOf = (set) => ({
  setId: set.id,
  title: set.title,
  description: set.description,
  cards: set.cards.map((card) => ({ ...card })),
});

test('draft restoration validates IDs and lengths, normalizes newlines, and drops unknown fields', () => {
  const draft = {
    ...draftOf(original),
    ignored: 'extra data',
    cards: [{ id: 'draft-card', term: '  TLS\r\n    code  ', definition: 'Question', ignored: true }],
  };
  assert.deepEqual(validDraftFromStorage(JSON.stringify(draft)), {
    setId: draft.setId,
    title: draft.title,
    description: draft.description,
    cards: [{ id: 'draft-card', term: '  TLS\n    code  ', definition: 'Question' }],
  });
  for (const invalid of [
    { ...draft, setId: '__proto__' },
    { ...draft, title: 'x'.repeat(MAX_SET_TITLE_LENGTH + 1) },
    { ...draft, cards: [draft.cards[0], draft.cards[0]] },
    { ...draft, cards: [{ ...draft.cards[0], term: 'x'.repeat(MAX_CARD_TEXT_LENGTH + 1) }] },
    { ...draft, cards: [] },
  ]) {
    assert.equal(validDraftFromStorage(JSON.stringify(invalid)), null);
  }
  assert.equal(validDraftFromStorage('{broken'), null);
});

test('changing only set metadata or card order retains the saved study checkpoint', () => {
  const draft = { ...draftOf(original), title: '  Renamed set  ', cards: [...original.cards].reverse() };
  const prepared = prepareDraftSave(draft, [original], now);
  assert.equal(prepared.status, 'valid');
  const saved = prepared.nextSets[0];
  assert.equal(saved.title, 'Renamed set');
  assert.equal(saved.createdAt, original.createdAt);
  assert.equal(saved.lastScore, original.lastScore);
  assert.deepEqual(saved.studyProgress, original.studyProgress);
  assert.deepEqual(saved.cards.map((card) => card.id), draft.cards.map((card) => card.id));
});

test('editing answer content clears stale results while preserving exact text and the original set', () => {
  const draft = draftOf(original);
  draft.cards[0].term = '  TLS\r\n    Code()  ';
  const before = structuredClone(original);
  const prepared = prepareDraftSave(draft, [original], now);
  assert.equal(prepared.status, 'valid');
  const saved = prepared.nextSets[0];
  assert.equal(saved.cards[0].term, '  TLS\n    Code()  ');
  assert.equal(saved.studyProgress, undefined);
  assert.equal(saved.lastScore, undefined);
  assert.equal(saved.lastStudiedAt, undefined);
  assert.equal(saved.createdAt, original.createdAt);
  assert.deepEqual(original, before);
});

test('a partial card on a later editor page reports the exact missing field and page', () => {
  const cards = Array.from({ length: 102 }, (_, index) => ({ id: 'draft-' + index, term: '', definition: '' }));
  cards[101].definition = 'A question without an answer';
  const prepared = prepareDraftSave({ title: 'Set', description: '', cards }, [], now);
  assert.equal(prepared.status, 'invalid');
  assert.equal(prepared.fieldId, 'card-draft-101-term');
  assert.equal(prepared.editorPage, 1);
});

test('a new set drops blank cards and rejects empty, oversized, or malformed content', () => {
  const draft = {
    title: 'Set', description: '',
    cards: [{ id: 'blank', term: ' ', definition: '' }, { id: 'complete', term: 'TLS', definition: 'Question' }],
  };
  const prepared = prepareDraftSave(draft, [], now);
  assert.equal(prepared.status, 'valid');
  assert.deepEqual(prepared.nextSets[0].cards, [draft.cards[1]]);
  assert.equal(draft.setId, undefined);
  assert.equal(draft.cards.length, 2);
  for (const invalid of [
    { ...draft, title: ' ' },
    { ...draft, cards: [draft.cards[0]] },
    { ...draft, title: 'x'.repeat(MAX_SET_TITLE_LENGTH + 1) },
    { ...draft, cards: [{ ...draft.cards[1], id: '__proto__' }] },
  ]) {
    assert.equal(prepareDraftSave(invalid, [], now).status, 'invalid');
  }
});

test('folder reconnection chooses the latest valid copy and retains browser copies on ties', () => {
  const browser = { ...original, updatedAt: '2020-01-01T00:00:00.000Z' };
  const newer = { ...browser, title: 'New folder copy', updatedAt: '2020-01-02T00:00:00.000Z' };
  assert.equal(mergeStudySets([browser], [newer])[0], newer);
  assert.equal(mergeStudySets([browser], [{ ...newer, updatedAt: browser.updatedAt }])[0], browser);
});

test('folder reconnection ignores future timestamps and cannot resurrect a deleted set', () => {
  const browser = { ...original, updatedAt: '2020-01-01T00:00:00.000Z' };
  const future = { ...browser, title: 'Future copy', updatedAt: '2999-01-01T00:00:00.000Z' };
  const deleted = { ...browser, id: 'deleted-set' };
  const added = { ...browser, id: 'added-set' };
  const merged = mergeStudySets([browser], [future, deleted, added], new Set([deleted.id]));
  assert.deepEqual(merged, [browser, added]);
  assert.equal(browser.title, original.title);
});
