import { type Model, type Conversation } from '../api'

interface Props {
  collapsed: boolean
  conversations: Conversation[]
  activeId: string | null
  models: Model[]
  currentModel: string
  theme: 'light' | 'dark'
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onModel: (name: string) => void
  onTheme: () => void
  onOpenSettings: () => void
}

export function Sidebar(p: Props) {
  return (
    <aside className={`sidebar ${p.collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="brand">
          <span className="logo">A</span>
          Asthra
        </div>
      </div>

      <button className="new-chat-btn" onClick={p.onNew}>
        <span className="plus">＋</span> New chat
      </button>

      <div className="conv-list">
        {p.conversations.length === 0 ? (
          <div className="conv-empty">No conversations yet</div>
        ) : (
          <div className="conv-group-label">History</div>
        )}
        {p.conversations.map(c => (
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
