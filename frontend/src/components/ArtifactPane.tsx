import { useState } from 'react'
import type { Artifact } from '../artifact'

interface Props {
  artifact: Artifact
  onClose: () => void
}

function slugify(s: string): string {
  return (s || 'artifact').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'artifact'
}

export function ArtifactPane({ artifact, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const renderable = artifact.html !== ''

  function copy() {
    navigator.clipboard.writeText(artifact.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  function download() {
    const body = artifact.html || artifact.code
    const blob = new Blob([body], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = slugify(artifact.title) + '.html'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  function fullscreen() {
    const blob = new Blob([artifact.html || artifact.code], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 15000)
  }

  return (
    <div className="artifact-pane">
      <div className="artifact-head">
        <div className="artifact-title-wrap">
          <span className="artifact-ico">◆</span>
          <span className="artifact-title" title={artifact.title}>{artifact.title}</span>
          <span className="artifact-type">{artifact.type}</span>
        </div>
        <div className="artifact-actions">
          <button className="abtn" onClick={copy} title="Copy code">
            {copied ? '✓' : '⧉'}<span className="tip">{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button className="abtn" onClick={download} title="Download">
            ↓<span className="tip">Download</span>
          </button>
          {renderable && (
            <button className="abtn" onClick={fullscreen} title="Open full screen">
              ⤢<span className="tip">Full screen</span>
            </button>
          )}
          <button className="abtn close" onClick={onClose} title="Close">
            ✕<span className="tip">Close</span>
          </button>
        </div>
      </div>

      <div className="artifact-body">
        {renderable ? (
          <iframe
            className="artifact-frame"
            title={artifact.title}
            sandbox="allow-scripts allow-forms allow-modals"
            srcDoc={artifact.html}
          />
        ) : (
          <div className="artifact-nopreview">
            <p>
              This is a <b>{artifact.type}</b> component. It can't be rendered here, but you can
              copy or download the code to run it.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
