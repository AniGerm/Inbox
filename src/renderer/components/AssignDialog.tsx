import { useEffect, useState } from 'react'

type Props = {
  currentAssignee: string | null
  users: string[]
  onCancel: () => void
  onAssign: (userName: string | null) => void | Promise<void>
}

export default function AssignDialog({
  currentAssignee,
  users,
  onCancel,
  onAssign,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const choose = async (userName: string | null) => {
    setBusy(true)
    setError(null)
    try {
      await onAssign(userName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zuweisung fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <div className="settings-backdrop" onClick={onCancel} role="presentation">
      <div
        className="settings-panel rename-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Nutzer zuweisen"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2>Nutzer zuweisen</h2>
        <p className="field-hint">
          Das Dokument erscheint dann nur noch in der Empfänger-Ansicht dieses Benutzers.
          Am Empfang bleibt es mit Zuweisungsstatus sichtbar.
        </p>
        {users.length === 0 ? (
          <p className="field-hint">
            Noch keine Benutzer angelegt. Bitte unter Einstellungen Benutzer hinzufügen.
          </p>
        ) : (
          <ul className="assign-user-list" aria-label="Benutzer wählen">
            {users.map((u) => {
              const isCurrent =
                currentAssignee != null &&
                currentAssignee.toLowerCase() === u.toLowerCase()
              return (
                <li key={u}>
                  <button
                    type="button"
                    className={`btn btn-ghost assign-user-btn ${isCurrent ? 'is-current' : ''}`}
                    disabled={busy}
                    onClick={() => void choose(u)}
                  >
                    {u}
                    {isCurrent ? ' (aktuell)' : ''}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {error ? (
          <p style={{ color: 'var(--danger)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>
        ) : null}
        <div className="settings-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          {currentAssignee ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void choose(null)}
            >
              Zuweisung aufheben
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
