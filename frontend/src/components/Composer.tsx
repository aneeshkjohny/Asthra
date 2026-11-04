import { useEffect, useRef, useState } from 'react'
import type { Attachment } from '../api'
import { KIND_ICON, fmtBytes } from '../util'

export interface PendingFile extends Attachment {
  uploading: boolean
}

interface Props {
  disabled: boolean
  streaming: boolean
  think: boolean
  onThink: (v: boolean) => void
  onSend: (text: string, files: PendingFile[]) => void
  onStop: () => void
  onUpload: (file: File) => Promise<PendingFile>
}

const ACCEPT =
  'image/*,.txt,.md,.markdown,.log,.text,.rst,.py,.js,.jsx,.ts,.tsx,.mjs,.cjs,.json,.html,.htm,.css,.scss,' +
  '.sh,.bash,.yml,.yaml,.toml,.ini,.cfg,.conf,.env,.c,.h,.cpp,.hpp,.cc,.java,.go,.rs,.rb,.php,.swift,' +
  '.kt,.sql,.xml,.vue,.svelte,.r,.lua,.dart,.cs,.csv,.tsv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods'

export function Composer(p: Props) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [dragging, setDragging] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
  }, [text])

  const uploading = files.some(f => f.uploading)
  const canSend = !p.streaming && !uploading && (text.trim().length > 0 || files.length > 0)

  async function addFiles(list: FileList | File[] | null) {
    if (!list) return
    for (const f of Array.from(list)) {
      const placeholder: PendingFile = { name: f.name, kind: 'file', size: f.size, uploading: true }
      setFiles(fs => [...fs, placeholder])
      try {
        const up = await p.onUpload(f)
        setFiles(fs => fs.map(x => (x.name === f.name && x.uploading ? { ...x, ...up, uploading: false } : x)))
      } catch {
        setFiles(fs => fs.filter(x => !(x.name === f.name && x.uploading)))
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function submit() {
    if (!canSend) return
    p.onSend(text, files)
    setText('')
    setFiles([])
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  return (
    <div
      className={`composer ${dragging ? 'dragging' : ''}`}
      onDragOver={e => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        addFiles(e.dataTransfer.files)
      }}
    >
      {dragging && <div className="drop-hint">Drop files to attach</div>}

      {files.length > 0 && (
        <div className="composer-pending">
          {files.map((f, i) => (
            <div className="pending-chip" key={i} title={f.name}>
              {f.data_url ? (
                <img src={f.data_url} alt="" />
              ) : (
                <span className="chip-icon">{f.uploading ? <span className="spinner" /> : KIND_ICON[f.kind] || '📎'}</span>
              )}
              <span className="chip-meta">
                <span className="chip-name">{f.uploading ? 'Uploading…' : f.name}</span>
                {!f.uploading && f.size ? <span className="chip-size">{fmtBytes(f.size)}</span> : null}
              </span>
              <span
                className="rm"
                onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        rows={1}
        value={text}
        placeholder="Message Asthra…  (attach images, PDFs, docs — or drag & drop)"
        disabled={p.disabled}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />

      <div className="composer-row">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={e => addFiles(e.target.files)}
        />
        <button className="tool-btn" onClick={() => fileRef.current?.click()} title="Attach files">
          📎
          <span className="tip">Attach files</span>
        </button>
        <button
          className={`tool-btn ${p.think ? 'active' : ''}`}
          onClick={() => p.onThink(!p.think)}
          title="Toggle thinking"
        >
          ✦
          <span className="tip">{p.think ? 'Thinking: on' : 'Thinking: off'}</span>
        </button>
        <div className="composer-hint">Enter to send · Shift+Enter for a new line</div>
        {p.streaming ? (
          <button className="stop-btn" onClick={p.onStop} title="Stop generating">
            <span className="sq" />
          </button>
        ) : (
          <button className="send-btn" onClick={submit} disabled={!canSend} title="Send">
            ↑
          </button>
        )}
      </div>
    </div>
  )
}
