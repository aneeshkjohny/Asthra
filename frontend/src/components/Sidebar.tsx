import { useEffect, useState } from 'react'
import { type Model, type Conversation, type SearchResult, type Project } from '../api'

interface Props {
  collapsed: boolean
  conversations: Conversation[]
  activeId: string | null
  models: Model[]
  currentModel: string
  theme: 'light' | 'dark'
  projects: Project[]
  onNew: (projectId?: string | null) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onMoveProject: (convId: string, projectId: string | null) => void
  onModel: (name: string) => void
  onTheme: () => void
  onOpenSettings: () => void
  onNewProject: () => void
  onOpenProject: (id: string) => void
  onNewInProject: (id: string) => void
  searchQuery: string
  searchResults: SearchResult[]
  onSearch: (q: string) => void
  onPickResult: (r: SearchResult) => void
}

// Per-chat "⋯" menu: move the chat to a project / General, or delete it.
// Rendered with position:fixed (measured from the button) so it is not clipped
// by the scrollable list and can open past the sidebar's right edge.
function ConvMenu({
  conv,
  projects,
  onMove,
  onDelete,
}: {
  conv: Conversation
  projects: Project[]
  onMove: (projectId: string | null) => void
  onDelete: () => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const close = () => setPos(null)

  useEffect(() => {
    if (!pos) return
    const onScroll = () => close()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('keydown', onKey)
    }
  }, [pos])

  return (
    <>
      <button
        className="more"
        title="More"
        onClick={e => {
          e.stopPropagation()
          if (pos) { close(); return }
          const r = e.currentTarget.getBoundingClientRect()
          const W = 224
          let x = r.right + 8
          if (x + W > window.innerWidth) x = Math.max(8, r.left - W - 8)
          let y = r.bottom + 6
          if (y + 260 > window.innerHeight) y = Math.max(8, r.top - 240)
          setPos({ x, y })
        }}
      >
        ⋯
      </button>
      {pos && (
        <>
          <div className="convmenu-backdrop" onClick={e => { e.stopPropagation(); close() }} />
          <div className="convmenu" style={{ left: pos.x, top: pos.y }} onClick={e => e.stopPropagation()}>
            <div className="convmenu-label">Move to</div>
            {projects.map(pr => (
              <button
                key={pr.id}
                className={`convmenu-item ${conv.project_id === pr.id ? 'current' : ''}`}
                onClick={() => { onMove(pr.id); close() }}
              >
                <span className="convmenu-check">{conv.project_id === pr.id ? '✓' : ''}</span>
                <span className="convmenu-icon">▣</span>
                <span className="convmenu-name">{pr.name}</span>
              </button>
            ))}
            <button
              className={`convmenu-item ${conv.project_id == null ? 'current' : ''}`}
              onClick={() => { onMove(null); close() }}
            >
              <span className="convmenu-check">{conv.project_id == null ? '✓' : ''}</span>
              <span className="convmenu-icon">◦</span>
              <span className="convmenu-name">General</span>
            </button>
            <div className="convmenu-sep" />
            <button className="convmenu-item danger" onClick={() => { onDelete(); close() }}>
              <span className="convmenu-icon">🗑</span>
              <span className="convmenu-name">Delete chat</span>
            </button>
          </div>
        </>
      )}
    </>
  )
}

