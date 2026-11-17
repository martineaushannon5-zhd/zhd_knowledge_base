import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCheck, ChevronDown, ChevronRight, Command, FileText, Folder, Grid2X2, Inbox, LayoutDashboard, Leaf, List, LoaderCircle, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sparkles, Star, X, type LucideIcon } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { categories, categoryMeta, excerpt, loadNotes, saveNotes, seedNotes, shortDate, type Category, type Note } from './data'
import './styles.css'

type View = 'home' | 'all' | 'inbox' | 'favorites' | Category
const md = new MarkdownIt({ html: false, linkify: false, breaks: true })
const categoryIcons: Record<Category, LucideIcon> = { 灵感: Sparkles, 技术: Command, 项目: Folder, 阅读: BookOpen }
const viewNames: Record<View, string> = { home: '工作台', all: '全部笔记', inbox: '收件箱', favorites: '我的收藏', 灵感: '灵感与想法', 技术: '技术与方法', 项目: '项目与实践', 阅读: '阅读与摘录' }

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

function NoteDialog({ note, isNew, onClose, onSave }: { note: Note; isNew: boolean; onClose: () => void; onSave: (note: Note) => Promise<void> }) {
  const [draft, setDraft] = useState(note)
  const [editing, setEditing] = useState(isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tags, setTags] = useState(note.tags.join('，'))
  const dirty = JSON.stringify(note) !== JSON.stringify(draft) || tags !== note.tags.join('，') || (isNew && !!(draft.title.trim() || draft.body.trim()))
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const close = () => { if (!dirty || window.confirm('还有未保存的修改，确定关闭吗？')) onClose() }
  const save = async () => {
    if (saving) return
    if (!draft.title.trim() && !draft.body.trim()) { setError('先写下标题或一点内容，再保存。'); return }
    setSaving(true); setError('')
    try {
      await onSave({ ...draft, title: draft.title.trim() || draft.body.replace(/^#+\s*/, '').split('\n')[0].slice(0, 40) || '未命名笔记', tags: [...new Set(tags.split(/[,，]/).map(t => t.trim()).filter(Boolean))].slice(0, 8), updatedAt: new Date().toISOString() })
      onClose()
    } catch { setError('保存失败，内容仍在这里。请检查存储空间或权限后重试。') }
    finally { setSaving(false) }
  }
  const html = DOMPurify.sanitize(md.render(draft.body), { FORBID_TAGS: ['img', 'iframe', 'style'], FORBID_ATTR: ['style'] })
  return <Dialog label={isNew ? '新建笔记' : note.title} onClose={close} className="note-dialog"><div className="note-dialog-shell" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save() } }}>
    <header className="editor-toolbar"><div className="editor-breadcrumb"><FileText size={16} /><span>{isNew ? '捕获一个新想法' : '知识空间'}</span><ChevronRight size={13} /><span>{draft.category}</span></div><button className="icon-button" aria-label="关闭笔记" onClick={close}><X size={20} /></button></header>
    <div className="editor-heading"><div className={`eyebrow ${categoryMeta[draft.category].color}`}>{isNew ? 'A NEW THOUGHT' : 'YOUR KNOWLEDGE, CONNECTED'}</div>{editing ? <input className="title-input" aria-label="笔记标题" placeholder="给这个想法一个名字…" value={draft.title} maxLength={160} autoFocus={isNew} onChange={e => setDraft({ ...draft, title: e.target.value })} /> : <h1>{draft.title}</h1>}<div className="editor-meta"><span>{shortDate(draft.updatedAt)} 更新</span><span className="meta-dot" /><span>{draft.body.length.toLocaleString()} 字符</span><span className="meta-dot" /><span>{dirty ? '有未保存的修改' : isNew ? '尚未保存' : '已保存的版本'}</span></div></div>
    <div className="editor-tabs"><div className="segmented"><button className={!editing ? 'selected' : ''} onClick={() => setEditing(false)}>阅读</button><button className={editing ? 'selected' : ''} onClick={() => setEditing(true)}>编辑</button></div><span className="quiet-label">Markdown · {editing ? 'Ctrl + Enter 保存' : '让内容，成为主角'}</span></div>
    <div className="editor-body">{editing ? <Suspense fallback={<div className="loading-state"><LoaderCircle className="spin" size={20} />正在打开编辑器…</div>}><MarkdownEditor value={draft.body} onChange={body => setDraft(d => ({ ...d, body }))} /></Suspense> : <article className="prose" onClick={e => { if ((e.target as HTMLElement).closest('a')) { e.preventDefault(); setError('预览中的外部链接不会自动打开，请在编辑模式复制链接。') } }} dangerouslySetInnerHTML={{ __html: html || '<p>还没有正文。点击「编辑」，从一个念头开始。</p>' }} />}</div>
    <footer className="editor-footer"><div className="editor-properties"><label>集合<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as Category })}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label className="tags-field">标签<input aria-label="标签，用逗号分隔" value={tags} placeholder="用逗号分隔" onChange={e => setTags(e.target.value)} /></label><button className={`icon-button ${draft.favorite ? 'starred' : ''}`} aria-label={draft.favorite ? '取消收藏笔记' : '收藏笔记'} onClick={() => setDraft({ ...draft, favorite: !draft.favorite })}><Star size={18} fill={draft.favorite ? 'currentColor' : 'none'} /></button>{draft.inbox && <label className="inbox-check"><input type="checkbox" checked={!draft.inbox} onChange={() => setDraft({ ...draft, inbox: false })} />移出收件箱</label>}</div><div className="editor-save">{error && <span className="form-error" role="alert">{error}</span>}<button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{saving ? '正在保存' : '保存笔记'}</button></div></footer>
  </div></Dialog>
}

