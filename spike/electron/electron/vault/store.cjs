'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { sha256, statOrNull, ensureDir, readTextFile, atomicWriteFile, assertSafeRelPath } = require('./atomic.cjs');
const { parseNote, serializeNote, validateNoteData, FrontmatterError, CATEGORIES } = require('./frontmatter.cjs');
const { openIndex } = require('./search-index.cjs');

const SCHEMA_VERSION = 1;
const METADATA_NAMES = ['collections', 'tags', 'settings'];

class ConflictError extends Error {
  constructor(details) {
    super(`Revision conflict on ${details.kind} ${details.id}: disk=${details.diskRevision} base=${details.baseRevision}`);
    this.name = 'ConflictError';
    this.code = 'ECONFLICT';
    this.details = details;
  }
}

function nowIso() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function notePath(vaultDir, id) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(id)) throw new Error('Invalid note id for path');
  return path.join(vaultDir, 'notes', `${id}.md`);
}

async function openVault(vaultDir) {
  if (typeof vaultDir !== 'string' || !path.isAbsolute(vaultDir) || vaultDir.includes('\0')) throw new Error('vaultDir must be an absolute path');
  const root = path.resolve(vaultDir);
  await ensureDir(root);
  await ensureDir(path.join(root, 'notes'));
  await ensureDir(path.join(root, 'metadata'));
  await ensureDir(path.join(root, 'attachments'));
  const manifestPath = path.join(root, 'vault.json');
  if (!(await statOrNull(manifestPath))) {
    await atomicWriteFile(manifestPath, JSON.stringify({ kind: 'zhd-vault', schema_version: SCHEMA_VERSION, createdAt: nowIso() }, null, 2));
  }
  const indexPath = path.join(root, 'index.sqlite');
  let index = null;
  const queue = Promise.resolve();
  let tail = queue;
  function enqueue(operation) { const result = tail.then(operation); tail = result.catch(() => {}); return result; }

  async function readNoteFile(file) {
    const text = await readTextFile(file);
    if (text == null) return null;
    return parseNote(text);
  }

  async function listNotes() {
    const notesDir = path.join(root, 'notes');
    const entries = await fs.readdir(notesDir, { withFileTypes: true });
    const notes = [];
    const corrupt = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const file = path.join(notesDir, entry.name);
      try {
        const parsed = await readNoteFile(file);
        if (parsed) notes.push({ ...parsed.data, body: parsed.body });
      } catch (error) {
        if (error instanceof FrontmatterError) {
          const quarantineDir = path.join(notesDir, '.corrupt');
          await ensureDir(quarantineDir);
          const target = path.join(quarantineDir, `${entry.name}.${randomUUID()}`);
          await fs.rename(file, target).catch(() => {});
          corrupt.push({ file: entry.name, quarantined: path.relative(root, target), error: error.message });
        } else {
          throw error;
        }
      }
    }
    notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { notes, corrupt };
  }

  async function getNote(id) {
    const parsed = await readNoteFile(notePath(root, id));
    return parsed ? { ...parsed.data, body: parsed.body } : null;
  }

  function normalizeIncoming(input) {
    const ts = nowIso();
    const data = {
      id: input.id || `N-${randomUUID()}`,
      title: input.title ?? '',
      category: CATEGORIES.includes(input.category) ? input.category : '灵感',
      tags: Array.isArray(input.tags) ? input.tags : [],
      favorite: !!input.favorite,
      inbox: input.inbox !== undefined ? !!input.inbox : true,
      sensitivity: input.sensitivity || 'internal',
      status: input.status || 'active',
      createdAt: input.createdAt || ts,
      updatedAt: ts,
      revision: 1,
      ...(input.deletedAt ? { deletedAt: input.deletedAt } : {}),
    };
    return { data: validateNoteData(data), body: typeof input.body === 'string' ? input.body : '' };
  }

  async function saveNote(input, { baseRevision } = {}) {
    return enqueue(async () => {
      const incoming = normalizeIncoming(input);
      const file = notePath(root, incoming.data.id);
      const existing = await readNoteFile(file).catch(error => {
        if (error instanceof FrontmatterError) throw error;
        return null;
      });
      if (existing) {
        const diskRevision = existing.data.revision;
        if (baseRevision !== undefined && baseRevision !== diskRevision) {
          const conflictDir = path.join(root, 'notes', '.conflicts');
          await ensureDir(conflictDir);
          const conflictPath = path.join(conflictDir, `${incoming.data.id}.${Date.now()}.${randomUUID()}.md`);
          await atomicWriteFile(conflictPath, serializeNote({ ...incoming.data, revision: diskRevision + 1 }, incoming.body));
          throw new ConflictError({ kind: 'note', id: incoming.data.id, diskRevision, baseRevision, conflictPath: path.relative(root, conflictPath) });
        }
        incoming.data.revision = diskRevision + 1;
        incoming.data.createdAt = existing.data.createdAt;
      }
      await atomicWriteFile(file, serializeNote(incoming.data, incoming.body));
      return { ...incoming.data, body: incoming.body };
    });
  }

  async function deleteNote(id, { baseRevision } = {}) {
    return enqueue(async () => {
      const file = notePath(root, id);
      const existing = await readNoteFile(file);
      if (!existing) return null;
      if (baseRevision !== undefined && baseRevision !== existing.data.revision) {
        throw new ConflictError({ kind: 'note', id, diskRevision: existing.data.revision, baseRevision });
      }
      const data = { ...existing.data, status: 'trashed', deletedAt: nowIso(), revision: existing.data.revision + 1, updatedAt: nowIso() };
      await atomicWriteFile(file, serializeNote(data, existing.body));
      return { ...data, body: existing.body };
    });
  }

  async function restoreNote(id, { baseRevision } = {}) {
    return enqueue(async () => {
      const file = notePath(root, id);
      const existing = await readNoteFile(file);
      if (!existing) return null;
      if (baseRevision !== undefined && baseRevision !== existing.data.revision) {
        throw new ConflictError({ kind: 'note', id, diskRevision: existing.data.revision, baseRevision });
      }
      const data = { ...existing.data, status: 'active', revision: existing.data.revision + 1, updatedAt: nowIso() };
      delete data.deletedAt;
      await atomicWriteFile(file, serializeNote(data, existing.body));
      return { ...data, body: existing.body };
    });
  }

  async function purgeNote(id) {
    return enqueue(async () => {
      const file = notePath(root, id);
      const existing = await readNoteFile(file);
      if (!existing) return null;
      if (existing.data.status !== 'trashed') throw new Error('Only trashed notes can be purged');
      await fs.unlink(file);
      return { id };
    });
  }

  function metadataPath(name) {
    if (!METADATA_NAMES.includes(name)) throw new Error('Unknown metadata: ' + name);
    return path.join(root, 'metadata', `${name}.json`);
  }

  async function readMetadata(name) {
    const text = await readTextFile(metadataPath(name));
    if (text == null) return { schema_version: SCHEMA_VERSION, revision: 0, items: [] };
    const parsed = JSON.parse(text);
    if (parsed.schema_version !== SCHEMA_VERSION) throw new Error('Unsupported metadata schema_version');
    return parsed;
  }

  async function writeMetadata(name, items, { baseRevision } = {}) {
    return enqueue(async () => {
      const current = await readMetadata(name);
      if (baseRevision !== undefined && baseRevision !== current.revision) {
        throw new ConflictError({ kind: 'metadata', id: name, diskRevision: current.revision, baseRevision });
      }
      const next = { schema_version: SCHEMA_VERSION, revision: current.revision + 1, items };
      await atomicWriteFile(metadataPath(name), JSON.stringify(next, null, 2));
      return next;
    });
  }

  async function addAttachment(buffer, filename) {
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const safeName = path.basename(String(filename || 'file')).replace(/[\\/:*?"<>|\u0000-\u001f\s]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';
    const digest = sha256(bytes);
    // Content-addressed: one canonical blob per sha256. The original filename is
    // kept in the returned reference (for display/export), not in the blob path,
    // so identical bytes never duplicate on disk.
    const relPath = assertSafeRelPath(path.join('attachments', digest, 'blob'));
    const absPath = path.join(root, relPath);
    if (!(await statOrNull(absPath))) await atomicWriteFile(absPath, bytes);
    return { sha256: digest, filename: safeName, size: bytes.length, path: relPath.split(path.sep).join('/') };
  }

  function ensureIndex() {
    if (!index) index = openIndex(indexPath);
    return index;
  }

  async function rebuildIndex() {
    return enqueue(async () => {
      const { notes } = await listNotes();
      const idx = ensureIndex();
      idx.rebuild(notes);
      return { count: idx.count(), segmenter: idx.segmenterVersion };
    });
  }

  async function search(query, options) {
    if (!(await statOrNull(indexPath))) await rebuildIndex();
    return ensureIndex().search(query, options);
  }

  async function close() {
    await tail.catch(() => {});
    if (index) { index.close(); index = null; }
  }

  return {
    root, indexPath, listNotes, getNote, saveNote, deleteNote, restoreNote, purgeNote,
    readMetadata, writeMetadata, addAttachment, rebuildIndex, search, close,
  };
}

module.exports = { openVault, ConflictError, SCHEMA_VERSION, METADATA_NAMES };
