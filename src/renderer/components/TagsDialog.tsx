import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { normalizeTags } from '../../shared/types'

type Props = {
  initialTags: string[]
  suggestions: string[]
  title?: string
  onCancel: () => void
  onConfirm: (tags: string[]) => void | Promise<void>
}

export default function TagsDialog({
  initialTags,
  suggestions,
  title = 'Tags',
  onCancel,
  onConfirm,
}: Props) {
  const [tags, setTags] = useState(() => normalizeTags(initialTags))
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const focusInput = () => inputRef.current?.focus()
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(focusInput)
    })
    const t = window.setTimeout(focusInput, 50)
    return () => {
      window.cancelAnimationFrame(id)
      window.clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const addDraft = () => {
    const next = normalizeTags([...tags, draft])
    setTags(next)
    setDraft('')
  }

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t.toLowerCase() !== tag.toLowerCase()))
  }

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addDraft()
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const finalTags = normalizeTags([...tags, draft])
    setBusy(true)
    setError(null)
    try {
      await onConfirm(finalTags)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tags speichern fehlgeschlagen.')
      setBusy(false)
    }
  }

  const unusedSuggestions = suggestions.filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()),
  )

  return (
    <div className="settings-backdrop" onClick={onCancel} role="presentation">
      <form
        className="settings-panel rename-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={(ev) => void submit(ev)}
      >
        <h2>{title}</h2>
        <div className="field">
          <div className="tag-editor-chips" aria-label="Aktuelle Tags">
            {tags.length === 0 ? (
              <span className="field-hint">Noch keine Tags</span>
            ) : (
              tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="tag-pill is-editable"
                  onClick={() => removeTag(t)}
                  title="Entfernen"
                >
                  {t} ×
                </button>
              ))
            )}
          </div>
          <label htmlFor="tag-input">Tag hinzufügen</label>
          <div className="user-add-row">
            <input
              id="tag-input"
              ref={inputRef}
              value={draft}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Enter zum Hinzufügen"
              disabled={busy}
            />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || !draft.trim()}
              onClick={addDraft}
            >
              +
            </button>
          </div>
          {unusedSuggestions.length > 0 ? (
            <div className="tag-suggestions">
              {unusedSuggestions.slice(0, 12).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="tag-pill is-suggestion"
                  disabled={busy}
                  onClick={() => setTags((prev) => normalizeTags([...prev, s]))}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          {error ? (
            <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>
          ) : null}
        </div>
        <div className="settings-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  )
}
