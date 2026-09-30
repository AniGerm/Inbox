import { useEffect, useState } from 'react'
import type { AppSettings, PrintMethod } from '../../shared/types'

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
  const [printMethod, setPrintMethod] = useState<PrintMethod>(
    settings.printMethod ?? 'external',
  )
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
        printMethod,
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

        <div className="field">
          <span className="field-label" id="print-method-label">
            Drucken
          </span>
          <div
            className="radio-group"
            role="radiogroup"
            aria-labelledby="print-method-label"
          >
            <label className="radio-row">
              <input
                type="radio"
                name="printMethod"
                value="external"
                checked={printMethod === 'external'}
                onChange={() => setPrintMethod('external')}
              />
              <span>
                PDF im Standardprogramm öffnen
                <span className="radio-hint">empfohlen — z. B. Adobe</span>
              </span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="printMethod"
                value="system"
                checked={printMethod === 'system'}
                onChange={() => setPrintMethod('system')}
              />
              <span>
                Direkt drucken (Systemdialog)
                <span className="radio-hint">Windows-Druckdialog / unter Linux Electron</span>
              </span>
            </label>
          </div>
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
