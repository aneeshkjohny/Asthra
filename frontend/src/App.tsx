import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Conversation, type Message, type Model, type Settings, type ChatChunk } from './api'
import { Sidebar } from './components/Sidebar'
import { Message as MessageView } from './components/Message'
import { Composer, type PendingFile } from './components/Composer'
import { SettingsModal } from './components/Settings'

const SUGGESTIONS = [
  { icon: '✎', text: 'Explain a concept in simple terms' },
  { icon: '⌘', text: 'Help me write and debug some code' },
  { icon: '✦', text: 'Brainstorm ideas for a project' },
  { icon: '⇄', text: 'Summarize or rewrite a piece of text' },
]

export default function App() {
  const [models, setModels] = useState<Model[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [model, setModel] = useState<string>('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('asthra-theme') as 'light' | 'dark') || 'light')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [stats, setStats] = useState<ChatChunk['stats'] | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const loadedConv = useRef<string | null>(null)

  const currentModel = models.find(m => m.name === model)
  const caps = currentModel?.capabilities ?? []

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('asthra-theme', theme)
  }, [theme])

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  // Autoscroll while streaming / new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streaming])

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const [ms, convs] = await Promise.all([api.models(), api.conversations()])
        setModels(ms)
        setConversations(convs)
        if (ms.length && !model) setModel(ms[0].name)
        if (convs.length) {
          const first = convs[0]
          setActiveId(first.id)
          setMessages(first.messages ?? (await api.conversation(first.id)).messages ?? [])
          setSettings(first.settings ?? {})
          setModel(first.model)
          loadedConv.current = first.id
        }
      } catch (e: any) {
        setToast(`Backend error: ${e.message}`)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const refreshConversations = useCallback(async () => {
    setConversations(await api.conversations())
  }, [])

  async function selectConversation(id: string) {
    if (streaming) stopStreaming()
    setActiveId(id)
    setStats(null)
    if (loadedConv.current === id) return
    const conv = await api.conversation(id)
    setMessages(conv.messages ?? [])
    setSettings(conv.settings ?? {})
    setModel(conv.model)
    loadedConv.current = id
  }

  async function newChat() {
    if (streaming) stopStreaming()
    setActiveId(null)
    setMessages([])
    setSettings({})
    setStats(null)
    loadedConv.current = null
    setSidebarCollapsed(window.innerWidth < 720 ? false : sidebarCollapsed)
  }

  async function deleteConversation(id: string) {
    try {
      await api.deleteConversation(id)
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
        loadedConv.current = null
      }
      await refreshConversations()
    } catch (e: any) {
      setToast(e.message)
    }
  }

  function setModelForAll(name: string) {
    setModel(name)
    // persist to active conversation if any
    if (activeId) {
      api.updateConversation(activeId, { model: name }).then(() => refreshConversations()).catch(() => {})
    }
  }

  function saveSettings(s: Settings) {
    setSettings(s)
    if (activeId) {
      api.updateConversation(activeId, { settings: s }).then(() => refreshConversations()).catch(() => {})
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
  }

  async function handleSend(text: string, files: PendingFile[]) {
    const textToSend = text.trim()
    if (!textToSend && files.length === 0) return

    let convId = activeId
    let conv = convId
      ? conversations.find(c => c.id === convId)
      : null

    // Create conversation if needed
    if (!conv) {
      conv = await api.createConversation('New chat', model, settings)
      convId = conv.id
      setActiveId(conv.id)
      loadedConv.current = conv.id
      await refreshConversations()
    }

    // Local optimistic user message
    const userMsg: Message = {
      id: 'tmp-' + Date.now(),
      conversation_id: convId!,
      role: 'user',
      content: textToSend,
      attachments: files.map(f => ({
        id: f.id, name: f.name, kind: f.kind, mime: f.mime, size: f.size,
        url: f.url, data_url: f.data_url, b64: f.b64,
      })),
      images: files.filter(f => f.kind === 'image').map(f => f.name),
      created_at: new Date().toISOString(),
    }
    const history = [...messages, userMsg]
    setMessages(history)
    setStats(null)
    setStreaming(true)

    let acc = ''
    let accThink = ''

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const apiMessages = history
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments && m.attachments.length ? m.attachments : undefined,
        }))

      const finalStats = await api.chat(
        {
          model,
          messages: apiMessages,
          system: settings.system,
          temperature: settings.temperature ?? 0.7,
          max_tokens: settings.max_tokens,
          think: settings.think ?? false,
          conversation_id: convId!,
        },
        chunk => {
          if (chunk.error) {
            setToast(`Error: ${chunk.error}`)
            return
          }
          if (chunk.content) {
            acc += chunk.content
            setMessages(prev => {
              const last = prev[prev.length - 1]
              if (last && last.role === 'assistant' && last.id === 'streaming') {
                return [...prev.slice(0, -1), { ...last, content: acc, thinking: accThink || undefined }]
              }
              return [...prev, {
                id: 'streaming', conversation_id: convId!, role: 'assistant',
                content: acc, thinking: accThink || undefined, images: [], created_at: new Date().toISOString(),
              }]
            })
          }
          if (chunk.thinking) {
            accThink += chunk.thinking
          }
          if (chunk.stats) setStats(chunk.stats)
        },
        controller.signal,
      )

      // Persist assistant turn server-side
      if (acc || accThink) {
        await api.persistAssistant(convId!, acc, accThink || null)
        const fresh = await api.conversation(convId!)
        setMessages(fresh.messages ?? [])
      }
      void finalStats
      await refreshConversations()
    } catch (e: any) {
      if (e.name !== 'AbortError') setToast(`Error: ${e.message}`)
    } finally {
      setStreaming(false)
      abortRef.current = null
      // Replace the temporary streaming id with the persisted one (already reloaded above)
      setMessages(prev => prev.map(m => (m.id === 'streaming' ? { ...m, id: 'assistant-' + Date.now() } : m)))
    }
  }

  async function handleUpload(file: File): Promise<PendingFile> {
    const up = await api.upload(file)
    return { ...up, uploading: false }
  }

  async function regenerate() {
    if (!activeId || messages.length === 0) return
    // Drop last assistant message and resend with the same history
    const trimmed = messages.filter((m, i, arr) => !(i === arr.length - 1 && m.role === 'assistant'))
    const lastUser = [...trimmed].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    setMessages(trimmed)
    await handleSend(lastUser.content, [])
  }

  if (loading) {
    return (
      <div className="empty" style={{ paddingTop: 0 }}>
        <span className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
        <p style={{ marginTop: 16 }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        collapsed={sidebarCollapsed}
        conversations={conversations}
        activeId={activeId}
        models={models}
        currentModel={model}
        theme={theme}
        onNew={newChat}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onModel={setModelForAll}
        onTheme={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="main">
        <div className="topbar">
          <button className="hamburger" onClick={() => setSidebarCollapsed(c => !c)} title="Toggle sidebar">
            ☰
          </button>
          <div className="conv-title">{activeId ? conversations.find(c => c.id === activeId)?.title : 'New chat'}</div>
          <div className="badge">
            <span className="dot" />
            {model || 'no model'}
          </div>
        </div>

        <div className="messages-wrap">
          {messages.length === 0 ? (
            <div className="empty">
              <div className="big-logo">A</div>
              <h1>How can I help today?</h1>
              <p>Chat locally with {model || 'your models'} — fast, private, no cloud.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="suggestion" onClick={() => handleSend(s.text, [])}>
                    <span className="s-icon">{s.icon}</span>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((m, i) => (
                <MessageView
                  key={m.id}
                  msg={m}
                  streaming={streaming && i === messages.length - 1 && m.role === 'assistant'}
                  stats={i === messages.length - 1 && m.role === 'assistant' ? stats : null}
                  isLast={i === messages.length - 1}
                  onRegenerate={i === messages.length - 1 && m.role === 'assistant' && !streaming ? regenerate : undefined}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="composer-wrap">
          <div className="composer-outer">
            <Composer
              disabled={false}
              streaming={streaming}
              think={settings.think ?? false}
              onThink={v => setSettings(s => ({ ...s, think: v }))}
              onSend={handleSend}
              onStop={stopStreaming}
              onUpload={handleUpload}
            />
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          initial={settings}
          modelCapabilities={caps}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
