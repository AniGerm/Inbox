import { useEffect, useState } from 'react'
import type { AppSettings } from '../../shared/types'

type Props = {
  settings: AppSettings
  onSave: (partial: Partial<AppSettings>) => Promise<void>
  onClose: () => void
}

export default function SettingsPanel({ settings, onSave, onClose }: Props) {
  const [faxFolder, setFaxFolder] = useState(settings.faxFolder ?? '')
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    settings.notificationsEnabled,
  )
  const [autostart, setAutostart] = useState(settings.autostart)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = async () => {
    const chosen = await window.faxInbox.pickFaxFolder()
    if (chosen) setFaxFolder(chosen)
  }

  const save = async () => {
    setBusy(true)
    try {
      await onSave({
        faxFolder: faxFolder.trim() || null,
        notificationsEnabled,
        autostart,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose} role="presentation">
      <div
        className="settings-panel"
        role="dialog"
        aria-label="Einstellungen"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Einstellungen</h2>

        <div className="field">
          <label htmlFor="fax-folder">Faxordner</label>
          <div className="path-field">
            <input
              id="fax-folder"
              value={faxFolder}
              onChange={(e) => setFaxFolder(e.target.value)}
            />
            <button type="button" className="btn btn-ghost" onClick={() => void pick()}>
              …
            </button>
          </div>
          {/* Scan folder: reserved for a later release — not used in MVP. */}
          <p className="field-hint">Nur PDF-Dateien in diesem Ordner werden überwacht.</p>
        </div>

        <div className="toggle-row">
          <span>Benachrichtigungen</span>
          <button
            type="button"
            className={`toggle ${notificationsEnabled ? 'is-on' : ''}`}
            aria-pressed={notificationsEnabled}
            onClick={() => setNotificationsEnabled((v) => !v)}
            aria-label="Benachrichtigungen"
          />
        </div>

        <div className="toggle-row">
          <span>Autostart</span>
          <button
            type="button"
            className={`toggle ${autostart ? 'is-on' : ''}`}
            aria-pressed={autostart}
            onClick={() => setAutostart((v) => !v)}
            aria-label="Autostart"
          />
        </div>

        <div className="settings-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void save()}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}
