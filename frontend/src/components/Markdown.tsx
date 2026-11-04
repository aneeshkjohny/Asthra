import { memo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={`copy-btn ${copied ? 'copied' : ''}`}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        })
      }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

interface Props {
  text: string
  streaming?: boolean
}

export const Markdown = memo(function Markdown({ text, streaming }: Props) {
  const components: Components = {
    pre({ children }) {
      // Grab raw code text + language from the child <code>
      const child = Array.isArray(children) ? children[0] : children
      const codeEl = (child as any)?.props
      const codeText: string = codeEl?.children ?? ''
      const match = /language-(\w+)/.exec(codeEl?.className ?? '')
      const lang = match ? match[1] : 'text'
      return (
        <div className="code-block">
          <div className="code-head">
            <span className="code-lang">{lang}</span>
            <CopyButton text={codeText} />
          </div>
          <pre>{children}</pre>
        </div>
      )
    },
    code({ className, children }) {
      // Inline code (no parent <pre>)
      const isBlock = /language-/.test(className ?? '')
      if (isBlock) {
        return <code className={className}>{children}</code>
      }
      return <code>{children}</code>
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      )
    },
  }

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]} components={components}>
        {text}
      </ReactMarkdown>
      {streaming ? <span className="cursor" /> : null}
    </div>
  )
})
