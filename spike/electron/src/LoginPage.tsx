import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, ArrowUpRight, BookOpen, Check, Command, Eye, EyeOff, Fingerprint, Folder, LockKeyhole, LogIn, Mail, MousePointer2, MoveUpRight, Pause, Play, ShieldCheck, Sparkles, X, type LucideIcon } from 'lucide-react'
import ParticleHelix, { type HelixHandle, type HelixPoint } from './ParticleHelix'
import { categoryMeta, excerpt, seedNotes, shortDate, type Category, type Note } from './data'
import './login.css'

const categoryIcons: Record<Category, LucideIcon> = { 灵感: Sparkles, 技术: Command, 项目: Folder, 阅读: BookOpen }
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function StudioMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M9 9h22L9 31h22M9 20h22" stroke="currentColor" strokeWidth="2" /><path d="M20 3v34" stroke="currentColor" strokeWidth=".8" opacity=".45" /></svg>
}

function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    return () => { element?.close(); trigger?.focus() }
  }, [])
  return { ref, onCancel: (event: { preventDefault(): void }) => { event.preventDefault(); onClose() } }
}

function LoginInfo({ onClose }: { onClose: () => void }) {
  const { ref, onCancel } = useModal(onClose)
  return <dialog ref={ref} className="login-info" aria-labelledby="login-info-title" onCancel={onCancel} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <button className="login-close" aria-label="关闭登录说明" onClick={onClose}><X size={19} /></button>
    <div className="login-info-icon"><ShieldCheck size={27} /></div>
    <span className="login-overline">A NOTE BEFORE YOU BEGIN</span>
    <h2 id="login-info-title">一个入口，还不是一道锁。</h2>
    <p>当前是登录界面预览，尚未连接账号、注册或密码重置服务。填写的账号和密码不会被发送或保存，请不要输入真实密码。</p>
    <p>你可以在登录卡片中选择「以访客身份体验」使用原型。这个入口不提供身份验证，也不会保护公开站点；正式登录需要服务端认证和访问控制。</p>
    <p>星图里浮现的知识卡片是内置示例内容，不会展示你保存的笔记。</p>
    <button className="login-info-done" onClick={onClose}>明白了<Check size={16} /></button>
  </dialog>
}

function LoginCard({ closing, onClose, onGuest, onHelp }: { closing: boolean; onClose: () => void; onGuest: () => void; onHelp: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [notice, setNotice] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  useEffect(() => { const element = ref.current; element?.showModal(); emailRef.current?.focus(); return () => element?.close() }, [])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setNotice('')
    const next = {
      email: !email.trim() ? '请输入邮箱地址' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? '请输入有效的邮箱地址' : undefined,
      password: !password ? '请输入演示密码（不要使用真实密码）' : undefined,
    }
    setErrors(next)
    if (next.email) { emailRef.current?.focus(); return }
    if (next.password) { passwordRef.current?.focus(); return }
    setPassword('')
    setVisible(false)
    setNotice('登录服务尚未接入，未验证身份。密码已清空，没有发送或保存；你可以先体验工作台。')
  }

  return <dialog ref={ref} className={`login-card ${closing ? 'is-closing' : ''}`} aria-labelledby="login-title" onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <button className="login-card-close" aria-label="关闭登录卡片" onClick={onClose}><X size={18} /></button>
    <div className="login-card-body">
      <div className="login-symbol card-reveal reveal-1"><Fingerprint size={27} strokeWidth={1.25} /><span className="login-symbol-orbit" /></div>
      <div className="login-form-heading card-reveal reveal-2"><span className="login-overline">WELCOME TO YOUR SECOND MIND</span><h2 id="login-title">欢迎，回到自己的世界<span>。</span></h2><p>让散落的灵感，重新与你相遇。</p></div>
      <form className="login-form card-reveal reveal-3" onSubmit={submit} noValidate aria-label="登录知识空间">
        <div className={`login-field ${errors.email ? 'has-error' : ''}`}><label htmlFor="login-email">邮箱地址<span>EMAIL ADDRESS</span></label><div className="login-input-wrap"><Mail size={17} strokeWidth={1.5} /><input ref={emailRef} id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" value={email} maxLength={254} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'login-email-error' : undefined} onChange={e => { setEmail(e.target.value); setErrors(old => ({ ...old, email: undefined })); setNotice('') }} /></div>{errors.email && <span id="login-email-error" className="login-field-error" role="alert">{errors.email}</span>}</div>
        <div className={`login-field ${errors.password ? 'has-error' : ''}`}><label htmlFor="login-password">密码<span>PASSWORD</span></label><div className="login-input-wrap"><LockKeyhole size={17} strokeWidth={1.5} /><input ref={passwordRef} id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="输入演示密码" value={password} maxLength={128} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'login-password-error login-prototype-note' : 'login-prototype-note'} onChange={e => { setPassword(e.target.value); setErrors(old => ({ ...old, password: undefined })); setNotice('') }} /><button type="button" className="login-eye" aria-label={visible ? '隐藏密码' : '显示密码'} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>{errors.password && <span id="login-password-error" className="login-field-error" role="alert">{errors.password}</span>}</div>
        <div className="login-form-options"><span><ShieldCheck size={13} />凭证不会在此预览中保存</span><button type="button" onClick={onHelp}>需要登录帮助？</button></div>
        {notice && <div className="login-service-notice" role="status">{notice}</div>}
        <button className="login-submit" type="submit"><span>登录知识空间</span><ArrowRight size={18} /><span className="login-button-shine" aria-hidden="true" /></button>
      </form>
      <div className="login-alternative card-reveal reveal-4"><div className="login-divider"><span />让好奇心先行<span /></div><button className="login-demo" type="button" onClick={onGuest}><span>以访客身份体验</span><MoveUpRight size={16} /></button><p id="login-prototype-note"><span />当前为界面预览，账号服务待接入。请勿输入真实密码。</p></div>
      <div className="login-principles card-reveal reveal-5"><span>独立思考</span><span>有序连接</span><span>持续生长</span></div>
    </div>
  </dialog>
}

