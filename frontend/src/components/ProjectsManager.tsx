import { useEffect, useState } from 'react'
import { api, type Project, type ProjectFile, type Skill } from '../api'
import { KIND_ICON, fmtBytes } from '../util'

interface Props {
  projects: Project[]
  initialId: string | null
  skills: Skill[]
  onChanged: () => void
  onNewInProject: (id: string) => void
  onClose: () => void
  onError?: (msg: string) => void
}

export function ProjectsManager(p: Props) {
  const [view, setView] = useState<'list' | 'edit'>(p.initialId ? 'edit' : 'list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [system, setSystem] = useState('')
  const [defaultSkills, setDefaultSkills] = useState<string[]>([])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') p.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (p.initialId) startEdit(p.initialId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startNew() {
    setEditingId(null)
    setName('')
    setDescription('')
    setSystem('')
    setDefaultSkills([])
    setFiles([])
    setConfirmDel(null)
    setView('edit')
  }

  async function startEdit(id: string) {
    setBusy(true)
    try {
      const full = await api.project(id)
      setEditingId(id)
      setName(full.name)
      setDescription(full.description || '')
      setSystem(full.system_prompt || '')
      setDefaultSkills(full.default_skills || [])
      setFiles(full.files ?? await api.projectFiles(id))
      setConfirmDel(null)
      setView('edit')
    } catch (e: any) {
      p.onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  function toggleSkill(n: string) {
    setDefaultSkills(prev => (prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]))
  }

  async function save() {
    if (!name.trim()) { p.onError?.('Give the project a name'); return }
    setBusy(true)
    try {
      if (!editingId) {
        const created = await api.createProject(name.trim(), description.trim(), system, defaultSkills)
        setEditingId(created.id)
      } else {
        await api.updateProject(editingId, {
          name: name.trim(),
          description: description.trim(),
          system_prompt: system,
          default_skills: defaultSkills,
        })
      }
      p.onChanged()
    } catch (e: any) {
      p.onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    setView('list')
    setEditingId(null)
    setConfirmDel(null)
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      await api.deleteProject(id)
      setConfirmDel(null)
      if (editingId === id) setView('list')
      p.onChanged()
    } catch (e: any) {
      p.onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function uploadFiles(arr: File[]) {
    if (!editingId) return
    setBusy(true)
    try {
      const added: ProjectFile[] = []
      for (const f of arr) added.push(await api.uploadProjectFile(editingId, f))
      setFiles(prev => [...added, ...prev])
      p.onChanged()
    } catch (e: any) {
      p.onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeFile(fid: string) {
    if (!editingId) return
    setBusy(true)
    try {
      await api.deleteProjectFile(editingId, fid)
      setFiles(prev => prev.filter(f => f.id !== fid))
      p.onChanged()
    } catch (e: any) {
      p.onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  // --- editor ---
  if (view === 'edit') {
    return (
      <div className="overlay" onClick={e => e.target === e.currentTarget && p.onClose()}>
        <div className="modal wide">
          <div className="modal-head">
            <h2>{editingId ? 'Manage project' : 'New project'}</h2>
            <button className="icon-btn" onClick={p.onClose}>✕</button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Project name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Website, Research, Job search"
              />
            </div>

            <div className="field">
              <label>Description</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this project for?"
              />
            </div>

            <div className="field">
              <label>Project system prompt</label>
              <textarea
                value={system}
                onChange={e => setSystem(e.target.value)}
                placeholder="Applies to every chat in this project, unless a chat sets its own."
              />
              <div className="hint">Used as the base system prompt for all chats in this project.</div>
            </div>

            <div className="field">
              <label>Default skills</label>
              {p.skills.length === 0 ? (
                <div className="hint">No skills available yet — create one in Settings → Skills.</div>
              ) : (
                <div className="pm-skills">
                  {p.skills.map(s => (
                    <label key={s.name} className="pm-skill">
                      <input
                        type="checkbox"
                        checked={defaultSkills.includes(s.name)}
                        onChange={() => toggleSkill(s.name)}
                      />
                      <span><code>/{s.name}</code> {s.description}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="hint">Applied to every chat in this project. A chat can pin more on top.</div>
            </div>

            {editingId ? (
              <div className="field">
                <label>Shared documents</label>
                <div className="hint">Attached to every chat in this project as context (text & documents are read; images are ignored here).</div>
                {files.length > 0 && (
                  <div className="pm-files">
                    {files.map(f => (
                      <div className="pm-file" key={f.id}>
                        <span className="pm-file-icon">{KIND_ICON[f.kind] || '📄'}</span>
                        <a className="pm-file-name" href={api.projectFileUrl(editingId, f.id)} target="_blank" rel="noreferrer" title={f.name}>
                          {f.name}
                        </a>
                        <span className="pm-file-size">{fmtBytes(f.size ?? 0)}</span>
                        <button className="pm-file-del" title="Remove" onClick={() => removeFile(f.id)} disabled={busy}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pm-file-actions">
                  <label className="btn btn-ghost" title={busy ? 'Uploading…' : 'Add files to this project'}>
                    ＋ Add file
                    <input
                      type="file"
                      multiple
                      hidden
                      disabled={busy}
                      onChange={e => {
                        const list = e.target.files
                        if (list && list.length) uploadFiles(Array.from(list))
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="hint">Create the project first, then you can add shared documents.</div>
            )}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={cancel} disabled={busy}>Cancel</button>
              {editingId && (
                <button className="btn btn-ghost" onClick={() => p.onNewInProject(editingId)} disabled={busy}>
                  ＋ New chat in project
                </button>
              )}
              <button className="btn btn-primary" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create project'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- list ---
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && p.onClose()}>
      <div className="modal wide">
        <div className="modal-head">
          <h2>Projects</h2>
          <button className="icon-btn" onClick={p.onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="skills-list-head">
            <div className="hint">
              Projects group related <b>chats</b>, a shared <b>system prompt</b>, <b>default skills</b>, and
              <b> shared documents</b> the model can draw on.
            </div>
            <button className="btn btn-primary" onClick={startNew}>＋ New project</button>
          </div>

          {p.projects.length === 0 && (
            <div className="skill-empty">No projects yet. Create one to keep related work together.</div>
          )}

          <div className="skills-rows">
            {p.projects.map(pr => (
              <div className="pm-row" key={pr.id}>
                <button className="skills-row-main" onClick={() => startEdit(pr.id)} title="Manage this project">
                  <span className="skills-row-name">▣ {pr.name}</span>
                  <span className="skills-row-desc">
                    {pr.description || 'No description'} · {pr.n_conversations} chats · {pr.n_files} files
                  </span>
                </button>
                <button className="btn btn-ghost" onClick={() => p.onNewInProject(pr.id)} disabled={busy}>New chat</button>
                {confirmDel === pr.id ? (
                  <span className="skills-row-confirm">
                    <button className="btn btn-danger" onClick={() => remove(pr.id)} disabled={busy}>Delete</button>
                    <button className="btn btn-ghost" onClick={() => setConfirmDel(null)} disabled={busy}>Cancel</button>
                  </span>
                ) : (
                  <button className="skills-row-del" title="Delete project (chats are kept)" onClick={() => setConfirmDel(pr.id)}>🗑</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
