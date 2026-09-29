import { useState } from 'react'

type Props = {
  onComplete: (faxFolder: string) => Promise<void>
}

export default function Setup({ onComplete }: Props) {
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async () => {
    const chosen = await window.faxInbox.pickFaxFolder()
    if (chosen) {
      setPath(chosen)
      setError(null)
    }
  }

  const start = async () => {
    if (!path.trim()) {
      setError('Bitte einen Faxordner wählen.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onComplete(path.trim())
    } catch {
      setError('Ordner konnte nicht gespeichert werden.')
      setBusy(false)
    }
  }

  return (
    <div className="setup">
      <div className="setup-card">
        <h1>Fax Inbox</h1>
        <p>Wähle den Ordner, in dem eingehende Fax-PDFs abgelegt werden.</p>
        <div className="path-field">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="Pfad zum Faxordner"
            aria-label="Faxordner"
          />
          <button type="button" className="btn btn-ghost" onClick={() => void pick()}>
            Durchsuchen
          </button>
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
        <div className="setup-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void start()}
          >
            Loslegen
          </button>
        </div>
      </div>
    </div>
  )
}
