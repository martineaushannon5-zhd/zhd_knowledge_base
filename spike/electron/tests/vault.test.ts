import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { openVault, ConflictError } = require('../electron/vault/store.cjs');
const { createBackup, restoreBackup } = require('../electron/vault/backup.cjs');
const { parseNote, serializeNote, FrontmatterError } = require('../electron/vault/frontmatter.cjs');
const { segment } = require('../electron/vault/search-index.cjs');
const { sha256 } = require('../electron/vault/atomic.cjs');

let dirs: string[] = [];
async function tempDir(prefix = 'zhd-vault-test-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of dirs) await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  dirs = [];
}, 30000);

const sample = (over = {}) => ({ title: '本地优先', body: '# 标题\n\n数据应该先属于自己。', category: '技术', tags: ['架构', 'Local-first'], ...over });

describe('frontmatter', () => {
  it('roundtrips note data and body', () => {
    const data = { id: 'N-1', title: '你好', category: '灵感', tags: ['a'], favorite: false, inbox: true, sensitivity: 'internal', status: 'active', createdAt: '2026-11-18T00:00:00Z', updatedAt: '2026-11-18T00:00:00Z', revision: 1 };
    const text = serializeNote(data, '正文 with 中文\n');
    const parsed = parseNote(text);
    expect(parsed.data).toEqual(data);
    expect(parsed.body).toBe('正文 with 中文\n');
  });
  it('rejects missing or malformed frontmatter', () => {
    expect(() => parseNote('no frontmatter here')).toThrow(FrontmatterError);
    expect(() => parseNote('---\n: : bad yaml\n---\nbody')).toThrow(FrontmatterError);
  });
});

describe('segmentation', () => {
  it('produces CJK bigrams so 2-char queries match', () => {
    const seg = segment('知识库');
    expect(seg.split(' ')).toEqual(expect.arrayContaining(['知识', '识库', '知', '识', '库']));
    expect(segment('Local-first')).toContain('local');
  });
});

describe('vault notes', () => {
  it('saves, reads and lists notes with incrementing revision', async () => {
    const vault = await openVault(await tempDir());
    const a = await vault.saveNote(sample());
    expect(a.revision).toBe(1);
    expect(a.id).toMatch(/^N-/);
    const fetched = await vault.getNote(a.id);
    expect(fetched.body).toBe(sample().body);
    const b = await vault.saveNote({ ...a, title: '改标题' }, { baseRevision: 1 });
    expect(b.revision).toBe(2);
    expect(b.createdAt).toBe(a.createdAt);
    const { notes, corrupt } = await vault.listNotes();
    expect(notes).toHaveLength(1);
    expect(corrupt).toHaveLength(0);
    expect(notes[0].title).toBe('改标题');
    await vault.close();
  });

  it('preserves disk version and writes a conflict copy on stale baseRevision', async () => {
    const root = await tempDir();
    const vault = await openVault(root);
    const a = await vault.saveNote(sample());
    // Simulate an external editor bumping the file to revision 2.
    const file = path.join(root, 'notes', `${a.id}.md`);
    const external = serializeNote({ ...a, revision: 2, title: '外部修改' }, '外部正文');
    await fs.writeFile(file, external);
    let conflict: any;
    try {
      await vault.saveNote({ ...a, title: '本地修改' }, { baseRevision: 1 });
    } catch (error) { conflict = error; }
    expect(conflict).toBeInstanceOf(ConflictError);
    expect(conflict.details.diskRevision).toBe(2);
    const disk = await vault.getNote(a.id);
    expect(disk.title).toBe('外部修改'); // disk not overwritten
    const conflictFile = path.join(root, conflict.details.conflictPath);
    const conflictText = await fs.readFile(conflictFile, 'utf8');
    expect(conflictText).toContain('本地修改'); // incoming preserved as conflict copy
    await vault.close();
  });

  it('quarantines corrupt frontmatter without losing healthy notes', async () => {
    const root = await tempDir();
    const vault = await openVault(root);
    await vault.saveNote(sample({ title: '健康笔记' }));
    await fs.writeFile(path.join(root, 'notes', 'N-bad.md'), 'this is not valid frontmatter');
    const { notes, corrupt } = await vault.listNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('健康笔记');
    expect(corrupt).toHaveLength(1);
    expect(corrupt[0].file).toBe('N-bad.md');
    await expect(fs.stat(path.join(root, 'notes', 'N-bad.md'))).rejects.toThrow(); // moved out
    const quarantined = await fs.readdir(path.join(root, 'notes', '.corrupt'));
    expect(quarantined.length).toBe(1);
    await vault.close();
  });

  it('soft-deletes notes (status trashed) and excludes them from search', async () => {
    const vault = await openVault(await tempDir());
    const a = await vault.saveNote(sample());
    const deleted = await vault.deleteNote(a.id, { baseRevision: 1 });
    expect(deleted.status).toBe('trashed');
    expect(deleted.deletedAt).toBeTruthy();
    await vault.rebuildIndex();
    expect(await vault.search('本地优先')).toHaveLength(0);
    expect(await vault.search('本地优先', { includeTrashed: true })).toHaveLength(1);
    await vault.close();
  });
});

