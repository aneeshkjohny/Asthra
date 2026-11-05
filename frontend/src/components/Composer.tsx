import { useEffect, useRef, useState } from 'react'
import type { Attachment, Skill } from '../api'
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
  onError?: (msg: string) => void
  skills?: Skill[]
  pinned?: string[]
  onToggleSkill?: (name: string, on: boolean) => void
  onAddSkill?: () => void
}

const ACCEPT =
  'image/*,.txt,.md,.markdown,.log,.text,.rst,.py,.js,.jsx,.ts,.tsx,.mjs,.cjs,.json,.html,.htm,.css,.scss,' +
  '.sh,.bash,.yml,.yaml,.toml,.ini,.cfg,.conf,.env,.c,.h,.cpp,.hpp,.cc,.java,.go,.rs,.rb,.php,.swift,' +
  '.kt,.sql,.xml,.vue,.svelte,.r,.lua,.dart,.cs,.csv,.tsv,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods'

export function Composer(p: Props) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [skillIdx, setSkillIdx] = useState(0)
  const [skillPanel, setSkillPanel] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const skills = p.skills ?? []
  const pinned = p.pinned ?? []

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
  }, [text])

  // Close the skills panel on outside click
  useEffect(() => {
    if (!skillPanel) return
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setSkillPanel(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [skillPanel])

  // Slash-command picker: only while the very first token is a bare `/name`
  const slash = text.match(/^\/([A-Za-z0-9_-]*)$/)
  const matches = slash
    ? skills.filter(s => s.name.toLowerCase().startsWith(slash[1].toLowerCase()))
    : []
  const showPicker = matches.length > 0 && !p.streaming

  useEffect(() => setSkillIdx(0), [slash ? slash[1] : ''])

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
      } catch (e: any) {
        setFiles(fs => fs.filter(x => !(x.name === f.name && x.uploading)))
        p.onError?.(e?.message || `Upload failed: ${f.name}`)
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function pickSkill(name: string) {
    // Replace the in-progress /token with the chosen skill + a space
    const before = text.slice(0, (slash ? slash[0].length : 0))
    const after = text.slice(before.length)
    setText(`/${name} ` + after.replace(/^ /, ''))
    setSkillIdx(0)
    if (taRef.current) {
      taRef.current.focus()
      requestAnimationFrame(() => {
        const el = taRef.current
        if (el) el.setSelectionRange(el.value.length, el.value.length)
      })
    }
  }

  function submit() {
    if (!canSend) return
    p.onSend(text, files)
    setText('')
    setFiles([])
    setSkillPanel(false)
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

      {pinned.length > 0 && (
        <div className="composer-pending">
          {pinned.map(name => (
            <div className="pending-chip skill-chip" key={name} title={`Skill pinned to this chat`}>
              <span className="chip-icon">⚡</span>
              <span className="chip-meta">
                <span className="chip-name">/{name}</span>
              </span>
              <span className="rm" onClick={() => p.onToggleSkill?.(name, false)}>✕</span>
            </div>
          ))}
        </div>
      )}

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

      {showPicker && (
        <div className="skill-picker">
          <div className="skill-picker-head">Skills — type to filter, Enter to insert</div>
          {matches.map((s, i) => (
            <button
              key={s.name}
              className={`skill-picker-row ${i === skillIdx ? 'hi' : ''}`}
              onMouseDown={e => { e.preventDefault(); pickSkill(s.name) }}
              onMouseEnter={() => setSkillIdx(i)}
            >
              <span className="sp-name">/{s.name}</span>
              <span className="sp-desc">{s.description}</span>
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        rows={1}
        value={text}
        placeholder="Message Asthra…  (attach files, or type / for skills)"
        disabled={p.disabled}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (showPicker) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSkillIdx(i => (i + 1) % matches.length); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSkillIdx(i => (i - 1 + matches.length) % matches.length); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSkill(matches[skillIdx].name); return }
            if (e.key === 'Escape') { e.preventDefault(); setText(''); return }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />

      {skillPanel && (
        <div className="skill-panel" ref={panelRef}>
          <div className="skill-panel-head">Skills for this chat <span className="skill-panel-sub">pinned skills apply to every reply here</span></div>
          {skills.length === 0 && (
            <div className="skill-empty">No skills found. Add a .md file (or a folder with instruction.md) under <b>skills/</b>.</div>
          )}
          {skills.map(s => {
            const on = pinned.includes(s.name)
            return (
              <button
                key={s.name}
                className={`skill-row ${on ? 'on' : ''}`}
                onClick={() => p.onToggleSkill?.(s.name, !on)}
              >
                <span className="skill-check">{on ? '✓' : ''}</span>
                <span className="skill-name">/{s.name}</span>
                <span className="skill-desc">{s.description}</span>
              </button>
            )
          })}
          <div className="skill-panel-foot">
            <button
              className="skill-add"
              onClick={() => { setSkillPanel(false); p.onAddSkill?.() }}
            >
              ＋ New skill…
            </button>
          </div>
        </div>
      )}

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
          className={`tool-btn ${skillPanel ? 'active' : ''} ${pinned.length ? 'has' : ''}`}
          onClick={() => setSkillPanel(v => !v)}
          title="Skills for this chat"
        >
          ⚡
          <span className="tip">Skills{pinned.length ? ` (${pinned.length})` : ''}</span>
        </button>
        <button
          className={`tool-btn ${p.think ? 'active' : ''}`}
          onClick={() => p.onThink(!p.think)}
          title="Toggle thinking"
        >
          ✦
          <span className="tip">{p.think ? 'Thinking: on' : 'Thinking: off'}</span>
        </button>
        <div className="composer-hint">Enter to send · Shift+Enter for a new line · / for skills</div>
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
