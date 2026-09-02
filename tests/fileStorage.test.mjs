import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProjectSetsFileStateError,
  readSetsFromFolder,
  writeSetsToFolder,
} from '../app/fileStorage.ts';
import { seedSets, serializeStudySets } from '../app/model.ts';

function notFound() {
  return new DOMException('not found', 'NotFoundError');
}

class MockFileHandle {
  constructor(text = '') {
    this.text = text;
    this.abortCalled = false;
    this.failWrite = false;
    this.failClose = false;
  }

  async getFile() {
    const text = this.text;
    return {
      size: new TextEncoder().encode(text).byteLength,
      text: async () => text,
    };
  }

  async createWritable() {
    let pending = this.text;
    return {
      write: async (text) => {
        if (this.failWrite) throw new Error('disk full');
        pending = String(text);
      },
      close: async () => {
        if (this.failClose) throw new Error('close failed');
        this.text = pending;
      },
      abort: async () => {
        this.abortCalled = true;
      },
    };
  }
}

class MockDirectoryHandle {
  kind = 'directory';
  name;
  directories = new Map();
  files = new Map();

  constructor(name = 'project') {
    this.name = name;
  }

  async getDirectoryHandle(name, options = {}) {
    const existing = this.directories.get(name);
    if (existing) return existing;
    if (!options.create) throw notFound();
    const created = new MockDirectoryHandle(name);
    this.directories.set(name, created);
    return created;
  }

  async getFileHandle(name, options = {}) {
    const existing = this.files.get(name);
    if (existing) return existing;
    if (!options.create) throw notFound();
    const created = new MockFileHandle();
    this.files.set(name, created);
    return created;
  }

  async queryPermission() {
    return 'granted';
  }

  async requestPermission() {
    return 'granted';
  }
}

test('folder writes are verified and preserve the prior valid generation', async () => {
  const root = new MockDirectoryHandle();
  const firstText = await writeSetsToFolder(root, seedSets, {
    createIfMissing: true,
  });
  assert.equal(firstText, serializeStudySets(seedSets, true));

  const firstRead = await readSetsFromFolder(root);
  assert.equal(firstRead.status, 'valid');
  assert.equal(firstRead.text, firstText);

  const updatedSets = seedSets.map((set, index) =>
    index === 0 ? { ...set, title: set.title + ' updated' } : set,
  );
  const secondText = await writeSetsToFolder(root, updatedSets, {
    expectedText: firstText,
  });
  const dataDirectory = root.directories.get('recall-data');
  assert.equal(dataDirectory.files.get('sets.json').text, secondText);
  assert.equal(dataDirectory.files.get('sets.backup.json').text, firstText);
});

test('a valid external edit causes a conflict instead of silent overwrite', async () => {
  const root = new MockDirectoryHandle();
  const expectedText = await writeSetsToFolder(root, seedSets, {
    createIfMissing: true,
  });
  const externalSets = seedSets.map((set, index) =>
    index === 0 ? { ...set, description: 'external edit' } : set,
  );
  const externalText = serializeStudySets(externalSets, true);
  const dataDirectory = root.directories.get('recall-data');
  dataDirectory.files.get('sets.json').text = externalText;

  await assert.rejects(
    writeSetsToFolder(root, seedSets, { expectedText }),
    (error) =>
      error instanceof ProjectSetsFileStateError &&
      error.fileState.status === 'conflict',
  );
  assert.equal(dataDirectory.files.get('sets.json').text, externalText);
});

test('a file appearing during first-time setup is never silently overwritten', async () => {
  const root = new MockDirectoryHandle();
  const externalSets = seedSets.map((set, index) =>
    index === 0 ? { ...set, description: 'created by another process' } : set,
  );
  const externalText = serializeStudySets(externalSets, true);
  const originalGetDirectoryHandle = root.getDirectoryHandle.bind(root);
  root.getDirectoryHandle = async (name, options = {}) => {
    const directory = await originalGetDirectoryHandle(name, options);
    if (options.create && !directory.files.has('sets.json')) {
      directory.files.set('sets.json', new MockFileHandle(externalText));
    }
    return directory;
  };

  await assert.rejects(
    writeSetsToFolder(root, seedSets, { createIfMissing: true }),
    (error) =>
      error instanceof ProjectSetsFileStateError &&
      error.fileState.status === 'conflict',
  );
  const dataDirectory = root.directories.get('recall-data');
  assert.equal(dataDirectory.files.get('sets.json').text, externalText);
  assert.equal(dataDirectory.files.has('sets.backup.json'), false);
});

test('write failure aborts the stream and does not claim success', async () => {
  const root = new MockDirectoryHandle();
  const dataDirectory = await root.getDirectoryHandle('recall-data', {
    create: true,
  });
  const primary = await dataDirectory.getFileHandle('sets.json', {
    create: true,
  });
  const originalText = serializeStudySets(seedSets, true);
  primary.text = originalText;
  primary.failWrite = true;
  const updatedSets = seedSets.map((set, index) =>
    index === 0 ? { ...set, title: set.title + ' changed' } : set,
  );

  await assert.rejects(
    writeSetsToFolder(root, updatedSets, { expectedText: originalText }),
    /disk full/u,
  );
  assert.equal(primary.abortCalled, true);
  assert.equal(primary.text, originalText);
});

test('malformed existing data is never overwritten', async () => {
  const root = new MockDirectoryHandle();
  const dataDirectory = await root.getDirectoryHandle('recall-data', {
    create: true,
  });
  const primary = await dataDirectory.getFileHandle('sets.json', {
    create: true,
  });
  primary.text = '{broken';

  await assert.rejects(
    writeSetsToFolder(root, seedSets),
    (error) =>
      error instanceof ProjectSetsFileStateError &&
      error.fileState.status === 'invalid-json',
  );
  assert.equal(primary.text, '{broken');
  assert.equal(dataDirectory.files.has('sets.backup.json'), false);
});
