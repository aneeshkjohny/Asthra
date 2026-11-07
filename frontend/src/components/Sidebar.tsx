import { useState } from 'react'
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

      <button className="new-chat-btn" onClick={() => p.onNew()}>
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
                    <span
                      className="del"
                      title="Delete"
                      onClick={e => { e.stopPropagation(); p.onDelete(c.id) }}
                    >
                      ✕
                    </span>
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
              <span
                className="del"
                title="Delete"
                onClick={e => {
                  e.stopPropagation()
                  p.onDelete(c.id)
                }}
              >
                ✕
              </span>
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
