'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { sha256, statOrNull, ensureDir, assertSafeRelPath, isWithin, copyFileSafe } = require('./atomic.cjs');

const BACKUP_KIND = 'zhd-backup';
const SCHEMA_VERSION = 1;
const EXCLUDE = new Set(['index.sqlite', 'index.sqlite-wal', 'index.sqlite-shm']);

function isExcluded(rel) {
  const parts = rel.split('/');
  if (EXCLUDE.has(parts[parts.length - 1])) return true;
  if (parts.some(p => p.endsWith('.tmp'))) return true;
  return false;
}

async function walkFiles(dir, base = dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs).split(path.sep).join('/');
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await walkFiles(abs, base, out);
    else if (entry.isFile() && !isExcluded(rel)) out.push(rel);
  }
  return out;
}

async function createBackup(vault, destDir) {
  const root = vault.root;
  await vault.close().catch(() => {});
  await ensureDir(destDir);
  const rels = (await walkFiles(root)).sort();
  const files = [];
  for (const rel of rels) {
    const src = path.join(root, rel);
    const bytes = await fs.readFile(src);
    const dest = path.join(destDir, assertSafeRelPath(rel));
    await ensureDir(path.dirname(dest));
    await fs.writeFile(dest, bytes);
    files.push({ path: rel, size: bytes.length, sha256: sha256(bytes) });
  }
  const manifest = {
    kind: BACKUP_KIND, schema_version: SCHEMA_VERSION, createdAt: new Date().toISOString(),
    source: path.basename(root), fileCount: files.length, files,
  };
  await fs.writeFile(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { destDir, fileCount: files.length, manifest };
}

async function readManifest(backupDir) {
  const text = await fs.readFile(path.join(backupDir, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(text);
  if (manifest.kind !== BACKUP_KIND || manifest.schema_version !== SCHEMA_VERSION) throw new Error('Unsupported backup manifest');
  if (!Array.isArray(manifest.files)) throw new Error('Backup manifest missing files');
  return manifest;
}

// Validate every file into a staging dir BEFORE touching the target. Any hash or
// path failure aborts with the original vault untouched.
async function restoreBackup(backupDir, targetVaultDir, { preserveOriginal = true } = {}) {
  const manifest = await readManifest(backupDir);
  const target = path.resolve(targetVaultDir);
  const parent = path.dirname(target);
  await ensureDir(parent);
  const staging = path.join(parent, `.${path.basename(target)}.staging-${randomUUID()}`);
  await ensureDir(staging);
  try {
    for (const entry of manifest.files) {
      const rel = assertSafeRelPath(entry.path);
      const src = path.join(backupDir, rel);
      const srcStat = await statOrNull(src);
      if (!srcStat || !srcStat.isFile() || srcStat.isSymbolicLink()) throw new Error('Backup file missing or unsafe: ' + rel);
      const bytes = await fs.readFile(src);
      if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error('Backup hash/size mismatch: ' + rel);
      const dest = path.join(staging, rel);
      if (!isWithin(staging, dest)) throw new Error('Backup path escapes staging: ' + rel);
      await ensureDir(path.dirname(dest));
      await fs.writeFile(dest, bytes);
    }
    const vaultManifest = JSON.parse(await fs.readFile(path.join(staging, 'vault.json'), 'utf8'));
    if (vaultManifest.kind !== 'zhd-vault') throw new Error('Staged vault.json is not a zhd-vault');

    let preserved = null;
    const existing = await statOrNull(target);
    if (existing) {
      if (!preserveOriginal) throw new Error('Target exists and preserveOriginal=false; refusing to overwrite');
      preserved = path.join(parent, `${path.basename(target)}.old-${Date.now()}`);
      await fs.rename(target, preserved);
    }
    try {
      await fs.rename(staging, target);
    } catch (error) {
      if (preserved) await fs.rename(preserved, target).catch(() => {});
      throw error;
    }
    const { openVault } = require('./store.cjs');
    const vault = await openVault(target);
    const rebuilt = await vault.rebuildIndex();
    await vault.close();
    return { restored: target, fileCount: manifest.files.length, preservedOriginal: preserved, rebuilt };
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { createBackup, restoreBackup, readManifest, BACKUP_KIND };
