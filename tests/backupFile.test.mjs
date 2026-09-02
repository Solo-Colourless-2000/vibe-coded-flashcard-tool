import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRecallBackup,
  serializeRecallBackup,
} from '../app/backupFile.ts';
import { seedSets, serializeStudySets } from '../app/model.ts';

test('RECALL backup round-trips all sets and deleted IDs', () => {
  const text = serializeRecallBackup(seedSets, ['deleted-set-1']);
  const parsed = parseRecallBackup(text);
  assert.equal(parsed.status, 'valid');
  assert.equal(serializeStudySets(parsed.backup.sets), serializeStudySets(seedSets));
  assert.deepEqual(parsed.backup.deletedSetIds, ['deleted-set-1']);
  assert.equal(parsed.backup.schemaVersion, 1);
  assert.equal(parsed.backup.appVersion, '0.2.1');
});

test('RECALL backup rejects malformed JSON', () => {
  assert.equal(parseRecallBackup('{nope').status, 'invalid-json');
});

test('RECALL backup rejects duplicate or unsafe tombstone IDs', () => {
  const base = JSON.parse(serializeRecallBackup(seedSets, []));
  base.deletedSetIds = ['dup', 'dup'];
  assert.equal(parseRecallBackup(JSON.stringify(base)).status, 'invalid-data');
  base.deletedSetIds = ['../escape'];
  assert.equal(parseRecallBackup(JSON.stringify(base)).status, 'invalid-data');
});

test('RECALL backup rejects excessive JSON nesting before normalizing sets', () => {
  const deep = '['.repeat(70) + '0' + ']'.repeat(70);
  assert.equal(parseRecallBackup(deep).status, 'invalid-data');
});
