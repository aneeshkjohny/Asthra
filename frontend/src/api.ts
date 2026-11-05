// Asthra API client — all calls go to the local FastAPI backend,
// which proxies to Ollama on localhost. No external services.

export interface Model {
  name: string
  size: number
  family: string
  parameter_size: string
  quantization: string
  capabilities: string[]
}

export interface Conversation {
  id: string
  title: string
  model: string
  settings: Settings
  skills?: string[]
  created_at: string
  updated_at: string
  messages?: Message[]
}

export interface Skill {
  name: string
  description: string
  content?: string
  body?: string
}

export type AttachmentKind = 'image' | 'text' | 'code' | 'data' | 'pdf' | 'office' | 'file'

export interface Attachment {
  id?: string
  name: string
  kind: AttachmentKind
  mime?: string
  size?: number
  url?: string
  b64?: string
  data_url?: string
  text?: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string | null
  attachments?: Attachment[]
  images: string[]
  created_at: string
}

export interface Settings {
  system?: string
  temperature?: number
  max_tokens?: number
  think?: boolean
}

export interface ChatChunk {
  content?: string
  thinking?: string
  done?: boolean
  stats?: {
    duration_s: number
    eval_count: number
    eval_duration_s: number
    prompt_eval_count: number
  }
  error?: string
  status?: number
}

const BASE = '' // same-origin; vite proxies /api in dev

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text || res.statusText}`)
  }
  return res.json()
}

export const api = {
  models(): Promise<Model[]> {
    return fetch(`${BASE}/api/models`).then(r => json<Model[]>(r))
  },

  conversations(): Promise<Conversation[]> {
    return fetch(`${BASE}/api/conversations`).then(r => json<Conversation[]>(r))
  },

  conversation(id: string): Promise<Conversation> {
    return fetch(`${BASE}/api/conversations/${id}`).then(r => json<Conversation>(r))
  },

  createConversation(title: string, model: string, settings: Settings, skills: string[] = []): Promise<Conversation> {
    return fetch(`${BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, model, settings, skills }),
    }).then(r => json<Conversation>(r))
  },

  updateConversation(id: string, patch: Partial<Pick<Conversation, 'title' | 'model' | 'settings' | 'skills'>>): Promise<Conversation> {
    return fetch(`${BASE}/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(r => json<Conversation>(r))
  },

  deleteConversation(id: string): Promise<void> {
    return fetch(`${BASE}/api/conversations/${id}`, { method: 'DELETE' }).then(() => undefined)
  },

  // Streams assistant tokens. Calls onChunk for each piece; resolves with final stats.
  async chat(
    payload: {
      model: string
      messages: { role: string; content: string; images?: string[]; attachments?: Attachment[] }[]
      system?: string
      temperature?: number
      max_tokens?: number
      think?: boolean
      conversation_id?: string
    },
    onChunk: (c: ChatChunk) => void,
    signal?: AbortSignal,
  ): Promise<ChatChunk['stats'] | undefined> {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      onChunk({ error: text || `API ${res.status}` })
      return undefined
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let stats: ChatChunk['stats']
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (!data) continue
        const chunk = JSON.parse(data) as ChatChunk
        if (chunk.stats) stats = chunk.stats
        onChunk(chunk)
      }
    }
    return stats
  },

  persistAssistant(conversationId: string, content: string, thinking?: string | null): Promise<void> {
    return fetch(`${BASE}/api/chat/persist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, content, thinking }),
    }).then(() => undefined)
  },

  upload(file: File): Promise<Attachment> {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/api/upload`, { method: 'POST', body: form }).then(r => json(r))
  },

  skills(): Promise<Skill[]> {
    return fetch(`${BASE}/api/skills`).then(r => json<Skill[]>(r))
  },

  skill(name: string): Promise<Skill> {
    return fetch(`${BASE}/api/skills/${name}`).then(r => json<Skill>(r))
  },

  createSkill(name: string, description: string, content: string): Promise<Skill> {
    return fetch(`${BASE}/api/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, content }),
    }).then(r => json<Skill>(r))
  },

  updateSkill(name: string, description: string, content: string): Promise<Skill> {
    return fetch(`${BASE}/api/skills/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, content }),
    }).then(r => json<Skill>(r))
  },

  deleteSkill(name: string): Promise<void> {
    return fetch(`${BASE}/api/skills/${name}`, { method: 'DELETE' }).then(() => undefined)
  },
}