describe('metadata', () => {
  it('writes and reads JSON truth source with revision conflict detection', async () => {
    const vault = await openVault(await tempDir());
    const m1 = await vault.writeMetadata('collections', [{ id: 'COL-1', name: '项目' }]);
    expect(m1.revision).toBe(1);
    const read = await vault.readMetadata('collections');
    expect(read.items[0].name).toBe('项目');
    await expect(vault.writeMetadata('collections', [], { baseRevision: 0 })).rejects.toBeInstanceOf(ConflictError);
    const m2 = await vault.writeMetadata('collections', [{ id: 'COL-1', name: '改名' }], { baseRevision: 1 });
    expect(m2.revision).toBe(2);
    await vault.close();
  });
});

describe('attachments', () => {
  it('dedups by sha256 and keeps relative paths that survive a vault move', async () => {
    const rootA = await tempDir();
    const vaultA = await openVault(rootA);
    const bytes = Buffer.from('附件内容 attachment bytes');
    const a1 = await vaultA.addAttachment(bytes, '图片 1.png');
    const a2 = await vaultA.addAttachment(bytes, '副本.png');
    expect(a1.sha256).toBe(a2.sha256);
    expect(a1.path).toBe(`attachments/${a1.sha256}/blob`);
    expect(a1.path).toBe(a2.path); // content-addressed: same bytes, one blob
    expect(a1.filename).toBe('图片_1.png'); // original name kept in reference
    expect(a2.filename).toBe('副本.png');
    // Only one blob on disk despite two adds.
    const blobDir = path.join(rootA, 'attachments', a1.sha256);
    expect(await fs.readdir(blobDir)).toHaveLength(1);
    await vaultA.close();

    // Move the whole vault to a new location; relative attachment path still resolves.
    const rootB = await tempDir();
    await fs.rm(rootB, { recursive: true, force: true });
    await fs.cp(rootA, rootB, { recursive: true });
    const vaultB = await openVault(rootB);
    const movedBytes = await fs.readFile(path.join(rootB, a1.path));
    expect(sha256(movedBytes)).toBe(a1.sha256);
    await vaultB.close();
  });
});

describe('derived index', () => {
  it('rebuilds from truth source after the index file is deleted', async () => {
    const root = await tempDir();
    const vault = await openVault(root);
    await vault.saveNote(sample({ title: '知识库设计', body: '中文检索应当找得到。' }));
    await vault.saveNote(sample({ title: 'Agent 协作', body: '统一工作方式。', category: '技术' }));
    const built = await vault.rebuildIndex();
    expect(built.count).toBe(2);
    expect((await vault.search('知识')).map(r => r.title)).toContain('知识库设计');
    expect((await vault.search('协作')).map(r => r.title)).toContain('Agent 协作');
    await vault.close();

    // Delete the derived index; it must be rebuildable from Markdown alone.
    await fs.rm(path.join(root, 'index.sqlite'), { force: true });
    await fs.rm(path.join(root, 'index.sqlite-wal'), { force: true });
    await fs.rm(path.join(root, 'index.sqlite-shm'), { force: true });
    const reopened = await openVault(root);
    expect((await reopened.search('知识')).map(r => r.title)).toContain('知识库设计'); // auto-rebuild
    const explicit = await reopened.rebuildIndex();
    expect(explicit.count).toBe(2);
    await reopened.close();
  });
});

