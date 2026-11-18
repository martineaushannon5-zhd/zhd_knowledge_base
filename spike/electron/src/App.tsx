import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpRight, LogIn, BookOpen, Bot, Check, CheckCheck, ChevronDown, ChevronRight, Command, FileText, Folder, Grid2X2, Inbox, LayoutDashboard, Leaf, List, LoaderCircle, Menu, MoreHorizontal, Plus, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, Sparkles, Star, Trash2, X, type LucideIcon } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { categories, categoryMeta, excerpt, listAll, persistNote, trashNote, restoreNote, purgeNote, searchNotes, askKnowledge, storageInfo, exportAll, hasVault, seedNotes, shortDate, type Category, type Note, type AskResult } from './data'
import './styles.css'

type View = 'home' | 'all' | 'inbox' | 'favorites' | 'trash' | Category
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
const md = new MarkdownIt({ html: false, linkify: false, breaks: true })
const categoryIcons: Record<Category, LucideIcon> = { 灵感: Sparkles, 技术: Command, 项目: Folder, 阅读: BookOpen }
const viewNames: Record<View, string> = { home: '工作台', all: '全部笔记', inbox: '收件箱', favorites: '我的收藏', trash: '回收站', 灵感: '灵感与想法', 技术: '技术与方法', 项目: '项目与实践', 阅读: '阅读与摘录' }

function Mark({ small = false }: { small?: boolean }) {
  return <svg viewBox="0 0 40 40" className={small ? 'brand-mark small' : 'brand-mark'} aria-hidden="true"><path d="M9 9h22L9 31h22M9 20h22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" /><path d="M20 5v30" stroke="currentColor" strokeWidth="1" opacity=".35" /></svg>
}

function OrbitalArt() {
  return <svg className="orbital-art" viewBox="0 0 420 300" fill="none" aria-hidden="true"><defs><pattern id="orbital-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#e7eed8" opacity=".13" /></pattern></defs><rect width="420" height="300" fill="url(#orbital-grid)" /><g stroke="#c7d2ad" strokeWidth=".8" opacity=".45"><circle cx="221" cy="152" r="103" /><circle cx="221" cy="152" r="80" /><ellipse cx="221" cy="152" rx="128" ry="40" transform="rotate(-38 221 152)" /><ellipse cx="221" cy="152" rx="128" ry="40" transform="rotate(38 221 152)" /><path d="M65 152h310M221 20v263" strokeDasharray="3 6" /><path d="M129 59l184 186M129 245L313 59" opacity=".3" /></g><g fill="#dce5bd"><circle cx="221" cy="152" r="6" /><circle cx="119" cy="135" r="4" /><circle cx="301" cy="91" r="4" /><circle cx="246" cy="252" r="3" /></g><path d="M205 130h31l-31 42h31" stroke="#e8ecd8" strokeWidth="1.5" /><g fill="#d8dfc9" fontFamily="Georgia, serif" fontSize="10" opacity=".65"><text x="321" y="55">IDEAS</text><text x="77" y="253">CONNECTIONS</text><text x="231" y="29">01 / ∞</text></g></svg>
}

function Dialog({ children, onClose, label, className = '' }: { children: ReactNode; onClose: () => void; label: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close() }, [])
  return <dialog ref={ref} className={`dialog ${className}`} aria-label={label} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>{children}</dialog>
}

const MarkdownEditor = lazy(() => import('./MarkdownEditor'))

