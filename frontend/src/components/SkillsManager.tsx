import { useState } from 'react'
import { api, type Skill } from '../api'

interface Props {
  skills: Skill[]
  onChanged: () => void
  onError?: (msg: string) => void
}

interface Form {
  name: string
  description: string
  content: string
}

const BLANK: Form = { name: '', description: '', content: '' }

export function SkillsManager({ skills, onChanged, onError }: Props) {
  const [form, setForm] = useState<Form | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  function startNew() {
    setForm(BLANK)
    setIsNew(true)
    setConfirmDel(null)
  }

  async function startEdit(s: Skill) {
    setBusy(true)
    try {
      const full = await api.skill(s.name)
      setForm({
        name: full.name,
        description: full.description || '',
        content: full.body ?? full.content ?? '',
      })
      setIsNew(false)
      setConfirmDel(null)
    } catch (e: any) {
      onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  function sanitizeName(raw: string) {
    return raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  }

  async function save() {
    if (!form) return
    if (!form.name) { onError?.('Give the skill a name, e.g. my-skill'); return }
    if (!form.content.trim()) { onError?.('Write some instructions for the skill'); return }
    setBusy(true)
    try {
      if (isNew) await api.createSkill(form.name, form.description, form.content)
      else await api.updateSkill(form.name, form.description, form.content)
      setForm(null)
      onChanged()
    } catch (e: any) {
      onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(name: string) {
    setBusy(true)
    try {
      await api.deleteSkill(name)
      setConfirmDel(null)
      onChanged()
    } catch (e: any) {
      onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  // --- Editor view ---
  if (form) {
    return (
      <div className="skills-editor">
        <div className="field">
          <label>Skill name</label>
          <input
            value={form.name}
            disabled={!isNew}
            onChange={e => setForm({ ...form, name: sanitizeName(e.target.value) })}
            placeholder="my-skill"
          />
          <div className="hint">
            Used as <code>/{form.name || 'name'}</code> in the composer. Lowercase letters, numbers and dashes.
          </div>
        </div>

        <div className="field">
          <label>Description</label>
          <input
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="What does this skill do? (shown in the / picker and list)"
          />
        </div>

        <div className="field">
          <label>Instructions (markdown)</label>
          <textarea
            className="skill-code"
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
            placeholder={'Write the instructions the model should follow when this skill is active.\n\nExample:\n- Be concise and direct.\n- Use markdown lists.\n- End with a one-line summary.'}
          />
          <div className="hint">This text becomes part of the system prompt whenever the skill is pinned or called.</div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create skill' : 'Save changes'}
          </button>
        </div>
      </div>
    )
  }

  // --- List view ---
  return (
    <div className="skills-list">
      <div className="skills-list-head">
        <div className="hint">
          Reusable instructions you can pin to a chat or call with <code>/name</code>.
          Each is a <code>.md</code> file stored in <code>skills/</code>.
        </div>
        <button className="btn btn-primary" onClick={startNew}>＋ New skill</button>
      </div>

      {skills.length === 0 && (
        <div className="skill-empty">No skills yet. Create one to get started.</div>
      )}

      <div className="skills-rows">
        {skills.map(s => (
          <div className="skills-row" key={s.name}>
            <button className="skills-row-main" onClick={() => startEdit(s)} title="Edit this skill">
              <span className="skills-row-name">/{s.name}</span>
              <span className="skills-row-desc">{s.description}</span>
            </button>
            {confirmDel === s.name ? (
              <span className="skills-row-confirm">
                <button className="btn btn-danger" onClick={() => remove(s.name)} disabled={busy}>Delete</button>
                <button className="btn btn-ghost" onClick={() => setConfirmDel(null)} disabled={busy}>Cancel</button>
              </span>
            ) : (
              <button className="skills-row-del" title="Delete skill" onClick={() => setConfirmDel(s.name)}>🗑</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
