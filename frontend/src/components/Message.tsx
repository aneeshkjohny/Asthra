import { memo, useState } from 'react'
import { Markdown } from './Markdown'
import type { Attachment, Message as Msg } from '../api'
import { KIND_ICON, fmtBytes } from '../util'

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`thinking ${open ? 'open' : ''}`}>
      <div className="thinking-head" onClick={() => setOpen(o => !o)}>
        <span className="spark">✦</span>
        <span>Thought process</span>
        <span className="caret">›</span>
      </div>
      {open && <div className="thinking-body">{text}</div>}
    </div>
  )
}

function CopyText({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      className="action"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setOk(true)
        setTimeout(() => setOk(false), 1400)
      }}
    >
      {ok ? '✓ Copied' : '⧉ Copy'}
    </button>
  )
}

function imageSrc(a: Attachment): string {
  if (a.data_url) return a.data_url
  if (a.url) return a.url.startsWith('data:') ? a.url : a.url
  return `/api/uploads/${a.name}`
}

function UserAttachments({ msg }: { msg: Msg }) {
  const atts: Attachment[] =
    msg.attachments && msg.attachments.length
      ? msg.attachments
      : (msg.images || []).map(n => ({ name: n, kind: 'image', url: `/api/uploads/${n}` }))
  if (atts.length === 0) return null

  const images = atts.filter(a => a.kind === 'image')
  const docs = atts.filter(a => a.kind !== 'image')

  return (
    <>
      {images.length > 0 && (
        <div className="user-images">
          {images.map((a, i) => (
            <img key={i} src={imageSrc(a)} alt={a.name} />
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className="user-docs">
          {docs.map((a, i) => (
            <span className="doc-chip" key={i} title={a.name}>
              <span className="doc-icon">{KIND_ICON[a.kind] || '📎'}</span>
              <span className="doc-name">{a.name}</span>
              {a.size ? <span className="doc-size">{fmtBytes(a.size)}</span> : null}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

interface Props {
  msg: Msg
  streaming?: boolean
  stats?: { duration_s: number; eval_count: number } | null
  isLast?: boolean
  onRegenerate?: () => void
  hasArtifact?: boolean
  onOpenArtifact?: () => void
}

export const Message = memo(function Message({ msg, streaming, stats, isLast, onRegenerate, hasArtifact, onOpenArtifact }: Props) {
  const isUser = msg.role === 'user'

  return (
    <div className={`msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="avatar">{isUser ? 'You' : 'A'}</div>
      <div className="body">
        <div className="role-label">{isUser ? 'You' : 'Asthra'}</div>

        {isUser ? (
          <>
            <UserAttachments msg={msg} />
            {msg.content && <div className="user-content">{msg.content}</div>}
          </>
        ) : (
          <>
            {msg.thinking ? <ThinkingBlock text={msg.thinking} /> : null}
            <Markdown text={msg.content || (streaming ? '' : '')} streaming={streaming} />
            {!streaming && (msg.content || isLast) && (
              <div className="msg-actions">
                {hasArtifact && onOpenArtifact && (
                  <button className="action artifact-action" onClick={onOpenArtifact}>
                    ◆ Open artifact
                  </button>
                )}
                {msg.content && <CopyText text={msg.content} />}
                {isLast && onRegenerate && (
                  <button className="action" onClick={onRegenerate}>
                    ↻ Regenerate
                  </button>
                )}
                {stats && (
                  <span className="action" style={{ cursor: 'default' }}>
                    {((stats.eval_count || 0) / (stats.duration_s || 1)).toFixed(1)} tok/s · {stats.duration_s}s
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
})