describe('backup and restore', () => {
  async function seedVault() {
    const root = await tempDir();
    const vault = await openVault(root);
    const note = await vault.saveNote(sample({ title: '备份笔记', body: '需要被完整恢复。' }));
    await vault.writeMetadata('tags', [{ id: 'TAG-1', name: '架构' }]);
    const att = await vault.addAttachment(Buffer.from('备份附件'), 'a.txt');
    await vault.rebuildIndex();
    await vault.close();
    return { root, note, att };
  }

  it('restores notes, metadata and attachments consistently and rebuilds index', async () => {
    const { root, note, att } = await seedVault();
    const backupDir = await tempDir('zhd-backup-');
    const vault = await openVault(root);
    const backup = await createBackup(vault, backupDir);
    expect(backup.fileCount).toBeGreaterThan(3);
    // Derived index must NOT be in the backup.
    expect(backup.manifest.files.some(f => f.path.startsWith('index.sqlite'))).toBe(false);

    const target = path.join(await tempDir(), 'restored-vault');
    const result = await restoreBackup(backupDir, target);
    expect(result.fileCount).toBe(backup.fileCount);
    expect(result.rebuilt.count).toBe(1);

    const restored = await openVault(target);
    const got = await restored.getNote(note.id);
    expect(got.body).toBe('需要被完整恢复。');
    expect((await restored.readMetadata('tags')).items[0].name).toBe('架构');
    expect(sha256(await fs.readFile(path.join(target, att.path)))).toBe(att.sha256);
    expect((await restored.search('备份')).map(r => r.title)).toContain('备份笔记');
    await restored.close();
  });

  it('aborts on hash mismatch and leaves the target untouched', async () => {
    const { root } = await seedVault();
    const backupDir = await tempDir('zhd-backup-');
    const vault = await openVault(root);
    await createBackup(vault, backupDir);
    // Tamper with a backed-up note.
    const noteFile = (await fs.readdir(path.join(backupDir, 'notes'))).find(f => f.endsWith('.md'))!;
    await fs.writeFile(path.join(backupDir, 'notes', noteFile), 'tampered');
    const target = path.join(await tempDir(), 'should-not-exist');
    await expect(restoreBackup(backupDir, target)).rejects.toThrow(/hash|size/i);
    await expect(fs.stat(target)).rejects.toThrow();
  });

  it('preserves the original vault when restoring over an existing one', async () => {
    const { root } = await seedVault();
    const backupDir = await tempDir('zhd-backup-');
    const vault = await openVault(root);
    await createBackup(vault, backupDir);

    const target = await tempDir();
    const existing = await openVault(target);
    await existing.saveNote(sample({ title: '原有笔记' }));
    await existing.close();

    const result = await restoreBackup(backupDir, target);
    expect(result.preservedOriginal).toBeTruthy();
    const oldVault = await openVault(result.preservedOriginal!);
    expect((await oldVault.listNotes()).notes[0].title).toBe('原有笔记');
    await oldVault.close();
    const newVault = await openVault(target);
    expect((await newVault.listNotes()).notes[0].title).toBe('备份笔记');
    await newVault.close();
  });

  it('rejects path traversal in a crafted manifest', async () => {
    const backupDir = await tempDir('zhd-backup-');
    await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify({
      kind: 'zhd-backup', schema_version: 1, createdAt: 'x', fileCount: 1,
      files: [{ path: '../evil.txt', size: 1, sha256: 'x' }],
    }));
    const target = path.join(await tempDir(), 'victim');
    await expect(restoreBackup(backupDir, target)).rejects.toThrow(/traversal|Absolute|Unsafe/i);
    await expect(fs.stat(target)).rejects.toThrow();
  });
});
