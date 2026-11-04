import { useEffect, useRef, useState } from 'react'

interface PendingImage {
  name: string
  url: string
  data_url: string
  b64: string
  uploading: boolean
}

interface Props {
  disabled: boolean
  streaming: boolean
  think: boolean
  onThink: (v: boolean) => void
  onSend: (text: string, images: PendingImage[]) => void
  onStop: () => void
  onUpload: (file: File) => Promise<PendingImage>
}

export function Composer(p: Props) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
  }, [text])

  const canSend = !p.streaming && (text.trim().length > 0 || images.some(i => !i.uploading))

  async function handleFiles(files: FileList | null) {
    if (!files) return
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      setImages(imgs => [...imgs, { name: f.name, url: '', data_url: '', b64: '', uploading: true }])
      try {
        const up = await p.onUpload(f)
        setImages(imgs => imgs.map(i => (i.name === f.name && i.uploading ? { ...i, ...up, uploading: false } : i)))
      } catch {
        setImages(imgs => imgs.filter(i => !(i.name === f.name && i.uploading)))
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function submit() {
    if (!canSend) return
    p.onSend(text, images)
    setText('')
    setImages([])
    if (taRef.current) taRef.current.style.height = 'auto'
  }

  return (
    <div className="composer">
      {images.length > 0 && (
        <div className="composer-pending">
          {images.map((img, i) => (
            <div className="pending-chip" key={i}>
              {img.data_url ? (
                <img src={img.data_url} alt="" />
              ) : (
                <span className="spinner" />
              )}
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {img.uploading ? 'Uploading…' : img.name}
              </span>
              <span className="rm" onClick={() => setImages(imgs => imgs.filter((_, j) => j !== i))}>
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
        placeholder="Message Asthra…"
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
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
        <button className="tool-btn" onClick={() => fileRef.current?.click()} title="Attach image">
          🖼
          <span className="tip">Attach image</span>
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
