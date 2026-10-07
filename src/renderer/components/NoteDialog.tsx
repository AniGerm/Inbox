import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'

type Props = {
  initialNote: string | null
  onCancel: () => void
  onConfirm: (note: string | null) => void | Promise<void>
}

export default function NoteDialog({ initialNote, onCancel, onConfirm }: Props) {
  const [value, setValue] = useState(initialNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const focusInput = () => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
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

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const trimmed = value.trim()
      await onConfirm(trimmed ? trimmed : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notiz speichern fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <div className="settings-backdrop" onClick={onCancel} role="presentation">
      <form
        className="settings-panel rename-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Notiz"
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={(ev) => void submit(ev)}
      >
        <h2>Notiz</h2>
        <p className="field-hint">Kurznotiz zum Dokument — erscheint als Post-it in der Liste.</p>
        <div className="field">
          <label htmlFor="note-input">Text</label>
          <textarea
            id="note-input"
            ref={inputRef}
            rows={5}
            value={value}
            autoComplete="off"
            spellCheck
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="z. B. bitte in Akte XY ablegen"
          />
          {error ? (
            <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>
          ) : null}
        </div>
        <div className="settings-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          {initialNote ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void onConfirm(null)}
            >
              Löschen
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  )
}
