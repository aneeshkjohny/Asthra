import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Conversation, type Message, type Model, type Settings, type ChatChunk, type Skill, type ToolCall, type SearchResult, type Project } from './api'
import { Sidebar } from './components/Sidebar'
import { Message as MessageView } from './components/Message'
import { Composer, type PendingFile } from './components/Composer'
import { SettingsModal } from './components/Settings'
import { ProjectsManager } from './components/ProjectsManager'
import { ArtifactPane } from './components/ArtifactPane'
import { extractArtifact, type Artifact } from './artifact'

const SUGGESTIONS = [
  { icon: '✎', text: 'Explain a concept in simple terms' },
  { icon: '◆', text: 'Build me a small interactive HTML page or chart' },
  { icon: '⌘', text: 'Help me write and debug some code' },
  { icon: '⇄', text: 'Summarize or rewrite a piece of text' },
]

function ExportMenu({ convId, title }: { convId: string; title: string }) {
  const [open, setOpen] = useState(false)
  const go = (fmt: 'md' | 'html') => {
    window.location.href = api.exportUrl(convId, fmt)
    setOpen(false)
  }
  return (
    <div className="export-wrap">
      <button className="hamburger export-btn" onClick={() => setOpen(o => !o)} title="Export conversation">
        ⤓
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="export-menu">
            <div className="export-menu-label">{title}</div>
            <button onClick={() => go('md')}>⭳ Markdown (.md)</button>
            <button onClick={() => go('html')}>⭳ HTML (.html)</button>
          </div>
        </>
      )}
    </div>
  )
}

