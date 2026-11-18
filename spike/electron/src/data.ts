export type Category = '灵感' | '技术' | '项目' | '阅读'
export type NoteStatus = 'active' | 'archived' | 'trashed'
export interface Note {
  id: string
  title: string
  body: string
  category: Category
  tags: string[]
  favorite: boolean
  inbox: boolean
  createdAt: string
  updatedAt: string
  revision?: number
  status?: NoteStatus
  sensitivity?: 'public' | 'internal' | 'secret'
  deletedAt?: string
}
export interface VaultResult { id: string; title: string; category: Category; updatedAt: string; rank: number }
interface KbStore {
  list(): Promise<{ notes: Note[]; corrupt: unknown[] }>
  save(note: Note, baseRevision?: number): Promise<Note>
  remove(id: string, baseRevision?: number): Promise<Note>
  restore(id: string, baseRevision?: number): Promise<Note>
  purge(id: string): Promise<{ id: string }>
  search(query: string, opts?: { limit?: number }): Promise<VaultResult[]>
  rebuild(): Promise<{ count: number; segmenter: string }>
  ask(query: string): Promise<AskResult>
  info(): Promise<{ mode: string; path: string; segmenter?: string }>
  export(notes: Note[]): Promise<boolean>
}
export interface AskResult { refused: boolean; reason?: string; answer: string; citations: { id: string; title: string }[]; adapter?: string; retrieved?: number }
declare global { interface Window { kbStore?: KbStore; desktopNotes?: { export(notes: Note[]): Promise<boolean> } } }

export const categories: Category[] = ['灵感', '技术', '项目', '阅读']
export const categoryMeta = {
  灵感: { label: '灵感与想法', subtitle: '给每个念头一个去处', color: 'ochre' },
  技术: { label: '技术与方法', subtitle: '构建可复用的理解', color: 'blue' },
  项目: { label: '项目与实践', subtitle: '让思考成为行动', color: 'green' },
  阅读: { label: '阅读与摘录', subtitle: '与好的思想相遇', color: 'purple' },
}

const stamp = (days: number) => new Date(Date.now() - days * 86400000).toISOString()
export const seedNotes: Note[] = [
  { id: 'N-example-01', title: '设计一个让人愿意停留的知识空间', category: '灵感', tags: ['产品思考', '设计'], favorite: true, inbox: false, createdAt: stamp(3), updatedAt: stamp(0), body: '# 好的工具，应该让内容安静地发生\n\n知识库不是存放更多信息的地方，而是帮助我们**重新遇见自己的想法**。\n\n## 三个设计原则\n\n- 留白不是浪费，而是给思考留出呼吸。\n- 先记录，再整理。不要让分类成为表达的门槛。\n- 不用复杂的仪表盘证明价值，让一次找回证明。\n\n> 做一座花园，而不是一间仓库。\n\n## 一个小实验\n\n每天留下一个真正属于自己的问题。一周后回来，看它们之间有没有新的连接。' },
  { id: 'N-example-02', title: '本地优先，不只是一个技术选择', category: '技术', tags: ['Local-first', '架构'], favorite: true, inbox: false, createdAt: stamp(4), updatedAt: stamp(0), body: '# 数据应该先属于自己\n\n本地优先意味着：即使断开网络，记录和思考也不会中断。\n\n## 数据边界\n\n```text\nMarkdown / JSON → 真相源\nSQLite FTS5     → 可重建索引\n本地附件        → 相对路径引用\n```\n\n文件先持久化，再更新索引。搜索故障不能导致正文丢失。\n\n## 需要验证\n\n- 中文路径与文件锁\n- 外部编辑时的冲突保留\n- 备份能否在新目录完整恢复\n\n这些是设计目标，不是已经完成的能力。' },
  { id: 'N-example-03', title: '从一个可用的桌面开始', category: '项目', tags: ['ZHD', '下一步'], favorite: false, inbox: false, createdAt: stamp(2), updatedAt: stamp(1), body: '# 先做一个小而完整的闭环\n\n桌面端是第一优先级。先把最常用的动作做好，再让系统慢慢生长。\n\n## 当前方向\n\n1. 验证 Windows 窗口、文件读写和安装包。\n2. 建立可靠的本地存储与备份。\n3. 跑通捕获、编辑、搜索。\n4. 再连接知识库 AI。\n\n## 暂时不做\n\n云同步、向量数据库、知识图谱、复杂审计。鸿蒙保留在后续评估中，不阻塞桌面。' },
  { id: 'N-example-04', title: '笔记的价值，发生在第二次阅读', category: '阅读', tags: ['阅读摘录', '知识管理'], favorite: true, inbox: false, createdAt: stamp(6), updatedAt: stamp(1), body: '# 记录只是开始\n\n第一次写下，是为了不忘记。第二次读到，才有机会把它变成自己的理解。\n\n> 收藏解决的是“以后可能需要”，重读回答的是“现在对我有什么意义”。\n\n可以试着给每篇笔记补上一句话：\n\n**这条信息，会改变我的哪个决定？**\n\n如果暂时没有答案，也没关系。允许想法以未完成的状态存在。' },
  { id: 'N-example-05', title: '让不同 Agent 用同一种方式协作', category: '技术', tags: ['Agent', '工作流'], favorite: false, inbox: false, createdAt: stamp(5), updatedAt: stamp(2), body: '# 换工具，不换工作方式\n\n好的交接，不是把所有上下文再说一遍，而是留下足够清晰的下一步。\n\n| 内容 | 应该留下什么 |\n| --- | --- |\n| 目标 | 这一次要完成什么 |\n| 边界 | 允许改动的文件和范围 |\n| 证据 | 实际运行过的验证 |\n| 下一步 | 还没完成的部分 |\n\n明确的请求就是小任务的起点，不必为了流程再造一套流程。' },
  { id: 'N-example-06', title: '每周，整理一次自己的好奇心', category: '灵感', tags: ['日常', '复盘'], favorite: false, inbox: true, createdAt: stamp(0), updatedAt: stamp(0), body: '# 给好奇心一点空间\n\n不必把所有灵感立即变成任务。\n\n本周想继续探索：\n\n- 编辑器里怎样的留白最舒服？\n- 搜索结果怎样帮助人重新建立关联？\n- 如果只保留三个功能，我会留下哪三个？\n\n下次回来，先选一个问题就好。' },
  { id: 'N-example-07', title: '一个随手记下的小想法', category: '灵感', tags: ['待整理'], favorite: false, inbox: true, createdAt: stamp(1), updatedAt: stamp(1), body: '也许快速捕获不需要一开始就有标题。先把想法写下来，再决定它属于哪里。\n\n下次做交互时试一试。' },
]