type Spark = { note: Note; x: number; y: number; key: number; node: number }

export default function LoginPage({ onEnter }: { onEnter: () => void }) {
  const [reduced, setReduced] = useState(reducedMotion)
  const [paused, setPaused] = useState(reduced)
  const [entered, setEntered] = useState(() => { try { return reduced || sessionStorage.getItem('zhd.introPlayed') === '1' } catch { return reduced } })
  const [leaving, setLeaving] = useState(false)
  const [info, setInfo] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginClosing, setLoginClosing] = useState(false)
  const [spark, setSpark] = useState<Spark | null>(null)
  const [sparkVisible, setSparkVisible] = useState(false)
  const coarse = useRef(window.matchMedia('(pointer: coarse)').matches).current
  const helixRef = useRef<HelixHandle>(null)
  const linkRef = useRef<HelixPoint | null>(null)
  const noteRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLElement>(null)
  const manifestoRef = useRef<HTMLElement>(null)
  const loginTrigger = useRef<HTMLElement | null>(null)
  const lastNote = useRef('')
  const sparkCount = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => { if (entered) { try { sessionStorage.setItem('zhd.introPlayed', '1') } catch {} } }, [entered])
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const timer = setTimeout(() => setEntered(true), 1700)
    const change = () => { setReduced(query.matches); if (query.matches) { setEntered(true); setPaused(true) } }
    query.addEventListener('change', change)
    return () => { clearTimeout(timer); query.removeEventListener('change', change); timers.current.forEach(clearTimeout) }
  }, [])

  const onCapture = useCallback((point: HelixPoint | null) => {
    if (!point) { linkRef.current = null; setSparkVisible(false); pageRef.current?.classList.remove('spark-overlaps'); return }
    const pool = seedNotes.filter(note => note.id !== lastNote.current)
    const note = pool[Math.floor(Math.random() * pool.length)]
    lastNote.current = note.id
    sparkCount.current += 1
    setSpark({ note, x: point.x, y: point.y, key: sparkCount.current, node: Math.floor(Math.random() * 90) + 10 })
    setSparkVisible(true)
  }, [])

  useLayoutEffect(() => {
    const card = noteRef.current
    if (!spark || !card) return
    const width = card.offsetWidth
    const height = card.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 16
    const gap = vw < 700 ? 40 : 84
    // Keep the encounter card between the header and the footer controls so it never covers them.
    const top0 = vw < 700 ? 84 : 96
    const bottom = vh - (vw < 700 ? 84 : 96)
    let left: number
    let top: number
    let anchorX: number
    let anchorY: number
    if (spark.x + gap + width <= vw - margin || spark.x - gap - width >= margin) {
      const right = spark.x + gap + width <= vw - margin
      left = right ? spark.x + gap : spark.x - gap - width
      top = Math.min(Math.max(spark.y - height * 0.62, top0), bottom - height)
      anchorX = right ? left : left + width
      anchorY = Math.min(Math.max(spark.y, top + 18), top + height - 18)
    } else {
      left = Math.min(Math.max(spark.x - width / 2, margin), vw - margin - width)
      const above = spark.y - gap - height >= top0
      top = above ? spark.y - gap - height : Math.min(spark.y + gap, bottom - height)
      anchorX = Math.min(Math.max(spark.x, left + 18), left + width - 18)
      anchorY = above ? top + height : top
    }
    card.style.left = `${left}px`
    card.style.top = `${top}px`
    const hero = manifestoRef.current?.getBoundingClientRect()
    const overlaps = !!hero && left < hero.right && left + width > hero.left && top < hero.bottom && top + height > hero.top
    pageRef.current?.classList.toggle('spark-overlaps', overlaps)
    linkRef.current = { x: anchorX, y: anchorY }
    helixRef.current?.redraw()
  }, [spark])

  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !loginOpen && !info) helixRef.current?.release() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [loginOpen, info])

  useEffect(() => {
    if (loginOpen || !loginTrigger.current) return
    loginTrigger.current.focus()
    loginTrigger.current = null
  }, [loginOpen])

  const openLogin = () => {
    loginTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    helixRef.current?.release()
    setLoginClosing(false)
    setLoginOpen(true)
  }
  const closeLogin = () => {
    if (loginClosing) return
    const finish = () => { setLoginOpen(false); setLoginClosing(false) }
    if (reducedMotion()) { finish(); return }
    setLoginClosing(true)
    timers.current.push(setTimeout(finish, 180))
  }
  const enter = () => {
    if (leaving) return
    setLeaving(true)
    helixRef.current?.release()
    if (reducedMotion()) onEnter()
    else timers.current.push(setTimeout(onEnter, 120))
  }
  const connectRandom = () => {
    if (sparkVisible) helixRef.current?.release()
    else helixRef.current?.captureRandom()
  }

  const NoteIcon = spark ? categoryIcons[spark.note.category] : Sparkles
  const noteExcerpt = spark ? excerpt(spark.note.body) : ''

  return <main ref={pageRef} className={`login-page ${entered ? 'has-entered' : ''} ${paused ? 'motion-paused' : ''} ${leaving ? 'is-leaving' : ''} ${loginOpen ? 'is-login-open' : ''}`}>
    <div className="login-intro" aria-hidden="true"><div className="login-intro-mark"><StudioMark /><span>ZHD<span>.</span></span></div><div className="login-intro-line" /><span className="login-intro-caption">MAKE ROOM FOR YOUR MIND.</span></div>
    {!entered && <button className="login-skip" onClick={() => setEntered(true)}>跳过开场<ArrowRight size={13} /></button>}
    <div className="login-sky" aria-hidden="true"><div className="login-grain" /></div>
    <ParticleHelix ref={helixRef} paused={paused || loginOpen || leaving} interactive={entered && !loginOpen && !info && !leaving} linkRef={linkRef} onCapture={onCapture} />
    <div className="login-vignette" aria-hidden="true" />
    <div className="login-frame" aria-hidden="true" />

    <header className="login-hero-header" data-helix-ignore>
      <a className="login-brand" href="#/login" aria-label="ZHD 登录首页"><StudioMark /><span>ZHD<span className="login-brand-dot">.</span><small>KNOWLEDGE STUDIO</small></span></a>
      <div className="login-header-actions"><button className="login-header-link" onClick={() => setInfo(true)}>关于这个空间<ArrowUpRight size={13} /></button><button className="login-header-signin" onClick={openLogin}><LogIn size={15} />登录</button></div>
    </header>

    <section ref={manifestoRef} className="login-manifesto" aria-labelledby="login-hero-title">
      <div className="login-art-label"><span /> THOUGHTS BECOME CONSTELLATIONS</div>
      <h1 id="login-hero-title">让每个想法，<br />在这里<em>产生引力。</em></h1>
      <p>收藏灵感的微光，连接思考的轨迹。<br />触碰任意一颗光点，与一段知识不期而遇。</p>
    </section>

    <footer className="login-art-footer">
      <div className="login-art-caption"><span className="login-caption-line" /><span>不是信息的终点。<br /><strong>是思考的起点。</strong></span></div>
      <div className="login-hover-hint" aria-hidden="true"><MousePointer2 size={13} /><span>{coarse ? '轻触光点，遇见一个想法' : '将光标移向光点，遇见一个想法'}</span></div>
      <div className="login-footer-actions" data-helix-ignore>
        <button className="login-random" onClick={connectRandom} aria-pressed={sparkVisible} disabled={!entered || loginOpen}><Sparkles size={13} /><span>{sparkVisible ? '收起这张卡片' : '随机连接一个想法'}</span></button>
        <button className="login-motion-toggle" onClick={() => setPaused(value => !value)} disabled={reduced} title={reduced ? '已遵循系统的减少动态效果设置' : undefined} aria-label={reduced ? '已按系统设置减少动态效果' : paused ? '播放背景动画' : '暂停背景动画'} aria-pressed={paused}>{paused ? <Play size={12} /> : <Pause size={12} />}<span>{reduced ? 'STILL MODE' : paused ? 'PLAY MOTION' : 'PAUSE MOTION'}</span></button>
      </div>
    </footer>

    {spark && <div key={spark.key} ref={noteRef} className={`helix-note ${sparkVisible ? 'is-visible' : ''}`} data-helix-keep role="status" aria-live="polite" aria-label={`光点连接的示例笔记：${spark.note.title}`}>
      <div className="helix-note-top"><span className={`helix-note-category ${categoryMeta[spark.note.category].color}`}><NoteIcon size={13} />{categoryMeta[spark.note.category].label}</span><span className="helix-note-node">NODE · {spark.node}</span></div>
      <h3>{spark.note.title}</h3>
      <p>{noteExcerpt.length > 82 ? `${noteExcerpt.slice(0, 82)}…` : noteExcerpt}</p>
      <div className="helix-note-tags">{spark.note.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>
      <div className="helix-note-footer"><span>示例笔记 · {shortDate(spark.note.updatedAt)}</span><span>RANDOM ENCOUNTER</span></div>
    </div>}

    {loginOpen && <LoginCard closing={loginClosing} onClose={closeLogin} onGuest={enter} onHelp={() => setInfo(true)} />}
    {info && <LoginInfo onClose={() => setInfo(false)} />}
  </main>
}
