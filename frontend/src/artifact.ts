// Detect a self-contained "artifact" (a page, component, or diagram) inside an
// assistant reply's markdown, and turn it into something renderable / downloadable.
// Runs entirely client-side, so artifacts persist for free once the message is saved.

export type ArtifactType = 'html' | 'svg' | 'code'

export interface Artifact {
  code: string      // the original generated block (what we copy)
  html: string      // render-ready HTML (what the iframe + download use); '' if not renderable
  title: string
  type: ArtifactType
}

const RENDER_LANGS = new Set(['html', 'htm', 'svg', 'xml'])
const CODE_LANGS = new Set(['jsx', 'tsx', 'react'])

function isArtifactLang(lang: string): boolean {
  return RENDER_LANGS.has(lang) || CODE_LANGS.has(lang)
}

function fencedBlocks(text: string): { lang: string; code: string }[] {
  const lines = text.split('\n')
  const out: { lang: string; code: string }[] = []
  let i = 0
  while (i < lines.length) {
    const open = lines[i].match(/^\s*(`{3,}|~{3,})\s*([\w+-]+)?\s*.*$/)
    if (open) {
      const fenceChar = open[1][0]
      const fenceLen = open[1].length
      const lang = (open[2] || '').toLowerCase()
      const buf: string[] = []
      i++
      while (i < lines.length) {
        const cl = lines[i].match(/^\s*(`{3,}|~{3,})\s*$/)
        if (cl && cl[1][0] === fenceChar && cl[1].length >= fenceLen) break
        buf.push(lines[i])
        i++
      }
      out.push({ lang, code: buf.join('\n') })
      i++
    } else {
      i++
    }
  }
  return out
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

function artifactTitle(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (t && stripTags(t[1])) return stripTags(t[1]).slice(0, 80)
  const h = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h && stripTags(h[1])) return stripTags(h[1]).slice(0, 80)
  return ''
}

function isFullHtml(code: string): boolean {
  return /<!doctype\s+html/i.test(code) || /<html[\s>]/i.test(code)
}

function htmlShell(title: string, body: string): string {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    (title ? `<title>${escapeHtml(title)}</title>` : '') +
    '</head><body>' + body + '</body></html>'
}

/** Return the best artifact found in the markdown, or null if there isn't one. */
export function extractArtifact(text: string): Artifact | null {
  if (!text) return null
  const blocks = fencedBlocks(text)
  const cands = blocks.filter(b => isArtifactLang(b.lang))
  if (cands.length === 0) return null

  // Prefer a complete HTML document; otherwise the largest candidate.
  const rank = (b: { lang: string; code: string }) =>
    (isFullHtml(b.code) ? 1_000_000_000 : 0) + b.code.length
  const best = cands.reduce((a, b) => (rank(b) > rank(a) ? b : a))
  const lang = best.lang

  if (lang === 'svg' || lang === 'xml') {
    const inner = best.code.trim()
    const svg = /<svg[\s>]/i.test(inner) ? inner : `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`
    const title = artifactTitle(svg) || 'Diagram'
    return {
      code: best.code,
      html: htmlShell(title, `<div style="display:grid;place-items:center;min-height:100vh;background:#fff;padding:16px;box-sizing:border-box">${svg}</div>`),
      title,
      type: 'svg',
    }
  }

  if (RENDER_LANGS.has(lang)) {
    const html = isFullHtml(best.code) ? best.code : htmlShell('', best.code)
    return { code: best.code, html, title: artifactTitle(html) || 'Artifact', type: 'html' }
  }

  // React component: no runtime here to render it, but it's still a useful artifact.
  return { code: best.code, html: '', title: 'Component', type: 'code' }
}
