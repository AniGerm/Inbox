import { useEffect, useRef, useState, type FormEvent } from 'react'

type Props = {
  currentName: string
  onCancel: () => void
  onConfirm: (name: string) => void | Promise<void>
}

export default function RenameDialog({ currentName, onCancel, onConfirm }: Props) {
  const stem = currentName.replace(/\.pdf$/i, '')
  const [value, setValue] = useState(stem)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Name darf nicht leer sein.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Umbenennen fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <div className="settings-backdrop" onClick={onCancel} role="presentation">
      <form
        className="settings-panel rename-panel"
        role="dialog"
        aria-label="Fax umbenennen"
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={(ev) => void submit(ev)}
      >
        <h2>Umbenennen</h2>
        <div className="field">
          <label htmlFor="rename-input">Neuer Dateiname</label>
          <div className="path-field">
            <input
              id="rename-input"
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby="rename-ext"
            />
            <span id="rename-ext" className="ext-suffix">
              .pdf
            </span>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}
        </div>
        <div className="settings-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
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
