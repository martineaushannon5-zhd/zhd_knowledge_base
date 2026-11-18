'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const MAX_FILE_BYTES = 16 * 1024 * 1024;

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function statOrNull(target) {
  try { return await fs.lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// Reject anything that could escape the vault: absolute paths, parent segments,
// null bytes, drive letters or UNC prefixes.
function assertSafeRelPath(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.includes('\0')) throw new Error('Unsafe relative path');
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.startsWith('\\\\')) throw new Error('Absolute paths are not allowed in vault manifests');
  const normalized = path.normalize(rel);
  if (normalized.startsWith('..') || normalized.split(path.sep).includes('..')) throw new Error('Path traversal is not allowed');
  return normalized;
}

function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function readTextFile(filePath, maxBytes = MAX_FILE_BYTES) {
  const stat = await statOrNull(filePath);
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular, non-linked file: ' + filePath);
  if (stat.size > maxBytes) throw new Error('File exceeds size limit: ' + filePath);
  const handle = await fs.open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const buffer = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > maxBytes) throw new Error('File grew beyond size limit: ' + filePath);
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size));
  } finally {
    await handle.close();
  }
}

// Write to a sibling temp file, fsync, then rename over the target. The rename
// is atomic on the same volume; we never delete the existing target first.
async function atomicWriteFile(filePath, data) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const temporary = path.join(dir, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Content exceeds size limit: ' + filePath);
  let handle;
  let committed = false;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, filePath);
    committed = true;
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES') {
      const wrapped = new Error(`File is locked or not writable (no silent overwrite): ${filePath}`);
      wrapped.code = error.code;
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (!committed) await fs.unlink(temporary).catch(() => {});
  }
}

async function copyFileSafe(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

module.exports = { sha256, statOrNull, ensureDir, assertSafeRelPath, isWithin, readTextFile, atomicWriteFile, copyFileSafe, MAX_FILE_BYTES };