function NoteCard({ note, onOpen, onFavorite, compact = false }: { note: Note; onOpen: () => void; onFavorite: () => void; compact?: boolean }) {
  const Icon = categoryIcons[note.category]
  return <article className={`note-card ${compact ? 'compact' : ''}`}><div className="card-top"><span className={`category-label ${categoryMeta[note.category].color}`}><Icon size={14} />{note.category}</span><button className={`icon-button favorite-button ${note.favorite ? 'starred' : ''}`} aria-label={`${note.favorite ? '取消收藏' : '收藏'}：${note.title}`} onClick={onFavorite}><Star size={15} fill={note.favorite ? 'currentColor' : 'none'} /></button></div><button className="note-open" onClick={onOpen}><h3>{note.title}</h3><p>{excerpt(note.body)}</p></button><div className="card-bottom"><div className="tag-list">{note.tags.slice(0, 2).map(t => <span key={t}>{t}</span>)}</div><time dateTime={note.updatedAt}>{shortDate(note.updatedAt)}</time></div></article>
}

export default function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState<View>('home')
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all')
  const [listLayout, setListLayout] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ note: Note; isNew: boolean } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [quick, setQuick] = useState('')
  const [sort, setSort] = useState<'updated' | 'created'>('updated')
  const savingRef = useRef(false)
  const isDesktop = !!window.desktopNotes

  useEffect(() => { let active = true; loadNotes().then(data => { if (active) { setNotes(data ?? seedNotes); setReady(true) } }).catch(() => { if (active) setLoadError('无法读取本地笔记。原数据已保留，请检查存储权限或数据格式后刷新。') }); return () => { active = false } }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3300); return () => clearTimeout(timer) }, [toast])
  const newNote = useCallback((body = '') => {
    if (!ready) return
    const date = new Date().toISOString()
    setSelected({ note: { id: crypto.randomUUID(), title: '', body, category: categories.includes(view as Category) ? view as Category : '灵感', tags: [], favorite: false, inbox: true, createdAt: date, updatedAt: date }, isNew: true })
  }, [ready, view])
  useEffect(() => { const key = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !selected && !settingsOpen) { e.preventDefault(); setSearchOpen(o => !o) }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !selected && !settingsOpen && !searchOpen) { e.preventDefault(); newNote() }
  }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key) }, [newNote, selected, settingsOpen, searchOpen])

  const persist = async (next: Note[]) => {
    if (savingRef.current) throw new Error('正在保存另一项修改，请稍后重试')
    savingRef.current = true
    try { await saveNotes(next); setNotes(next) } finally { savingRef.current = false }
  }
  const save = async (note: Note) => { await persist(notes.some(n => n.id === note.id) ? notes.map(n => n.id === note.id ? note : n) : [note, ...notes]); setToast(isDesktop ? '已保存到本地原型目录' : '已保存到当前浏览器') }
  const favorite = async (note: Note) => { try { await persist(notes.map(n => n.id === note.id ? { ...n, favorite: !n.favorite } : n)); setToast(note.favorite ? '已取消收藏' : '已加入收藏') } catch { setToast('保存失败，请稍后重试；原数据未改动') } }
  const go = (target: View) => { setView(target); setActiveFilter('all'); setSidebarOpen(false) }
  const openNote = (note: Note) => { setSearchOpen(false); setSelected({ note, isNew: false }) }
  const favorites = notes.filter(n => n.favorite)
  const inbox = notes.filter(n => n.inbox)
  const filtered = notes.filter(n => (view === 'inbox' ? n.inbox : view === 'favorites' ? n.favorite : categories.includes(view as Category) ? n.category === view : true) && (activeFilter === 'all' || n.category === activeFilter)).sort((a, b) => (sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : b.createdAt.localeCompare(a.createdAt)))
  const searched = notes.filter(n => `${n.title} ${n.body} ${n.tags.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 12)
  const date = new Date()
  const dateString = date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
  const navItems: { id: View; icon: LucideIcon; count?: number }[] = [{ id: 'home', icon: LayoutDashboard }, { id: 'inbox', icon: Inbox, count: inbox.length }, { id: 'all', icon: FileText, count: notes.length }, { id: 'favorites', icon: Star, count: favorites.length }]
  const exportNotes = async () => {
    try {
      if (window.desktopNotes) {
        if (await window.desktopNotes.export(notes)) setToast('已导出当前笔记 JSON')
        return
      }
      const blob = new Blob([JSON.stringify({ format: 'zhd-prototype-v1', exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `zhd-notes-${date.toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('已发起笔记 JSON 下载')
    } catch { setToast('导出失败，笔记未受影响，请稍后重试') }
  }

  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}><button className="brand" onClick={() => go('home')} aria-label="ZHD 知识空间首页"><Mark /><span><strong>ZHD<span className="brand-period">.</span></strong><small>KNOWLEDGE STUDIO</small></span></button><div className="workspace-label"><span className="workspace-avatar">Z</span><div>个人知识空间<small>Personal workspace</small></div><ShieldCheck size={15} /></div><button className="sidebar-search" onClick={() => setSearchOpen(true)}><Search size={16} /><span>搜索你的知识</span><kbd>⌃ K</kbd></button>
      <nav aria-label="主导航"><div className="nav-heading">工作空间</div>{navItems.map(({ id, icon: Icon, count }) => <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => go(id)}><Icon size={18} strokeWidth={1.6} /><span>{viewNames[id]}</span>{count !== undefined && <small>{count}</small>}{view === id && <span className="active-dot" />}</button>)}<div className="nav-heading collections-heading">我的集合<span>04</span></div>{categories.map(c => <button key={c} className={`nav-item collection-nav ${view === c ? 'active' : ''}`} onClick={() => go(c)}><span className={`collection-dot ${categoryMeta[c].color}`} /><span>{categoryMeta[c].label}</span><small>{notes.filter(n => n.category === c).length}</small></button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Leaf size={19} /><p>知识会生长。<br /><span>从记录一个想法开始。</span></p><span className="tiny-cross">+</span></div><button className="nav-item settings-nav" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /><span>偏好与数据</span><ChevronRight size={14} /></button><div className="user-profile"><span className="profile-avatar">泓</span><div><strong>郑泓达</strong><small>为长期思考而构建</small></div><button className="icon-button" aria-label="工作空间信息" onClick={() => setSettingsOpen(true)}><MoreHorizontal size={19} /></button></div></div>
    </aside>
    <div className="app-body"><header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span className="breadcrumb-root">知识空间</span><ChevronRight size={13} /><span>{viewNames[view]}</span></div><div className="topbar-actions"><span className="storage-indicator"><span />{isDesktop ? '本地原型' : '浏览器预览'}</span><span className="topbar-divider" /><button className="icon-button" aria-label="搜索笔记" onClick={() => setSearchOpen(true)}><Search size={19} /></button><button className="primary-button new-top" onClick={() => newNote()} disabled={!ready}><Plus size={17} />新建笔记</button></div></header>
    <main className="main-content"><div className="page-heading"><div><div className="eyebrow">{view === 'home' ? 'A LITTLE SPACE FOR BIG IDEAS' : 'YOUR PERSONAL COLLECTION'}</div><h1>{view === 'home' ? '让想法，慢慢生长' : viewNames[view]}{view === 'home' && <span className="heading-dot" aria-hidden="true">。</span>}</h1><p>{view === 'home' ? '记录当下的灵感，连接未来的自己。' : view === 'inbox' ? '先记下来。好的想法，不必一开始就井井有条。' : view === 'favorites' ? '那些值得反复阅读、值得再次相遇的想法。' : '把零散的线索，整理成属于自己的理解。'}</p></div><div className="date-label"><span>{dateString}</span><small>保持好奇，持续积累</small></div></div>
    {loadError ? <section className="error-state" role="alert"><ShieldCheck size={30} /><h2>先保护好你的数据</h2><p>{loadError}</p><button className="secondary-button" onClick={() => location.reload()}>重新读取</button></section> : !ready ? <div className="loading-state"><LoaderCircle className="spin" />正在打开你的知识空间…</div> : <div className={`workspace-grid ${view !== 'home' ? 'library-view' : ''}`}><div className="primary-column">
      {view === 'home' && <><section className="feature-card"><div className="feature-copy"><span className="feature-kicker"><span /> THINK. CONNECT. GROW.</span><h2>每一个小想法，<br />都值得被认真收藏。</h2><p>这里不只是信息的存放地，<br />也是你的思考，慢慢成形的地方。</p><button onClick={() => newNote()}>记录此刻的想法<ArrowUpRight size={17} /></button></div><OrbitalArt /><div className="feature-index">THE PERSONAL KNOWLEDGE GARDEN <span>01 — ∞</span></div></section>
      <section className="collections-section"><div className="section-heading"><h2>我的集合<span>COLLECTIONS</span></h2><button className="text-button" onClick={() => go('all')}>浏览全部<ArrowRight size={14} /></button></div><div className="collection-grid">{categories.map(c => { const Icon = categoryIcons[c]; return <button className="collection-card" key={c} onClick={() => go(c)}><div className={`collection-icon ${categoryMeta[c].color}`}><Icon size={19} strokeWidth={1.6} /></div><strong>{categoryMeta[c].label}</strong><span>{notes.filter(n => n.category === c).length} 篇笔记<ArrowUpRight size={13} /></span></button> })}</div></section></>}
      <section className="notes-section"><div className="section-heading"><h2>{view === 'home' ? '最近的思考' : '笔记'}<span>{view === 'home' ? 'RECENT NOTES' : `${filtered.length} NOTES`}</span></h2><div className="view-actions"><label className="sort-label"><select aria-label="笔记排序" value={sort} onChange={e => setSort(e.target.value as 'updated' | 'created')}><option value="updated">最近更新</option><option value="created">创建时间</option></select><ChevronDown size={12} /></label><div className="layout-toggle"><button aria-label="卡片视图" aria-pressed={!listLayout} className={!listLayout ? 'selected' : ''} onClick={() => setListLayout(false)}><Grid2X2 size={15} /></button><button aria-label="列表视图" aria-pressed={listLayout} className={listLayout ? 'selected' : ''} onClick={() => setListLayout(true)}><List size={16} /></button></div></div></div>
      {!categories.includes(view as Category) && <div className="filter-tabs" role="group" aria-label="按集合筛选"><button className={activeFilter === 'all' ? 'active' : ''} onClick={() => setActiveFilter('all')}>全部<span>{view === 'inbox' ? inbox.length : view === 'favorites' ? favorites.length : notes.length}</span></button>{categories.map(c => <button key={c} className={activeFilter === c ? 'active' : ''} onClick={() => setActiveFilter(c)}>{c}</button>)}</div>}
      {filtered.length ? <div className={`notes-grid ${listLayout ? 'list-layout' : ''}`}>{(view === 'home' ? filtered.slice(0, 6) : filtered).map(note => <NoteCard key={note.id} note={note} onOpen={() => openNote(note)} onFavorite={() => void favorite(note)} compact={listLayout} />)}</div> : <div className="empty-state"><BookOpen size={32} strokeWidth={1} /><h3>这里，还留着一页空白。</h3><p>{view === 'favorites' ? '点击笔记上的星标，让值得重读的内容留在这里。' : '记录一个想法，开启这个集合。'}</p><button className="secondary-button" onClick={() => newNote()}><Plus size={15} />写下第一篇</button></div>}
      {view === 'home' && <button className="all-notes-link" onClick={() => go('all')}>查看全部 {notes.length} 篇笔记<ArrowRight size={14} /></button>}</section>
    </div>
    {view === 'home' && <aside className="thought-column"><section className="quick-capture"><div className="side-section-title"><span><Plus size={17} />随手记</span><kbd>⌃ N</kbd></div><textarea aria-label="随手记下一个想法" placeholder={'此刻，你在想什么？\n\n不用整理，先留下来。'} value={quick} onChange={e => setQuick(e.target.value)} maxLength={5000} /><div className="capture-bottom"><span>小想法，也有大可能</span><button className="capture-send" aria-label="展开并保存随手记" onClick={() => { newNote(quick); setQuick('') }}><ArrowUpRight size={18} /></button></div></section>
      <section className="favorite-section"><div className="side-section-title"><span><Star size={15} />值得再读</span><button className="icon-button" aria-label="查看所有收藏" onClick={() => go('favorites')}><ArrowUpRight size={15} /></button></div>{favorites.slice(0, 3).map((n, i) => <button className="favorite-note" key={n.id} onClick={() => openNote(n)}><span className="favorite-index">0{i + 1}</span><span><strong>{n.title}</strong><small>{n.tags[0] || n.category}</small></span></button>)}{!favorites.length && <p className="muted-text">还没有收藏，去笔记里点一颗星。</p>}</section>
      <section className="inbox-prompt"><div className="inbox-prompt-top"><Inbox size={19} /><span>{String(inbox.length).padStart(2, '0')}</span></div><h3>给想法，找到一个家。</h3><p>{inbox.length ? `${inbox.length} 条未整理的笔记，正等着与你重逢。` : '收件箱已整理好，给下一个想法留了位置。'}</p><button className="text-button" onClick={() => go('inbox')}>打开收件箱<ArrowRight size={14} /></button></section>
      <div className="studio-signature"><Mark small /><span>LESS NOISE.<br />MORE MEANING.</span></div>
    </aside>}</div>}
    <footer className="page-footer"><span><span className="status-dot" />{isDesktop ? '原型数据保存在应用本地目录' : '浏览器演示 · 数据仅保存在当前浏览器'}</span><span>内置示例内容 · AI 与全文索引尚未接入</span></footer></main></div>
    {searchOpen && <Dialog label="搜索知识空间" onClose={() => { setSearchOpen(false); setQuery('') }} className="search-dialog"><div className="search-input-row"><Search size={21} /><input aria-label="搜索关键词" placeholder="寻找一个想法、一段文字…" value={query} autoFocus onChange={e => setQuery(e.target.value)} /><button className="escape-key" onClick={() => { setSearchOpen(false); setQuery('') }}>ESC</button></div><div className="search-meta"><span>{query.trim() ? `找到 ${searched.length} 条匹配笔记` : '从最近的思考开始'}</span><small>标题、正文与标签 · 原型关键词匹配</small></div><div className="search-results">{searched.length ? searched.map(n => { const Icon = categoryIcons[n.category]; return <button key={n.id} onClick={() => openNote(n)}><span className={`search-result-icon ${categoryMeta[n.category].color}`}><Icon size={18} /></span><span><strong>{n.title}</strong><small>{excerpt(n.body).slice(0, 72)}</small></span><ArrowUpRight size={15} /></button> }) : <div className="empty-state"><Search size={28} /><h3>还没有找到这条线索</h3><p>试试更短的关键词，或换一个标签。</p></div>}</div><div className="search-footer"><span><Command size={12} /> 知识，就在触手可及的地方</span><span>Tab 选择 · Enter 打开</span></div></Dialog>}
    {selected && <NoteDialog key={selected.note.id} note={selected.note} isNew={selected.isNew} onClose={() => setSelected(null)} onSave={save} />}
    {settingsOpen && <Dialog label="偏好与数据" onClose={() => setSettingsOpen(false)} className="settings-dialog"><header className="editor-toolbar"><span>偏好与数据</span><button className="icon-button" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}><X size={18} /></button></header><div className="settings-content"><div className="settings-icon"><ShieldCheck size={28} /></div><h2>你的想法，留在你这里。</h2><p>这是 ZHD 知识空间的交互原型。没有遥测，也没有将笔记发送给云端模型。</p><div className="settings-row"><span>运行环境</span><strong>{isDesktop ? 'Electron 本地原型' : '浏览器预览'}</strong></div><div className="settings-row"><span>存储方式</span><strong>{isDesktop ? '应用数据目录 · JSON' : '当前浏览器 · localStorage'}</strong></div><div className="settings-row"><span>当前笔记</span><strong>{notes.length} 篇</strong></div><p className="settings-warning">{isDesktop ? '正式 Markdown 文件真相源、备份恢复与全文索引仍待后续实现。' : '清除浏览器数据会移除这里的笔记。请导出重要内容；这不是正式文件备份。'}</p><button className="primary-button export-button" disabled={!ready} onClick={exportNotes}><ArrowDownToLine size={16} />导出当前笔记 JSON</button></div></Dialog>}
    {toast && <div className="toast" role="status"><CheckCheck size={17} />{toast}</div>}
  </div>
}