function buildNote(draft: Note, tagsText: string): Note {
  return {
    ...draft,
    title: draft.title.trim() || draft.body.replace(/^#+\s*/, '').split('\n')[0].slice(0, 40) || '未命名笔记',
    tags: [...new Set(tagsText.split(/[,，]/).map(t => t.trim()).filter(Boolean))].slice(0, 8),
    updatedAt: new Date().toISOString(),
  }
}
const snapshot = (note: Note, tagsText: string) => JSON.stringify([note.id, note.title, note.body, note.category, note.favorite, note.inbox, tagsText])

function NoteDialog({ note, isNew, onClose, onPersist, onTrash }: { note: Note; isNew: boolean; onClose: () => void; onPersist: (note: Note) => Promise<Note>; onTrash: (note: Note) => Promise<void> }) {
  const [draft, setDraft] = useState(note)
  const [editing, setEditing] = useState(isNew)
  const [tags, setTags] = useState(note.tags.join('，'))
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const lastSaved = useRef<string | null>(isNew ? null : snapshot(note, note.tags.join('，')))
  const busy = useRef(false)
  const dirty = snapshot(draft, tags) !== lastSaved.current

  const persistDraft = useCallback(async (closeAfter: boolean) => {
    if (busy.current) return
    if (!draft.title.trim() && !draft.body.trim()) { setSaveState('error'); setErrorMsg('先写下标题或一点内容，再保存。'); return }
    const candidate = buildNote(draft, tags)
    busy.current = true
    setSaveState('saving'); setErrorMsg('')
    try {
      const saved = await onPersist(candidate)
      lastSaved.current = snapshot(saved, saved.tags.join('，'))
      setDraft(saved)
      setTags(saved.tags.join('，'))
      setSaveState('saved')
      if (closeAfter) onClose()
    } catch (error) {
      const conflict = (error as { code?: string })?.code === 'ECONFLICT' || /conflict/i.test(String((error as Error)?.message))
      setSaveState(conflict ? 'conflict' : 'error')
      setErrorMsg(conflict ? '这篇笔记已在外部被修改。为避免覆盖，请关闭后重新打开再编辑。' : '保存失败，内容仍在这里。请检查存储空间或权限后重试。')
    } finally { busy.current = false }
  }, [draft, tags, onPersist, onClose])

  useEffect(() => {
    if (!editing || !dirty || saveState === 'saving') return
    if (!draft.title.trim() && !draft.body.trim()) return
    const timer = setTimeout(() => { void persistDraft(false) }, 1500)
    return () => clearTimeout(timer)
  }, [draft, tags, editing, dirty, saveState, persistDraft])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const close = () => {
    if (!dirty) { onClose(); return }
    if (saveState === 'error' || saveState === 'conflict') { if (window.confirm('还有未保存的修改，确定关闭吗？')) onClose(); return }
    void persistDraft(true)
  }
  const statusText = saveState === 'saving' ? '正在保存…' : saveState === 'saved' ? '已保存' : saveState === 'conflict' ? '外部已修改' : saveState === 'error' ? '保存失败' : dirty ? '有未保存的修改' : isNew ? '尚未保存' : '已保存'
  const html = DOMPurify.sanitize(md.render(draft.body), { FORBID_TAGS: ['img', 'iframe', 'style'], FORBID_ATTR: ['style'] })

  return <Dialog label={isNew ? '新建笔记' : note.title} onClose={close} className="note-dialog"><div className="note-dialog-shell" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void persistDraft(false) } }}>
    <header className="editor-toolbar"><div className="editor-breadcrumb"><FileText size={16} /><span>{isNew ? '捕获一个新想法' : '知识空间'}</span><ChevronRight size={13} /><span>{draft.category}</span></div><div className="editor-toolbar-right"><span className={`save-state save-${saveState}`} role="status">{saveState === 'saving' && <LoaderCircle size={13} className="spin" />}{statusText}</span><button className="icon-button" aria-label="关闭笔记" onClick={close}><X size={20} /></button></div></header>
    <div className="editor-heading"><div className={`eyebrow ${categoryMeta[draft.category].color}`}>{isNew ? 'A NEW THOUGHT' : 'YOUR KNOWLEDGE, CONNECTED'}</div>{editing ? <input className="title-input" aria-label="笔记标题" placeholder="给这个想法一个名字…" value={draft.title} maxLength={160} autoFocus={isNew} onChange={e => setDraft({ ...draft, title: e.target.value })} /> : <h1>{draft.title}</h1>}<div className="editor-meta"><span>{shortDate(draft.updatedAt)} 更新</span><span className="meta-dot" /><span>{draft.body.length.toLocaleString()} 字符</span>{draft.revision !== undefined && <><span className="meta-dot" /><span>修订 {draft.revision}</span></>}</div></div>
    <div className="editor-tabs"><div className="segmented"><button className={!editing ? 'selected' : ''} onClick={() => setEditing(false)}>阅读</button><button className={editing ? 'selected' : ''} onClick={() => setEditing(true)}>编辑</button></div><span className="quiet-label">Markdown · {editing ? '停止输入 1.5 秒后自动保存' : '让内容，成为主角'}</span></div>
    <div className="editor-body">{editing ? <Suspense fallback={<div className="loading-state"><LoaderCircle className="spin" size={20} />正在打开编辑器…</div>}><MarkdownEditor value={draft.body} onChange={body => setDraft(d => ({ ...d, body }))} /></Suspense> : <article className="prose" onClick={e => { if ((e.target as HTMLElement).closest('a')) { e.preventDefault(); setErrorMsg('预览中的外部链接不会自动打开，请在编辑模式复制链接。') } }} dangerouslySetInnerHTML={{ __html: html || '<p>还没有正文。点击「编辑」，从一个念头开始。</p>' }} />}</div>
    <footer className="editor-footer"><div className="editor-properties"><label>集合<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as Category })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="tags-field">标签<input aria-label="标签，用逗号分隔" value={tags} placeholder="用逗号分隔" onChange={e => setTags(e.target.value)} /></label><button className={`icon-button ${draft.favorite ? 'starred' : ''}`} aria-label={draft.favorite ? '取消收藏笔记' : '收藏笔记'} onClick={() => setDraft({ ...draft, favorite: !draft.favorite })}><Star size={18} fill={draft.favorite ? 'currentColor' : 'none'} /></button>{!isNew && <button className="icon-button" aria-label="移到回收站" onClick={() => { void onTrash(draft).then(onClose) }}><Trash2 size={17} /></button>}{draft.inbox && <label className="inbox-check"><input type="checkbox" checked={!draft.inbox} onChange={() => setDraft({ ...draft, inbox: false })} />移出收件箱</label>}</div><div className="editor-save">{errorMsg && <span className="form-error" role="alert">{errorMsg}</span>}<button className="secondary-button" onClick={() => void persistDraft(false)} disabled={saveState === 'saving'}>保存</button><button className="primary-button" onClick={() => void persistDraft(true)} disabled={saveState === 'saving'}>{saveState === 'saving' ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}完成</button></div></footer>
  </div></Dialog>
}

