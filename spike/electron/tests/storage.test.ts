import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import * as fs from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { createNotesStorage, resolveVaultPaths, validateNotes, MAX_BYTES, MAX_NOTES, MAX_BODY_LENGTH } = require('../electron/storage.cjs')
const { parseDevServerUrl, isTrustedRendererUrl, isAllowedRequest } = require('../electron/security.cjs')
const mutableFs = require('node:fs/promises')

const makeNote = (overrides: Record<string, unknown> = {}) => ({
  id: 'note-1',
  title: '让知识生长',
  body: '# 今天的想法\n\n本地优先，认真记录。',
  category: '灵感',
  tags: ['设计', '本地优先'],
  favorite: false,
  inbox: true,
  createdAt: '2026-11-18T02:00:00.000Z',
  updatedAt: '2026-11-18T03:00:00.000Z',
  ...overrides,
})

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'zhd-storage-test-')) })
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(root, { recursive: true, force: true })
})

describe('notes input boundary', () => {
  it('clones validated notes and nested tags', () => {
    const note = makeNote()
    const result = validateNotes([note])
    expect(result).toEqual([note])
    expect(result[0]).not.toBe(note)
    expect(result[0].tags).not.toBe(note.tags)
  })

  it.each([
    null, {}, '[]', [null], [makeNote({ id: '../outside' })],
    [makeNote(), makeNote()], [makeNote({ category: '其他' })],
    [makeNote({ favorite: 1 })], [makeNote({ inbox: 'true' })],
    [makeNote({ tags: [null] })], [makeNote({ tags: [' '] })],
    [makeNote({ tags: new Array(2) })], [makeNote({ tags: Array(33).fill('tag') })],
    [makeNote({ tags: ['t'.repeat(65)] })], [makeNote({ title: 't'.repeat(301) })],
    [makeNote({ body: 'x'.repeat(MAX_BODY_LENGTH + 1) })],
    [makeNote({ createdAt: 'not a date' })], [makeNote({ createdAt: '2026-02-30T00:00:00Z' })],
    [makeNote({ updatedAt: 42 })], [makeNote({ extra: 'not accepted' })],
    Array(2), Array(MAX_NOTES + 1),
  ])('rejects malformed data case %#', (input) => {
    expect(() => validateNotes(input)).toThrow(/Invalid notes/)
  })

  it('enforces the aggregate UTF-8 byte limit, not only individual lengths', () => {
    const input = Array.from({ length: 12 }, (_, index) => makeNote({ id: `n-${index}`, body: '知'.repeat(MAX_BODY_LENGTH) }))
    expect(() => validateNotes(input)).toThrow(/bytes/)
  })

  it('does not invoke prototype toJSON hooks', () => {
    const input = Object.assign(Object.create({ toJSON: () => [] }), makeNote())
    expect(() => validateNotes([input])).toThrow(/plain object/)
  })
})