export const hasVault = () => !!window.kbStore
const STORAGE_KEY = 'zhd-studio.prototype.notes.v1'
let browserCache: Note[] | null = null

function readBrowser(): Note[] {
  if (browserCache) return browserCache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    browserCache = raw ? JSON.parse(raw) as Note[] : []
  } catch { browserCache = [] }
  return browserCache
}
function writeBrowser(notes: Note[]) {
  browserCache = notes
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

export async function listAll(): Promise<{ active: Note[]; trashed: Note[]; corrupt: unknown[] }> {
  if (window.kbStore) {
    const { notes, corrupt } = await window.kbStore.list()
    return { active: notes.filter(n => n.status !== 'trashed'), trashed: notes.filter(n => n.status === 'trashed'), corrupt }
  }
  const all = readBrowser()
  return { active: all.filter(n => n.status !== 'trashed'), trashed: all.filter(n => n.status === 'trashed'), corrupt: [] }
}

export async function persistNote(note: Note): Promise<Note> {
  if (window.kbStore) return window.kbStore.save(note, note.revision)
  const all = readBrowser()
  const exists = all.some(n => n.id === note.id)
  const revision = (all.find(n => n.id === note.id)?.revision ?? 0) + 1
  const saved = { ...note, revision, status: note.status ?? 'active' }
  writeBrowser(exists ? all.map(n => n.id === note.id ? saved : n) : [saved, ...all])
  return saved
}

export async function trashNote(note: Note): Promise<Note> {
  if (window.kbStore) return window.kbStore.remove(note.id, note.revision)
  const saved = { ...note, status: 'trashed' as NoteStatus, deletedAt: new Date().toISOString(), revision: (note.revision ?? 0) + 1 }
  writeBrowser(readBrowser().map(n => n.id === note.id ? saved : n))
  return saved
}

export async function restoreNote(note: Note): Promise<Note> {
  if (window.kbStore) return window.kbStore.restore(note.id, note.revision)
  const saved = { ...note, status: 'active' as NoteStatus, revision: (note.revision ?? 0) + 1 }
  delete saved.deletedAt
  writeBrowser(readBrowser().map(n => n.id === note.id ? saved : n))
  return saved
}

export async function purgeNote(id: string): Promise<void> {
  if (window.kbStore) { await window.kbStore.purge(id); return }
  writeBrowser(readBrowser().filter(n => n.id !== id))
}

export async function searchNotes(query: string, active: Note[]): Promise<Note[]> {
  const q = query.trim()
  if (!q) return active.slice(0, 12)
  if (window.kbStore) {
    const results = await window.kbStore.search(q, { limit: 50 })
    const byId = new Map(active.map(n => [n.id, n]))
    return results.map(r => byId.get(r.id)).filter((n): n is Note => !!n)
  }
  const lower = q.toLocaleLowerCase()
  return active.filter(n => `${n.title} ${n.body} ${n.tags.join(' ')}`.toLocaleLowerCase().includes(lower)).slice(0, 12)
}

export async function askKnowledge(query: string, active: Note[]): Promise<AskResult> {
  if (window.kbStore) return window.kbStore.ask(query)
  const q = query.trim()
  if (!q) return { refused: true, reason: 'no-basis', answer: '请先输入一个问题。', citations: [] }
  const hits = await searchNotes(q, active)
  if (!hits.length) return { refused: true, reason: 'no-basis', answer: '知识库中没有找到相关依据，无法回答。可以换个关键词，或先记录相关内容。', citations: [] }
  const top = hits.slice(0, 3)
  const parts = top.map(n => `《${n.title}》：${excerpt(n.body).slice(0, 160)}`)
  return { refused: false, answer: `（浏览器离线检索摘要，未连接生成模型）围绕「${q}」，相关的记录：\n\n${parts.join('\n\n')}`, citations: top.map(n => ({ id: n.id, title: n.title })), adapter: 'browser-extractive', retrieved: hits.length }
}

export async function storageInfo(): Promise<{ mode: string; path: string }> {
  if (window.kbStore) return window.kbStore.info()
  return { mode: 'browser', path: 'localStorage' }
}

export async function exportAll(notes: Note[]): Promise<boolean> {
  if (window.kbStore) return window.kbStore.export(notes)
  const blob = new Blob([JSON.stringify({ format: 'zhd-prototype-v1', exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zhd-notes-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export function excerpt(body: string) {
  return body.replace(/```[\s\S]*?```/g, '').replace(/^#+.*$/gm, '').replace(/[*#>`|\[\]]/g, '').replace(/\s+/g, ' ').trim()
}
export function shortDate(date: string) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '日期未知'
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