export default function App() {
  const [models, setModels] = useState<Model[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [skills, setSkills] = useState<Skill[]>([])
  const [pinned, setPinned] = useState<string[]>([])
  const [settingsTab, setSettingsTab] = useState<'prefs' | 'skills'>('prefs')
  const [artifact, setArtifact] = useState<{ msgId: string; a: Artifact } | null>(null)
  const [model, setModel] = useState<string>('')
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('asthra-theme') as 'light' | 'dark') || 'light')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [stats, setStats] = useState<ChatChunk['stats'] | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [showProjects, setShowProjects] = useState(false)
  const [projectsInitialId, setProjectsInitialId] = useState<string | null>(null)
  const [newChatProjectId, setNewChatProjectId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const loadedConv = useRef<string | null>(null)
  const searchTimer = useRef<any>(null)

  const currentModel = models.find(m => m.name === model)
  const caps = currentModel?.capabilities ?? []
  const activeConv = activeId ? conversations.find(c => c.id === activeId) : null
  const activeProject = activeConv?.project_id ? projects.find(p => p.id === activeConv.project_id) : null

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
        try { setProjects(await api.projects()) } catch { setProjects([]) } // optional (older backend)
        try { setSkills(await api.skills()) } catch { /* skills are optional */ }
        if (ms.length && !model) setModel(ms[0].name)
        if (convs.length) {
          const first = convs[0]
          setActiveId(first.id)
          setMessages(first.messages ?? (await api.conversation(first.id)).messages ?? [])
          setSettings(first.settings ?? {})
          setModel(first.model)
          setPinned(first.skills ?? [])
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

  const refreshProjects = useCallback(async () => {
    setProjects(await api.projects())
  }, [])

  async function selectConversation(id: string) {
    if (streaming) stopStreaming()
    setActiveId(id)
    setStats(null)
    if (loadedConv.current === id) return
    setArtifact(null)
    const conv = await api.conversation(id)
    setMessages(conv.messages ?? [])
    setSettings(conv.settings ?? {})
    setModel(conv.model)
    setPinned(conv.skills ?? [])
    loadedConv.current = id
  }

  async function newChat(projectId: string | null = null) {
    if (streaming) stopStreaming()
    setActiveId(null)
    setMessages([])
    setSettings({})
    setPinned([])
    setStats(null)
    setArtifact(null)
    loadedConv.current = null
    setNewChatProjectId(projectId)
    setSidebarCollapsed(window.innerWidth < 720 ? false : sidebarCollapsed)
  }

  // Global new-chat shortcuts: Ctrl/Cmd+K (always) or plain "n" when not typing.
  const newChatRef = useRef<typeof newChat>(newChat)
  newChatRef.current = newChat
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      const isN = e.key.toLowerCase() === 'n'
        && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
      if (!isCmdK && !isN) return
      if (isN) {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      }
      e.preventDefault()
      newChatRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function deleteConversation(id: string) {
    try {
      await api.deleteConversation(id)
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
        setArtifact(null)
        loadedConv.current = null
      }
      await refreshConversations()
    } catch (e: any) {
      setToast(e.message)
    }
  }

  // Move an existing chat into a project, or back to General (project_id=null).
  async function moveConversation(convId: string, projectId: string | null) {
    try {
      await api.updateConversation(convId, { project_id: projectId })
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

  function openArtifact(msg: { id: string; content: string }) {
    const a = extractArtifact(msg.content)
    if (a) setArtifact({ msgId: msg.id, a })
  }

  function openSettings(tab: 'prefs' | 'skills') {
    setSettingsTab(tab)
    setShowSettings(true)
  }

  function openProjects(initialId: string | null = null) {
    setProjectsInitialId(initialId)
    setShowProjects(true)
  }

  async function refreshSkills() {
    try {
      const list = await api.skills()
      setSkills(list)
      const names = new Set(list.map(s => s.name))
      setPinned(prev => prev.filter(n => names.has(n)))
      if (activeId) {
        const kept = pinned.filter(n => names.has(n))
        if (kept.length !== pinned.length) {
          api.updateConversation(activeId, { skills: kept }).then(() => refreshConversations()).catch(() => {})
        }
      }
    } catch (e: any) {
      setToast(e.message)
    }
  }

  async function toggleSkill(name: string, on: boolean) {
    const next = on ? Array.from(new Set([...pinned, name])) : pinned.filter(n => n !== name)
    setPinned(next)
    if (activeId) {
      try {
        await api.updateConversation(activeId, { skills: next })
        await refreshConversations()
      } catch (e: any) {
        setToast(e.message)
      }
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
  }

  function doSearch(q: string) {
    setSearchQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) {
      setSearchResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      try {
        setSearchResults(await api.search(q))
      } catch (e: any) {
        setToast(e.message)
      }
    }, 200)
  }

  function pickResult(r: SearchResult) {
    setSearchQuery('')
    setSearchResults([])
    selectConversation(r.conversation_id)
  }

  async function handleSend(text: string, files: PendingFile[]) {
    const textToSend = text.trim()
    if (!textToSend && files.length === 0) return

    let convId = activeId
    let conv = convId
      ? conversations.find(c => c.id === convId)
      : null

    // Create conversation if needed (optionally inside a project)
    if (!conv) {
      conv = await api.createConversation('New chat', model, settings, pinned, newChatProjectId)
      convId = conv.id
      setNewChatProjectId(null)
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
    let accTools: ToolCall[] = []

    const upsertAssistant = (patch: Partial<Message>) => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last && last.id === 'streaming') {
          return [...prev.slice(0, -1), { ...last, ...patch }]
        }
        return [...prev, {
          id: 'streaming', conversation_id: convId!, role: 'assistant',
          content: '', images: [], created_at: new Date().toISOString(), ...patch,
        }]
      })
    }

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
          tools: caps.includes('tools'),
          conversation_id: convId!,
        },
        chunk => {
          if (chunk.error) {
            setToast(`Error: ${chunk.error}`)
            return
          }
          if (chunk.thinking) {
            accThink += chunk.thinking
            return
          }
          if (chunk.stats) {
            setStats(chunk.stats)
            return
          }
          if (chunk.tool) {
            accTools.push(chunk.tool)
            upsertAssistant({ content: acc, thinking: accThink || undefined, tools: [...accTools] })
            return
          }
          if (chunk.content) {
            acc += chunk.content
            upsertAssistant({
              content: acc, thinking: accThink || undefined,
              tools: accTools.length ? [...accTools] : undefined,
            })
          }
        },
        controller.signal,
      )

      // Persist assistant turn server-side
      if (acc || accThink || accTools.length) {
        await api.persistAssistant(convId!, acc, accThink || null, accTools.length ? accTools : null)
        const fresh = await api.conversation(convId!)
        const freshMsgs = fresh.messages ?? []
        setMessages(freshMsgs)
        const last = freshMsgs[freshMsgs.length - 1]
        if (last && last.role === 'assistant') {
          const a = extractArtifact(last.content)
          if (a) setArtifact({ msgId: last.id, a })
        }
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
        projects={projects}
        onNew={newChat}
        onSelect={selectConversation}
        onDelete={deleteConversation}
        onMoveProject={moveConversation}
        onModel={setModelForAll}
        onTheme={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
        onOpenSettings={() => openSettings('prefs')}
        onNewProject={() => openProjects(null)}
        onOpenProject={id => openProjects(id)}
        onNewInProject={id => newChat(id)}
        searchQuery={searchQuery}
        searchResults={searchResults}
        onSearch={doSearch}
        onPickResult={pickResult}
      />

      <div className="main">
        <div className="topbar">
          <button className="hamburger" onClick={() => setSidebarCollapsed(c => !c)} title="Toggle sidebar">
            ☰
          </button>
          {activeProject && (
            <button className="proj-chip" title={`Project: ${activeProject.name}`} onClick={() => openProjects(activeProject.id)}>
              ▣ {activeProject.name}
            </button>
          )}
          <div className="conv-title">{activeConv?.title || 'New chat'}</div>
          <div className="topbar-right">
            {activeId && (
              <ExportMenu
                convId={activeId}
                title={conversations.find(c => c.id === activeId)?.title || 'Conversation'}
              />
            )}
            <div className="badge">
              <span className="dot" />
              {model || 'no model'}
            </div>
          </div>
        </div>

        <div className="panes">
        <div className="chat-col">
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
                  hasArtifact={m.role === 'assistant' && !streaming ? !!extractArtifact(m.content) : false}
                  onOpenArtifact={m.role === 'assistant' ? () => openArtifact(m) : undefined}
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
              onError={m => setToast(m)}
              skills={skills}
              pinned={pinned}
              onToggleSkill={toggleSkill}
              onAddSkill={() => openSettings('skills')}
            />
          </div>
        </div>
        </div>

          {artifact && (
            <ArtifactPane artifact={artifact.a} onClose={() => setArtifact(null)} />
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          initial={settings}
          modelCapabilities={caps}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
          initialTab={settingsTab}
          skills={skills}
          onSkillsChanged={refreshSkills}
          onError={m => setToast(m)}
        />
      )}

      {showProjects && (
        <ProjectsManager
          projects={projects}
          initialId={projectsInitialId}
          skills={skills}
          onChanged={() => { refreshProjects(); refreshConversations() }}
          onNewInProject={id => { setShowProjects(false); newChat(id) }}
          onClose={() => setShowProjects(false)}
          onError={m => setToast(m)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