describe('atomic application-local JSON storage', () => {
  it('returns null only for a missing vault without creating it', async () => {
    const store = createNotesStorage(root)
    expect(await store.load()).toBeNull()
    expect(await fs.readdir(root)).toEqual([])
  })

  it('returns null for a missing notes file', async () => {
    await fs.mkdir(resolveVaultPaths(root).directory)
    expect(await createNotesStorage(root).load()).toBeNull()
  })

  it('round trips notes and reports its real JSON mode/path', async () => {
    const store = createNotesStorage(root)
    await store.save([makeNote()])
    expect(await createNotesStorage(root).load()).toEqual([makeNote()])
    expect(await store.info()).toEqual({ mode: 'desktop-json', path: path.join(root, 'prototype-vault', 'notes.json') })
    expect(await fs.readdir(path.join(root, 'prototype-vault'))).toEqual(['notes.json'])
  })

  it('preserves an intentionally empty vault as [] instead of null', async () => {
    const store = createNotesStorage(root)
    await store.save([])
    expect(await store.load()).toEqual([])
  })

  it('serializes writes in invocation order and loads after pending writes', async () => {
    const store = createNotesStorage(root)
    const writes = Array.from({ length: 30 }, (_, index) => store.save([makeNote({ title: `version ${index}` })]))
    const result = store.load()
    await Promise.all(writes)
    expect((await result)[0].title).toBe('version 29')
    expect(await fs.readdir(path.join(root, 'prototype-vault'))).toEqual(['notes.json'])
  })

  it('snapshots data before the async write is queued', async () => {
    const store = createNotesStorage(root)
    const note = makeNote()
    const pending = store.save([note])
    note.title = 'changed too late'
    note.tags.push('changed')
    await pending
    expect(await store.load()).toEqual([makeNote()])
  })

  it('rejects invalid input without overwriting the previous notes', async () => {
    const store = createNotesStorage(root)
    await store.save([makeNote()])
    await expect(store.save([makeNote({ favorite: 'yes' })])).rejects.toThrow()
    expect(await store.load()).toEqual([makeNote()])
  })

  it.each(['{broken json', 'null', '[{}]', ''])('throws for corrupt file %#, never returns null', async (contents) => {
    const paths = resolveVaultPaths(root)
    await fs.mkdir(paths.directory)
    await fs.writeFile(paths.file, contents)
    await expect(createNotesStorage(root).load()).rejects.toThrow()
    expect(await fs.readFile(paths.file, 'utf8')).toBe(contents)
  })

  it('rejects invalid UTF-8 bytes', async () => {
    const paths = resolveVaultPaths(root)
    await fs.mkdir(paths.directory)
    await fs.writeFile(paths.file, Buffer.from([0xff, 0xfe]))
    await expect(createNotesStorage(root).load()).rejects.toThrow()
  })

  it('rejects an oversized file before parsing or reading it into memory', async () => {
    const paths = resolveVaultPaths(root)
    await fs.mkdir(paths.directory)
    const handle = await fs.open(paths.file, 'w')
    await handle.truncate(MAX_BYTES + 1)
    await handle.close()
    await expect(createNotesStorage(root).load()).rejects.toThrow(/exceeds/)
  })

  it('preserves the last good file and removes temp files if rename fails', async () => {
    const store = createNotesStorage(root)
    await store.save([makeNote()])
    vi.spyOn(mutableFs, 'rename').mockRejectedValueOnce(new Error('simulated rename failure'))
    await expect(store.save([makeNote({ title: 'not committed' })])).rejects.toThrow(/simulated/)
    expect(await store.load()).toEqual([makeNote()])
    expect(await fs.readdir(path.join(root, 'prototype-vault'))).toEqual(['notes.json'])
    await store.save([makeNote({ title: 'recovered' })])
    expect((await store.load())[0].title).toBe('recovered')
  })

  it('does not poison the operation queue after a load failure', async () => {
    const paths = resolveVaultPaths(root)
    await fs.mkdir(paths.directory)
    await fs.writeFile(paths.file, '{broken')
    const store = createNotesStorage(root)
    await expect(store.load()).rejects.toThrow()
    await fs.writeFile(paths.file, JSON.stringify([makeNote()]))
    expect(await store.load()).toEqual([makeNote()])
  })

  it('rejects non-absolute userData paths', () => {
    for (const input of ['', '../other', 'relative', null, 42, `${root}\0bad`]) {
      expect(() => resolveVaultPaths(input)).toThrow(/absolute trusted/)
    }
  })

  it('refuses a vault directory junction/symlink without accessing its notes', async () => {
    const outside = path.join(root, 'outside-fixture')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'notes.json'), 'DO NOT READ OR OVERWRITE')
    await fs.symlink(outside, resolveVaultPaths(root).directory, process.platform === 'win32' ? 'junction' : 'dir')
    const store = createNotesStorage(root)
    await expect(store.load()).rejects.toThrow(/link/)
    await expect(store.save([])).rejects.toThrow(/link/)
    expect(await fs.readFile(path.join(outside, 'notes.json'), 'utf8')).toBe('DO NOT READ OR OVERWRITE')
  })

  it('refuses a notes hard link without touching the target', async () => {
    const outside = path.join(root, 'outside.json')
    const paths = resolveVaultPaths(root)
    await fs.writeFile(outside, JSON.stringify([makeNote()]))
    await fs.mkdir(paths.directory)
    await fs.link(outside, paths.file)
    const store = createNotesStorage(root)
    await expect(store.load()).rejects.toThrow(/unlinked/)
    await expect(store.save([])).rejects.toThrow(/unlinked/)
    expect(JSON.parse(await fs.readFile(outside, 'utf8'))).toEqual([makeNote()])
  })
})

describe('renderer origin and navigation policy', () => {
  it('accepts only the explicitly local Vite origin', () => {
    expect(parseDevServerUrl('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173')
    expect(parseDevServerUrl('http://localhost:5173')).toBe('http://localhost:5173')
    expect(parseDevServerUrl(undefined)).toBeNull()
    for (const url of ['https://example.com', 'http://127.0.0.1:9000', 'http://localhost:5173/evil', 'http://user@localhost:5173', 'http://localhost:5173/?x=1']) {
      expect(() => parseDevServerUrl(url)).toThrow()
    }
  })

  it('requires a main document URL, not just any URL sharing an origin', () => {
    const trusted = { devServerUrl: 'http://127.0.0.1:5173', indexFile: path.join(root, 'dist', 'index.html') }
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/#notes', trusted)).toBe(true)
    for (const url of ['http://localhost:5173/', 'http://127.0.0.1:5173/other', 'http://127.0.0.1:5173/?other', 'https://example.com/', 'about:blank']) {
      expect(isTrustedRendererUrl(url, trusted)).toBe(false)
    }
    expect(isAllowedRequest('ws://127.0.0.1:5173/', trusted)).toBe(true)
    expect(isAllowedRequest('https://example.com/track', trusted)).toBe(false)
  })

  it('accepts only the production index document and dist resources', () => {
    const indexFile = path.join(root, 'dist', 'index.html')
    const trusted = { devServerUrl: null, indexFile }
    expect(isTrustedRendererUrl(`${pathToFileURL(indexFile).href}#note-1`, trusted)).toBe(true)
    expect(isTrustedRendererUrl(pathToFileURL(path.join(root, 'other.html')).href, trusted)).toBe(false)
    expect(isAllowedRequest(pathToFileURL(path.join(root, 'dist', 'assets', 'app.js')).href, trusted)).toBe(true)
    expect(isAllowedRequest(pathToFileURL(path.join(root, 'private.json')).href, trusted)).toBe(false)
    expect(isAllowedRequest(pathToFileURL(path.join(root, 'dist-other', 'app.js')).href, trusted)).toBe(false)
    expect(isAllowedRequest('http://127.0.0.1:5173/', trusted)).toBe(false)
    expect(isAllowedRequest('https://fonts.googleapis.com/css', trusted)).toBe(false)
  })
})
