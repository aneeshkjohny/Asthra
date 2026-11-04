// Small shared UI helpers.

export const KIND_ICON: Record<string, string> = {
  image: '🖼️',
  text: '📄',
  code: '💻',
  data: '📊',
  pdf: '📕',
  office: '📎',
  file: '📎',
}

export function fmtBytes(n?: number): string {
  if (n == null) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}
