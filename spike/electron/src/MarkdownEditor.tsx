import { useEffect, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'

export default function MarkdownEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({ doc: value, parent: host.current, extensions: [basicSetup, markdown(), EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': '笔记正文' }), EditorView.updateListener.of(update => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()) })] })
    return () => view.destroy()
  }, [])
  return <div ref={host} className="markdown-editor" />
}