export function Sidebar(p: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (id: string) => open[id] ?? true
  const general = p.conversations.filter(c => !c.project_id)
  const projectGroups = p.projects.map(pr => ({
    pr,
    convs: p.conversations.filter(c => c.project_id === pr.id),
  }))

  return (
    <aside className={`sidebar ${p.collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="brand">
          <span className="logo">A</span>
          Asthra
        </div>
      </div>

      <button className="new-chat-btn" title="New chat (Ctrl/⌘+K)" onClick={() => p.onNew()}>
        <span className="plus">＋</span> New chat
      </button>

      <div className="search-wrap">
        <span className="search-ico">⌕</span>
        <input
          className="search-input"
          placeholder="Search chats…"
          value={p.searchQuery}
          onChange={e => p.onSearch(e.target.value)}
        />
        {p.searchQuery && (
          <button className="search-clear" title="Clear search" onClick={() => p.onSearch('')}>✕</button>
        )}
      </div>

      {p.searchQuery ? (
        <div className="conv-list search-results">
          <div className="conv-group-label">Results</div>
          {p.searchResults.length === 0 ? (
            <div className="conv-empty">No matches</div>
          ) : (
            p.searchResults.map(r => (
              <div
                key={r.message_id}
                className="search-result"
                onClick={() => p.onPickResult(r)}
                title={r.conversation_title}
              >
                <div className="sr-title">
                  <span className="sr-name">{r.conversation_title}</span>
                  <span className="sr-role">{r.role === 'user' ? 'you' : 'asthra'}</span>
                </div>
                <div className="sr-snippet">{r.snippet}</div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="conv-list">
          <div className="proj-section">
            <div className="conv-group-label proj-head">
              <span>Projects</span>
              <button className="proj-add" title="New project" onClick={p.onNewProject}>＋</button>
            </div>
            {projectGroups.length === 0 && (
              <div className="proj-none">None yet — hit ＋ to group related chats</div>
            )}
            {projectGroups.map(({ pr, convs }) => (
              <div key={pr.id} className="proj-group">
                <div
                  className="proj-row"
                  onClick={() => p.onOpenProject(pr.id)}
                  title="Manage this project"
                >
                  <button
                    className="proj-caret"
                    title={isOpen(pr.id) ? 'Collapse' : 'Expand'}
                    onClick={e => { e.stopPropagation(); setOpen(o => ({ ...o, [pr.id]: !isOpen(pr.id) })) }}
                  >
                    {isOpen(pr.id) ? '▾' : '▸'}
                  </button>
                  <span className="proj-name">▣ {pr.name}</span>
                  <span className="proj-count">{convs.length}</span>
                  <button
                    className="proj-new"
                    title="New chat in this project"
                    onClick={e => { e.stopPropagation(); p.onNewInProject(pr.id) }}
                  >
                    ＋
                  </button>
                </div>
                {isOpen(pr.id) && convs.length === 0 && (
                  <div className="conv-empty proj-sub-empty">No chats yet — use ＋ to start one</div>
                )}
                {isOpen(pr.id) && convs.map(c => (
                  <div
                    key={c.id}
                    className={`conv-item proj-conv ${c.id === p.activeId ? 'active' : ''}`}
                    onClick={() => p.onSelect(c.id)}
                    title={c.title}
                  >
                    <span className="title">{c.title}</span>
                    <ConvMenu
                      conv={c}
                      projects={p.projects}
                      onMove={pid => p.onMoveProject(c.id, pid)}
                      onDelete={() => p.onDelete(c.id)}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="conv-group-label">General</div>
          {general.length === 0 && (
            <div className="conv-empty">No general chats yet</div>
          )}
          {general.map(c => (
            <div
              key={c.id}
              className={`conv-item ${c.id === p.activeId ? 'active' : ''}`}
              onClick={() => p.onSelect(c.id)}
              title={c.title}
            >
              <span className="title">{c.title}</span>
              <ConvMenu
                conv={c}
                projects={p.projects}
                onMove={pid => p.onMoveProject(c.id, pid)}
                onDelete={() => p.onDelete(c.id)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="sidebar-footer">
        <div className="model-select-wrap">
          <select
            className="model-select"
            value={p.currentModel}
            onChange={e => p.onModel(e.target.value)}
          >
            {p.models.map(m => (
              <option key={m.name} value={m.name}>
                {m.name}
                {m.parameter_size ? ` · ${m.parameter_size}` : ''}
              </option>
            ))}
          </select>
          <span className="chev">▾</span>
        </div>
        <div className="foot-actions">
          <button className="foot-btn" onClick={p.onOpenSettings} title="Chat settings">
            ⚙ Settings
          </button>
          <button className="foot-btn" onClick={p.onTheme} title="Toggle theme">
            {p.theme === 'light' ? '☾ Dark' : '☀ Light'}
          </button>
        </div>
      </div>
    </aside>
  )
}
