'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_NOTES = 5000;
const MAX_BODY_LENGTH = 256 * 1024;
const CATEGORIES = new Set(['灵感', '技术', '项目', '阅读']);
const NOTE_KEYS = ['id', 'title', 'body', 'category', 'tags', 'favorite', 'inbox', 'createdAt', 'updatedAt'];

function fail(message) {
  throw new TypeError(`Invalid notes: ${message}`);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}

function validateNotes(input) {
  if (!Array.isArray(input) || input.length > MAX_NOTES) fail(`expected an array of at most ${MAX_NOTES} notes`);
  const ids = new Set();
  let totalBytes = 2;
  return Array.from(input, (note, index) => {
    if (!note || typeof note !== 'object' || Array.isArray(note) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(note))) fail(`note ${index} must be a plain object`);
    const keys = Object.keys(note);
    if (keys.length !== NOTE_KEYS.length || NOTE_KEYS.some((key) => !Object.hasOwn(note, key))) fail(`unexpected fields on note ${index}`);
    if (typeof note.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(note.id) || ids.has(note.id)) fail(`invalid or duplicate id at ${index}`);
    ids.add(note.id);
    if (typeof note.title !== 'string' || note.title.length > 300) fail(`title ${index} exceeds 300 characters`);
    if (typeof note.body !== 'string' || note.body.length > MAX_BODY_LENGTH) fail(`body ${index} exceeds ${MAX_BODY_LENGTH} characters`);
    if (!CATEGORIES.has(note.category)) fail(`unknown category at ${index}`);
    if (!Array.isArray(note.tags) || note.tags.length > 32 ||
        Array.from(note.tags).some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 64)) fail(`invalid tags at ${index}`);
    if (typeof note.favorite !== 'boolean' || typeof note.inbox !== 'boolean') fail(`invalid flags at ${index}`);
    if (!validDate(note.createdAt) || !validDate(note.updatedAt)) fail(`invalid UTC dates at ${index}`);
    const normalized = {
      id: note.id,
      title: note.title,
      body: note.body,
      category: note.category,
      tags: [...note.tags],
      favorite: note.favorite,
      inbox: note.inbox,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
    totalBytes += Buffer.byteLength(JSON.stringify(normalized), 'utf8') + (index ? 1 : 0);
    if (totalBytes > MAX_BYTES) fail(`document exceeds ${MAX_BYTES} bytes`);
    return normalized;
  });
}

function resolveVaultPaths(userDataPath) {
  if (typeof userDataPath !== 'string' || !path.isAbsolute(userDataPath) || userDataPath.includes('\0')) {
    throw new TypeError('userData must be an absolute trusted application path');
  }
  const root = path.resolve(userDataPath);
  const directory = path.join(root, 'prototype-vault');
  const file = path.join(directory, 'notes.json');
  return Object.freeze({ root, directory, file });
}

async function statOrNull(target) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertDirectory(stat) {
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error('Vault directory must not be a link or a regular file');
}

function assertFile(stat) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Notes must be a regular, unlinked file');
  if (stat.size > MAX_BYTES) throw new Error(`Notes file exceeds ${MAX_BYTES} bytes`);
}

function createNotesStorage(userDataPath) {
  const paths = resolveVaultPaths(userDataPath);
  let queue = Promise.resolve();

  function enqueue(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }

  async function prepareDirectory(create) {
    if (create) await fs.mkdir(paths.root, { recursive: true, mode: 0o700 });
    const rootStat = await statOrNull(paths.root);
    if (!rootStat) return false;
    assertDirectory(rootStat);
    if (create) {
      try {
        await fs.mkdir(paths.directory, { mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    const directoryStat = await statOrNull(paths.directory);
    if (!directoryStat) return false;
    assertDirectory(directoryStat);
    const [realRoot, realDirectory] = await Promise.all([fs.realpath(paths.root), fs.realpath(paths.directory)]);
    if (path.relative(realRoot, realDirectory) !== 'prototype-vault') throw new Error('Vault escaped application userData');
    return true;
  }

  async function readNotes() {
    if (!(await prepareDirectory(false))) return null;
    const stat = await statOrNull(paths.file);
    if (!stat) return null;
    assertFile(stat);
    const handle = await fs.open(paths.file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const openedStat = await handle.stat();
      assertFile(openedStat);
      if (stat.ino !== openedStat.ino || stat.dev !== openedStat.dev) throw new Error('Notes file changed during open');
      // Bound the read itself, even if another process grows the file after stat.
      const buffer = Buffer.alloc(MAX_BYTES + 1);
      let size = 0;
      while (size < buffer.length) {
        const result = await handle.read(buffer, size, buffer.length - size, size);
        if (!result.bytesRead) break;
        size += result.bytesRead;
      }
      if (size > MAX_BYTES) throw new Error(`Notes file exceeds ${MAX_BYTES} bytes`);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size));
      return validateNotes(JSON.parse(text));
    } finally {
      await handle.close();
    }
  }

  async function writeNotes(serialized) {
    await prepareDirectory(true);
    const previous = await statOrNull(paths.file);
    if (previous) assertFile(previous);
    const temporary = path.join(paths.directory, `.notes-${randomUUID()}.tmp`);
    let handle;
    let committed = false;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      // Rename in the same directory replaces the destination atomically.
      // Never unlink the existing file as a Windows rename fallback.
      await fs.rename(temporary, paths.file);
      committed = true;
    } finally {
      if (handle) await handle.close();
      if (!committed) await fs.unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  return Object.freeze({
    load: () => enqueue(readNotes),
    save: async (input) => {
      // Snapshot at the call boundary, not when the queued disk write starts.
      const serialized = JSON.stringify(validateNotes(input));
      await enqueue(() => writeNotes(serialized));
    },
    info: async () => ({ mode: 'desktop-json', path: paths.file }),
    flush: () => queue,
  });
}

module.exports = { createNotesStorage, resolveVaultPaths, validateNotes, MAX_BYTES, MAX_NOTES, MAX_BODY_LENGTH };