function NoteCard({ note, onOpen, onFavorite, compact = false }: { note: Note; onOpen: () => void; onFavorite: () => void; compact?: boolean }) {
  const Icon = categoryIcons[note.category]
  return <article className={`note-card ${compact ? 'compact' : ''}`}><div className="card-top"><span className={`category-label ${categoryMeta[note.category].color}`}><Icon size={14} />{note.category}</span><button className={`icon-button favorite-button ${note.favorite ? 'starred' : ''}`} aria-label={`${note.favorite ? '取消收藏' : '收藏'}：${note.title}`} onClick={onFavorite}><Star size={15} fill={note.favorite ? 'currentColor' : 'none'} /></button></div><button className="note-open" onClick={onOpen}><h3>{note.title}</h3><p>{excerpt(note.body)}</p></button><div className="card-bottom"><div className="tag-list">{note.tags.slice(0, 2).map(t => <span key={t}>{t}</span>)}</div><time dateTime={note.updatedAt}>{shortDate(note.updatedAt)}</time></div></article>
}

function TrashCard({ note, onRestore, onPurge }: { note: Note; onRestore: () => void; onPurge: () => void }) {
  return <article className="note-card trash-card"><div className="card-top"><span className="category-label">{note.category}</span><span className="trash-date">{note.deletedAt ? shortDate(note.deletedAt) : ''} 删除</span></div><div className="note-open"><h3>{note.title}</h3><p>{excerpt(note.body)}</p></div><div className="trash-actions"><button className="secondary-button" onClick={onRestore}><RotateCcw size={14} />恢复</button><button className="text-button danger-text" onClick={onPurge}><Trash2 size={14} />彻底删除</button></div></article>
}

