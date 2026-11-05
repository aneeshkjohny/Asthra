import { useEffect, useState } from 'react'
import type { Settings as S, Skill } from '../api'
import { SkillsManager } from './SkillsManager'

type Tab = 'prefs' | 'skills'

interface Props {
  initial: S
  modelCapabilities: string[]
  onSave: (s: S) => void
  onClose: () => void
  initialTab?: Tab
  skills?: Skill[]
  onSkillsChanged?: () => void
  onError?: (msg: string) => void
}

export function SettingsModal(p: Props) {
  const [tab, setTab] = useState<Tab>(p.initialTab ?? 'prefs')
  const [system, setSystem] = useState(p.initial.system ?? '')
  const [temperature, setTemperature] = useState(p.initial.temperature ?? 0.7)
  const [maxTokens, setMaxTokens] = useState(p.initial.max_tokens ?? 2048)
  const [think, setThink] = useState(p.initial.think ?? false)
  const supportsThink = p.modelCapabilities.includes('thinking')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') p.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.onClose])

  function save() {
    p.onSave({
      system: system.trim() || undefined,
      temperature,
      max_tokens: maxTokens,
      think: supportsThink ? think : false,
    })
    p.onClose()
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && p.onClose()}>
      <div className={`modal ${tab === 'skills' ? 'wide' : ''}`}>
        <div className="modal-head">
          <h2>{tab === 'skills' ? 'Skills' : 'Chat settings'}</h2>
          <button className="icon-btn" onClick={p.onClose}>✕</button>
        </div>
        <div className="modal-tabs">
          <button className={`tab ${tab === 'prefs' ? 'on' : ''}`} onClick={() => setTab('prefs')}>Preferences</button>
          <button className={`tab ${tab === 'skills' ? 'on' : ''}`} onClick={() => setTab('skills')}>Skills</button>
        </div>
        <div className="modal-body">
          {tab === 'prefs' ? (
          <>
          <div className="field">
            <label>System prompt</label>
            <textarea
              value={system}
              onChange={e => setSystem(e.target.value)}
              placeholder="You are a helpful, precise assistant. (optional)"
            />
            <div className="hint">Prepended to every conversation as the system message.</div>
          </div>

          <div className="field">
            <label>Temperature</label>
            <div className="slider-row">
              <input
                type="range" min={0} max={2} step={0.1}
                value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
              />
              <span className="slider-val">{temperature.toFixed(1)}</span>
            </div>
            <div className="hint">Lower = more focused and deterministic · Higher = more creative.</div>
          </div>

          <div className="field">
            <label>Max tokens</label>
            <input
              type="text"
              value={maxTokens}
              onChange={e => setMaxTokens(parseInt(e.target.value.replace(/\D/g, '')) || 0)}
            />
            <div className="hint">Maximum length of each reply. 0 = model default.</div>
          </div>

          {supportsThink && (
            <div className="field">
              <div className="toggle-row">
                <div>
                  <label style={{ marginBottom: 0 }}>Thinking</label>
                  <div className="hint" style={{ marginTop: 2 }}>Let the model reason step-by-step before answering.</div>
                </div>
                <div className={`switch ${think ? 'on' : ''}`} onClick={() => setThink(t => !t)}>
                  <span className="knob" />
                </div>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={p.onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save</button>
          </div>
          </>
          ) : (
            <SkillsManager
              skills={p.skills ?? []}
              onChanged={p.onSkillsChanged ?? (() => {})}
              onError={p.onError}
            />
          )}
        </div>
      </div>
    </div>
  )
}
