import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import LoginPage from './LoginPage'
import './styles.css'

const Workspace = lazy(() => import('./App'))
const currentRoute = () => window.location.hash === '#/workspace' ? 'workspace' : 'login'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="loading-state" role="alert" style={{ minHeight: '100vh', gap: 14 }}>
      <h1 style={{ fontFamily: 'var(--font-editorial)', fontSize: 24, fontWeight: 500 }}>界面遇到了一个问题</h1>
      <p style={{ maxWidth: 420, fontSize: 13, color: 'var(--muted)' }}>你的笔记保存在本地文件中，不会因此丢失。可以重试打开；若反复出现，请查看控制台或反馈该错误。</p>
      <code style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(this.state.error.message || this.state.error)}</code>
      <button className="primary-button" onClick={() => { this.setState({ error: null }); window.location.reload() }}>重新打开</button>
    </main>
  }
}

export default function Root() {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => {
    const update = () => { setRoute(currentRoute()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => { document.title = route === 'login' ? 'ZHD Knowledge Studio · 登录' : 'ZHD Knowledge Studio · 工作台' }, [route])
  // Warm the workspace chunk while the user is on the login page so the first
  // login->workspace jump doesn't pay cold parse cost.
  useEffect(() => { const t = setTimeout(() => { import('./App').catch(() => {}) }, 500); return () => clearTimeout(t) }, [])

  return <ErrorBoundary>
    {route === 'login'
      ? <LoginPage onEnter={() => { window.location.hash = '/workspace' }} />
      : <Suspense fallback={<main className="loading-state" role="status">正在打开知识空间…</main>}><Workspace /></Suspense>}
  </ErrorBoundary>
}