function AskDialog({ notes, onClose, onOpenNote }: { notes: Note[]; onClose: () => void; onOpenNote: (n: Note) => void }) {
  const [q, setQ] = useState('')
  const [result, setResult] = useState<AskResult | null>(null)
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    if (!q.trim() || loading) return
    setLoading(true)
    try { setResult(await askKnowledge(q, notes)) }
    catch { setResult({ refused: true, answer: '提问失败，请稍后重试。', citations: [] }) }
    finally { setLoading(false) }
  }
  return <Dialog label="问知识库" onClose={onClose} className="ask-dialog">
    <div className="ask-head"><span className="ask-head-icon"><Bot size={22} /></span><div className="ask-head-text"><h2>问知识库</h2><p>检索你的笔记并带引用回答 · 离线适配器，未连接真实模型</p></div><button className="icon-button" aria-label="关闭问答" onClick={onClose}><X size={19} /></button></div>
    <div className="ask-input"><input aria-label="向知识库提问" placeholder="例如：本地优先是什么意思？" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }} /><button className="primary-button" onClick={() => void submit()} disabled={loading || !q.trim()}>{loading ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}{loading ? '检索中' : '提问'}</button></div>
    {result && <div className="ask-result">{result.refused ? <div className="ask-refused" role="status">{result.answer}</div> : <><div className="ask-answer">{result.answer}</div>{result.citations.length > 0 && <div className="ask-citations"><span className="ask-cite-label">依据</span>{result.citations.map(c => { const n = notes.find(x => x.id === c.id); return <button key={c.id} className="ask-cite" onClick={() => n && onOpenNote(n)}><FileText size={12} />{c.title}</button> })}</div>}</>}<div className="ask-meta">{result.adapter ? `适配器：${result.adapter}` : ''}{result.retrieved ? ` · 检索 ${result.retrieved} 篇` : ''} · 不发送内容到云端</div></div>}
  </Dialog>
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [trashed, setTrashed] = useState<Note[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState<View>('home')
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all')
  const [listLayout, setListLayout] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Note[]>([])
  const [selected, setSelected] = useState<{ note: Note; isNew: boolean } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [quick, setQuick] = useState('')
  const [sort, setSort] = useState<'updated' | 'created'>('updated')
  const [mode, setMode] = useState('browser')
  const [showIntro, setShowIntro] = useState(() => { try { return !localStorage.getItem('zhd.introSeen') } catch { return true } })
  const isDesktop = hasVault()
  useEffect(() => { if (showIntro) { try { localStorage.setItem('zhd.introSeen', '1') } catch {} } }, [showIntro])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const info = await storageInfo()
        if (!active) return
        setMode(info.mode)
        const { active: act, trashed: tr } = await listAll()
        if (!active) return
        if (act.length === 0 && tr.length === 0 && !localStorage.getItem('zhd.seeded')) {
          // Show the workspace immediately; seed examples in the background so
          // the first login->workspace jump is not blocked by per-note fsync.
          setNotes([]); setTrashed([]); setReady(true)
          ;(async () => {
            const seeded: Note[] = []
            for (const s of seedNotes) { try { seeded.push(await persistNote(s)) } catch {} }
            try { localStorage.setItem('zhd.seeded', '1') } catch {}
            if (active) setNotes(prev => prev.length ? prev : seeded)
          })()
        } else if (active) { setNotes(act); setTrashed(tr); setReady(true) }
      } catch {
        if (active) setLoadError('无法读取本地笔记。原数据已保留，请检查存储权限或数据格式后刷新。')
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3300); return () => clearTimeout(timer) }, [toast])
  useEffect(() => {
    if (!searchOpen) return
    let active = true
    const timer = setTimeout(() => { searchNotes(query, notes).then(r => { if (active) setSearchResults(r) }).catch(() => { if (active) setSearchResults([]) }) }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [query, searchOpen, notes])

  const newNote = useCallback((body = '') => {
    if (!ready) return
    const date = new Date().toISOString()
    setSelected({ note: { id: `N-${crypto.randomUUID()}`, title: '', body, category: categories.includes(view as Category) ? view as Category : '灵感', tags: [], favorite: false, inbox: true, createdAt: date, updatedAt: date }, isNew: true })
  }, [ready, view])

  useEffect(() => { const key = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !selected && !settingsOpen) { e.preventDefault(); setSearchOpen(o => !o) }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !selected && !settingsOpen && !searchOpen) { e.preventDefault(); newNote() }
  }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [newNote, selected, settingsOpen, searchOpen])

  const upsert = (saved: Note) => setNotes(prev => prev.some(n => n.id === saved.id) ? prev.map(n => n.id === saved.id ? saved : n) : [saved, ...prev])
  const onPersist = useCallback(async (note: Note) => { const saved = await persistNote(note); upsert(saved); return saved }, [])
  const favorite = async (note: Note) => { try { const saved = await persistNote({ ...note, favorite: !note.favorite }); upsert(saved); setToast(note.favorite ? '已取消收藏' : '已加入收藏') } catch { setToast('保存失败，请稍后重试；原数据未改动') } }
  const doTrash = async (note: Note) => { const saved = await trashNote(note); setNotes(prev => prev.filter(n => n.id !== note.id)); setTrashed(prev => [saved, ...prev.filter(n => n.id !== note.id)]); setToast('已移到回收站') }
  const doRestore = async (note: Note) => { const saved = await restoreNote(note); setTrashed(prev => prev.filter(n => n.id !== note.id)); upsert(saved); setToast('已恢复笔记') }
  const doPurge = async (note: Note) => { if (!window.confirm(`彻底删除「${note.title}」？此操作不可恢复。`)) return; await purgeNote(note.id); setTrashed(prev => prev.filter(n => n.id !== note.id)); setToast('已彻底删除') }
  const rebuild = async () => { try { const r = await window.kbStore?.rebuild(); setToast(r ? `索引已重建：${r.count} 篇` : '当前环境无索引') } catch { setToast('索引重建失败') } }

  const go = (target: View) => { setView(target); setActiveFilter('all'); setSidebarOpen(false) }
  const openNote = (note: Note) => { setSearchOpen(false); setSelected({ note, isNew: false }) }
  const favorites = notes.filter(n => n.favorite)
  const inbox = notes.filter(n => n.inbox)
  const source = view === 'trash' ? trashed : notes
  const filtered = source.filter(n => (view === 'inbox' ? n.inbox : view === 'favorites' ? n.favorite : view === 'trash' ? true : categories.includes(view as Category) ? n.category === view : true) && (activeFilter === 'all' || n.category === activeFilter)).sort((a, b) => (sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : b.createdAt.localeCompare(a.createdAt)))
  const date = new Date()
  const dateString = date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
  const navItems: { id: View; icon: LucideIcon; count?: number }[] = [{ id: 'home', icon: LayoutDashboard }, { id: 'inbox', icon: Inbox, count: inbox.length }, { id: 'all', icon: FileText, count: notes.length }, { id: 'favorites', icon: Star, count: favorites.length }, { id: 'trash', icon: Trash2, count: trashed.length }]
  const exportNotes = async () => { try { if (await exportAll(notes)) setToast('已导出当前笔记 JSON') } catch { setToast('导出失败，笔记未受影响，请稍后重试') } }

  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}><button className="brand" onClick={() => go('home')} aria-label="ZHD 知识空间首页"><Mark /><span><strong>ZHD<span className="brand-period">.</span></strong><small>KNOWLEDGE STUDIO</small></span></button><div className="workspace-label"><span className="workspace-avatar">Z</span><div>个人知识空间<small>Personal workspace</small></div><ShieldCheck size={15} /></div><button className="sidebar-search" onClick={() => setSearchOpen(true)}><Search size={16} /><span>搜索你的知识</span><kbd>⌃ K</kbd></button>
      <nav aria-label="主导航"><div className="nav-heading">工作空间</div>{navItems.map(({ id, icon: Icon, count }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => go(id)}><Icon size={18} strokeWidth={1.6} /><span>{viewNames[id]}</span>{count !== undefined && <small>{count}</small>}{view === id && <span className="active-dot" />}</button>)}<div className="nav-heading collections-heading">我的集合<span>04</span></div>{categories.map(c => <button key={c} className={`nav-item collection-nav ${view === c ? 'active' : ''}`} onClick={() => go(c)}><span className={`collection-dot ${categoryMeta[c].color}`} /><span>{categoryMeta[c].label}</span><small>{notes.filter(n => n.category === c).length}</small></button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Leaf size={19} /><p>知识会生长。<br /><span>从记录一个想法开始。</span></p><span className="tiny-cross">+</span></div><button className="nav-item settings-nav" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /><span>偏好与数据</span><ChevronRight size={14} /></button><div className="user-profile"><span className="profile-avatar">泓</span><div><strong>郑泓达</strong><small>为长期思考而构建</small></div><button className="icon-button" aria-label="工作空间信息" onClick={() => setSettingsOpen(true)}><MoreHorizontal size={19} /></button></div></div>
    </aside>
    <div className="app-body"><header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span className="breadcrumb-root">知识空间</span><ChevronRight size={13} /><span>{viewNames[view]}</span></div><div className="topbar-actions"><span className="storage-indicator"><span />{isDesktop ? '本地文件库' : '浏览器预览'}</span><span className="topbar-divider" /><button className="icon-button" aria-label="返回登录页" title="返回登录页（当前为预览工作台）" onClick={() => { window.location.hash = '/login' }}><LogIn size={18} /></button><button className="icon-button" aria-label="问知识库" title="问知识库（离线检索，未接真实模型）" onClick={() => setAskOpen(true)}><Bot size={19} /></button><button className="icon-button" aria-label="搜索笔记" onClick={() => setSearchOpen(true)}><Search size={19} /></button><button className="primary-button new-top" onClick={() => newNote()} disabled={!ready}><Plus size={17} />新建笔记</button></div></header>
    <main className="main-content"><div className="page-heading"><div><div className="eyebrow">{view === 'home' ? 'A LITTLE SPACE FOR BIG IDEAS' : 'YOUR PERSONAL COLLECTION'}</div><h1>{view === 'home' ? '让想法，慢慢生长' : viewNames[view]}{view === 'home' && <span className="heading-dot" aria-hidden="true">。</span>}</h1><p>{view === 'home' ? '记录当下的灵感，连接未来的自己。' : view === 'inbox' ? '先记下来。好的想法，不必一开始就井井有条。' : view === 'favorites' ? '那些值得反复阅读、值得再次相遇的想法。' : view === 'trash' ? '删除的笔记会留在这里，可以恢复或彻底清除。' : '把零散的线索，整理成属于自己的理解。'}</p></div><div className="date-label"><span>{dateString}</span><small>保持好奇，持续积累</small></div></div>
    {loadError ? <section className="error-state" role="alert"><ShieldCheck size={30} /><h2>先保护好你的数据</h2><p>{loadError}</p><button className="secondary-button" onClick={() => location.reload()}>重新读取</button></section> : !ready ? <div className="loading-state"><LoaderCircle className="spin" />正在打开你的知识空间…</div> : <div className={`workspace-grid ${view !== 'home' ? 'library-view' : ''}`}><div className="primary-column">
      {view === 'home' && <>{showIntro && <section className="feature-card"><div className="feature-copy"><span className="feature-kicker"><span /> THINK. CONNECT. GROW.</span><h2>每一个小想法，<br />都值得被认真收藏。</h2><p>这里不只是信息的存放地，<br />也是你的思考，慢慢成形的地方。</p><button onClick={() => newNote()}>记录此刻的想法<ArrowUpRight size={17} /></button></div><OrbitalArt /><div className="feature-index">THE PERSONAL KNOWLEDGE GARDEN <span>01 — ∞</span></div></section>}
      <section className="collections-section"><div className="section-heading"><h2>我的集合<span>COLLECTIONS</span></h2><button className="text-button" onClick={() => go('all')}>浏览全部<ArrowRight size={14} /></button></div><div className="collection-grid">{categories.map(c => { const Icon = categoryIcons[c]; return <button className="collection-card" key={c} onClick={() => go(c)}><div className={`collection-icon ${categoryMeta[c].color}`}><Icon size={19} strokeWidth={1.6} /></div><strong>{categoryMeta[c].label}</strong><span>{notes.filter(n => n.category === c).length} 篇笔记<ArrowUpRight size={13} /></span></button> })}</div></section></>}
      <section className="notes-section"><div className="section-heading"><h2>{view === 'home' ? '最近的思考' : view === 'trash' ? '已删除' : '笔记'}<span>{view === 'home' ? 'RECENT NOTES' : `${filtered.length} NOTES`}</span></h2><div className="view-actions"><label className="sort-label"><select aria-label="笔记排序" value={sort} onChange={e => setSort(e.target.value as 'updated' | 'created')}><option value="updated">最近更新</option><option value="created">创建时间</option></select><ChevronDown size={12} /></label><div className="layout-toggle"><button aria-label="卡片视图" aria-pressed={!listLayout} className={!listLayout ? 'selected' : ''} onClick={() => setListLayout(false)}><Grid2X2 size={15} /></button><button aria-label="列表视图" aria-pressed={listLayout} className={listLayout ? 'selected' : ''} onClick={() => setListLayout(true)}><List size={16} /></button></div></div></div>
      {view !== 'trash' && !categories.includes(view as Category) && <div className="filter-tabs" role="group" aria-label="按集合筛选"><button className={activeFilter === 'all' ? 'active' : ''} onClick={() => setActiveFilter('all')}>全部<span>{view === 'inbox' ? inbox.length : view === 'favorites' ? favorites.length : notes.length}</span></button>{categories.map(c => <button key={c} className={activeFilter === c ? 'active' : ''} onClick={() => setActiveFilter(c)}>{c}</button>)}</div>}
      {filtered.length ? <div className={`notes-grid ${listLayout ? 'list-layout' : ''}`}>{(view === 'home' ? filtered.slice(0, 6) : filtered).map(note => view === 'trash' ? <TrashCard key={note.id} note={note} onRestore={() => void doRestore(note)} onPurge={() => void doPurge(note)} /> : <NoteCard key={note.id} note={note} onOpen={() => openNote(note)} onFavorite={() => void favorite(note)} compact={listLayout} />)}</div> : <div className="empty-state"><BookOpen size={32} strokeWidth={1} /><h3>{view === 'trash' ? '回收站是空的。' : '这里，还留着一页空白。'}</h3><p>{view === 'favorites' ? '点击笔记上的星标，让值得重读的内容留在这里。' : view === 'trash' ? '删除的笔记会在这里保留，随时可以恢复。' : '记录一个想法，开启这个集合。'}</p>{view !== 'trash' && <button className="secondary-button" onClick={() => newNote()}><Plus size={15} />写下第一篇</button>}</div>}
      {view === 'home' && <button className="all-notes-link" onClick={() => go('all')}>查看全部 {notes.length} 篇笔记<ArrowRight size={14} /></button>}</section>
    </div>
    {view === 'home' && <aside className="thought-column"><section className="quick-capture"><div className="side-section-title"><span><Plus size={17} />随手记</span><kbd>⌃ N</kbd></div><textarea aria-label="随手记下一个想法" placeholder={'此刻，你在想什么？\n\n不用整理，先留下来。'} value={quick} onChange={e => setQuick(e.target.value)} maxLength={5000} /><div className="capture-bottom"><span>小想法，也有大可能</span><button className="capture-send" aria-label="展开并保存随手记" onClick={() => { newNote(quick); setQuick('') }}><ArrowUpRight size={18} /></button></div></section>
      <section className="favorite-section"><div className="side-section-title"><span><Star size={15} />值得再读</span><button className="icon-button" aria-label="查看所有收藏" onClick={() => go('favorites')}><ArrowUpRight size={15} /></button></div>{favorites.slice(0, 3).map((n, i) => <button className="favorite-note" key={n.id} onClick={() => openNote(n)}><span className="favorite-index">0{i + 1}</span><span><strong>{n.title}</strong><small>{n.tags[0] || n.category}</small></span></button>)}{!favorites.length && <p className="muted-text">还没有收藏，去笔记里点一颗星。</p>}</section>
      <section className="inbox-prompt"><div className="inbox-prompt-top"><Inbox size={19} /><span>{String(inbox.length).padStart(2, '0')}</span></div><h3>给想法，找到一个家。</h3><p>{inbox.length ? `${inbox.length} 条未整理的笔记，正等着与你重逢。` : '收件箱已整理好，给下一个想法留了位置。'}</p><button className="text-button" onClick={() => go('inbox')}>打开收件箱<ArrowRight size={14} /></button></section>
      <div className="studio-signature"><Mark small /><span>LESS NOISE.<br />MORE MEANING.</span></div>
    </aside>}</div>}
    <footer className="page-footer"><span><span className="status-dot" />{isDesktop ? 'Markdown 文件真相源 · SQLite 全文索引' : '浏览器演示 · 数据仅保存在当前浏览器'}</span><span>{isDesktop ? '自动保存 · 回收站 · 中文检索已接入' : '内置示例内容 · 桌面版接入文件库与索引'}</span></footer></main></div>
    {searchOpen && <Dialog label="搜索知识空间" onClose={() => { setSearchOpen(false); setQuery('') }} className="search-dialog"><div className="search-input-row"><Search size={21} /><input aria-label="搜索关键词" placeholder="寻找一个想法、一段文字…" value={query} autoFocus onChange={e => setQuery(e.target.value)} /><button className="escape-key" onClick={() => { setSearchOpen(false); setQuery('') }}>ESC</button></div><div className="search-meta"><span>{query.trim() ? `找到 ${searchResults.length} 条匹配笔记` : '从最近的思考开始'}</span><small>{isDesktop ? 'SQLite FTS5 · 中文二元组分词' : '标题、正文与标签 · 关键词匹配'}</small></div><div className="search-results">{searchResults.length ? searchResults.map(n => { const Icon = categoryIcons[n.category]; return <button key={n.id} onClick={() => openNote(n)}><span className={`search-result-icon ${categoryMeta[n.category].color}`}><Icon size={18} /></span><span><strong>{n.title}</strong><small>{excerpt(n.body).slice(0, 72)}</small></span><ArrowUpRight size={15} /></button> }) : <div className="empty-state"><Search size={28} /><h3>还没有找到这条线索</h3><p>试试更短的关键词，或换一个标签。</p></div>}</div><div className="search-footer"><span><Command size={12} /> 知识，就在触手可及的地方</span><span>Tab 选择 · Enter 打开</span></div></Dialog>}
    {selected && <NoteDialog key={selected.note.id} note={selected.note} isNew={selected.isNew} onClose={() => setSelected(null)} onPersist={onPersist} onTrash={doTrash} />}
    {askOpen && <AskDialog notes={notes} onClose={() => setAskOpen(false)} onOpenNote={n => { setAskOpen(false); openNote(n) }} />}
    {settingsOpen && <Dialog label="偏好与数据" onClose={() => setSettingsOpen(false)} className="settings-dialog"><header className="editor-toolbar"><span>偏好与数据</span><button className="icon-button" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}><X size={18} /></button></header><div className="settings-content"><div className="settings-icon"><ShieldCheck size={28} /></div><h2>你的想法，留在你这里。</h2><p>没有遥测，也没有将笔记发送给云端模型。</p><div className="settings-row"><span>运行环境</span><strong>{isDesktop ? 'Electron 本地文件库' : '浏览器预览'}</strong></div><div className="settings-row"><span>存储方式</span><strong>{isDesktop ? 'Markdown + JSON 真相源 · SQLite 索引' : '当前浏览器 · localStorage'}</strong></div><div className="settings-row"><span>当前笔记</span><strong>{notes.length} 篇 · 回收站 {trashed.length}</strong></div><p className="settings-warning">{isDesktop ? '笔记以 Markdown 文件保存，索引可重建；删除先进回收站。备份恢复与外部冲突保留已在数据层验证。' : '清除浏览器数据会移除这里的笔记。请导出重要内容；这不是正式文件备份。'}</p>{isDesktop && <button className="secondary-button export-button" onClick={() => void rebuild()}><RefreshCw size={15} />重建全文索引</button>}<button className="primary-button export-button" disabled={!ready} onClick={exportNotes}><ArrowDownToLine size={16} />导出当前笔记 JSON</button></div></Dialog>}
    {toast && <div className="toast" role="status"><CheckCheck size={17} />{toast}</div>}
  </div>
}
