import { memo, useState } from 'react'
import { Markdown } from './Markdown'
import type { Message as Msg } from '../api'

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

interface Props {
  msg: Msg
  streaming?: boolean
  stats?: { duration_s: number; eval_count: number } | null
  isLast?: boolean
  onRegenerate?: () => void
}

export const Message = memo(function Message({ msg, streaming, stats, isLast, onRegenerate }: Props) {
  const isUser = msg.role === 'user'
  const images = (msg.images || []).filter(Boolean)

  return (
    <div className={`msg ${isUser ? 'user' : 'assistant'}`}>
      <div className="avatar">{isUser ? 'You' : 'A'}</div>
      <div className="body">
        <div className="role-label">{isUser ? 'You' : 'Asthra'}</div>

        {isUser ? (
          <>
            {images.length > 0 && (
              <div className="user-images">
                {images.map((src, i) => (
                  <img key={i} src={src.startsWith('data:') ? src : `/api/uploads/${src}`} alt="" />
                ))}
              </div>
            )}
            <div className="user-content">{msg.content}</div>
          </>
        ) : (
          <>
            {msg.thinking ? <ThinkingBlock text={msg.thinking} /> : null}
            <Markdown text={msg.content || (streaming ? '' : '')} streaming={streaming} />
            {!streaming && (msg.content || isLast) && (
              <div className="msg-actions">
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
