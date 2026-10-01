import { useCallback, useEffect, useState } from 'react'
import type {
  AppSettings,
  DuplexMode,
  PrintMethod,
  PrinterInfo,
  UpdateStatusEvent,
} from '../../shared/types'

type Props = {
  settings: AppSettings
  onSave: (partial: Partial<AppSettings>) => Promise<void>
  onClose: () => void
}

type UpdateUiState = {
  status: string
  availableVersion: string | null
  downloadedVersion: string | null
  progress: number | null
  checking: boolean
  downloading: boolean
}

const INITIAL_UPDATE: UpdateUiState = {
  status: '',
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  checking: false,
  downloading: false,
}

function applyUpdateEvent(prev: UpdateUiState, event: UpdateStatusEvent): UpdateUiState {
  switch (event.type) {
    case 'checking':
      return {
        ...prev,
        checking: true,
        status: 'Suche nach Updates…',
      }
    case 'update-available':
      return {
        ...prev,
        checking: false,
        availableVersion: event.version,
        downloadedVersion: null,
        progress: null,
        status: `Version ${event.version} verfügbar`,
      }
    case 'update-not-available':
      return {
        ...prev,
        checking: false,
        availableVersion: null,
        status: 'Du hast die neueste Version.',
      }
    case 'download-progress':
      return {
        ...prev,
        downloading: true,
        progress: event.percent,
        status: `Download… ${event.percent} %`,
      }
    case 'update-downloaded':
      return {
        ...prev,
        checking: false,
        downloading: false,
        progress: 100,
        availableVersion: event.version,
        downloadedVersion: event.version,
        status: `Version ${event.version} bereit zur Installation`,
      }
    case 'error':
      return {
        ...prev,
        checking: false,
        downloading: false,
        status: event.message,
      }
    default:
      return prev
  }
}

export default function SettingsPanel({ settings, onSave, onClose }: Props) {
  const [faxFolder, setFaxFolder] = useState(settings.faxFolder ?? '')
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    settings.notificationsEnabled,
  )
  const [autostart, setAutostart] = useState(settings.autostart)
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(
    settings.autoCheckUpdates !== false,
  )
  const [printMethod, setPrintMethod] = useState<PrintMethod>(
    settings.printMethod === 'direct' ? 'direct' : 'external',
  )
  const [printerName, setPrinterName] = useState(settings.printerName ?? '')
  const [duplex, setDuplex] = useState<DuplexMode>(settings.duplex ?? 'simplex')
  const [color, setColor] = useState(settings.color ?? false)
  const [copies, setCopies] = useState(settings.copies ?? 1)
  const [paperSize, setPaperSize] = useState(settings.paperSize ?? 'A4')
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printersLoading, setPrintersLoading] = useState(false)
  const [platform, setPlatform] = useState<string>('win32')
  const [appVersion, setAppVersion] = useState('')
  const [busy, setBusy] = useState(false)
  const [updateUi, setUpdateUi] = useState<UpdateUiState>(INITIAL_UPDATE)

  const refreshPrinters = useCallback(async () => {
    if (typeof window.faxInbox.listPrinters !== 'function') {
      setPrinters([])
      return
    }
    setPrintersLoading(true)
    try {
      const list = await window.faxInbox.listPrinters()
      setPrinters(list)
      setPrinterName((current) => {
        const saved = current.trim()
        if (saved) {
          // Prefer exact match; fall back to case-insensitive so the label shows
          const exact = list.find((p) => p.name === saved)
          if (exact) return exact.name
          const loose = list.find((p) => p.name.toLowerCase() === saved.toLowerCase())
          return loose?.name ?? saved
        }
        const def = list.find((p) => p.isDefault)
        return def?.name ?? ''
      })
    } catch (err) {
      console.error(err)
      setPrinters([])
    } finally {
      setPrintersLoading(false)
    }
  }, [])

  useEffect(() => {
    void window.faxInbox.getPlatform().then(setPlatform)
    if (typeof window.faxInbox.getAppVersion === 'function') {
      void window.faxInbox.getAppVersion().then(setAppVersion)
    }
  }, [])

  useEffect(() => {
    if (printMethod === 'direct' && platform === 'win32') {
      void refreshPrinters()
    }
  }, [printMethod, platform, refreshPrinters])

  useEffect(() => {
    if (typeof window.faxInbox.onUpdateStatus !== 'function') return
    return window.faxInbox.onUpdateStatus((event) => {
      setUpdateUi((prev) => applyUpdateEvent(prev, event))
    })
  }, [])

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
      const method: PrintMethod =
        platform === 'win32'
          ? printMethod
          : printMethod === 'direct'
            ? 'external'
            : printMethod
      await onSave({
        faxFolder: faxFolder.trim() || null,
        notificationsEnabled,
        autostart,
        autoCheckUpdates,
        printMethod: method,
        printerName: printerName.trim(),
        duplex,
        color,
        copies: Math.min(99, Math.max(1, Math.round(Number(copies)) || 1)),
        paperSize: paperSize.trim() || 'A4',
      })
    } finally {
      setBusy(false)
    }
  }

  const checkUpdates = async () => {
    if (typeof window.faxInbox.checkForUpdates !== 'function') return
    setUpdateUi((prev) => ({
      ...prev,
      checking: true,
      status: 'Suche nach Updates…',
    }))
    await window.faxInbox.checkForUpdates()
  }

  const downloadUpdate = async () => {
    if (typeof window.faxInbox.downloadUpdate !== 'function') return
    setUpdateUi((prev) => ({
      ...prev,
      downloading: true,
      progress: 0,
      status: 'Download startet…',
    }))
    await window.faxInbox.downloadUpdate()
  }

  const installUpdate = async () => {
    if (typeof window.faxInbox.installUpdate !== 'function') return
    await window.faxInbox.installUpdate()
  }

  const isWindows = platform === 'win32'
  const showDirectOptions = printMethod === 'direct' && isWindows

  return (
    <div className="settings-backdrop" onClick={onClose} role="presentation">
      <div
        className="settings-panel"
        role="dialog"
        aria-label="Einstellungen"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Einstellungen</h2>
        {appVersion ? <p className="settings-version">Version {appVersion}</p> : null}

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
          <p className="field-hint">Nur PDF-Dateien in diesem Ordner werden überwacht.</p>
        </div>

        <div className="field print-settings">
          <span className="field-label" id="print-method-label">
            Drucken
          </span>
          <p className="field-hint">
            Wähle, wie die App beim Klick auf <strong>Drucken</strong> vorgeht.
          </p>
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
                <span className="radio-hint">z. B. Adobe — Druckdialog dort</span>
              </span>
            </label>
            <label className={`radio-row ${!isWindows ? 'is-disabled' : ''}`}>
              <input
                type="radio"
                name="printMethod"
                value="direct"
                checked={printMethod === 'direct'}
                disabled={!isWindows}
                onChange={() => setPrintMethod('direct')}
              />
              <span>
                Direkt auf festen Drucker drucken
                <span className="radio-hint">
                  {isWindows
                    ? 'ohne Dialog, mit den Optionen unten (Windows)'
                    : 'nur unter Windows verfügbar'}
                </span>
              </span>
            </label>
          </div>
        </div>

        {showDirectOptions && (
          <>
            <div className="field">
              <label htmlFor="printer-name">Drucker</label>
              <div className="path-field">
                <select
                  id="printer-name"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  disabled={printersLoading}
                >
                  <option value="">— bitte wählen —</option>
                  {/* Keep saved name visible while the list loads / if missing from OS list */}
                  {printerName && !printers.some((p) => p.name === printerName) ? (
                    <option value={printerName}>{printerName}</option>
                  ) : null}
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                      {p.isDefault ? ' (Standard)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void refreshPrinters()}
                  disabled={printersLoading}
                >
                  {printersLoading ? '…' : 'Aktualisieren'}
                </button>
              </div>
              {!printersLoading && printers.length === 0 && (
                <p className="field-hint">
                  Keine Drucker gefunden. Windows-Drucker prüfen und Liste aktualisieren.
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="duplex">Duplex</label>
              <select
                id="duplex"
                value={duplex}
                onChange={(e) => setDuplex(e.target.value as DuplexMode)}
              >
                <option value="simplex">Einseitig</option>
                <option value="long">Doppelseitig (lange Kante)</option>
                <option value="short">Doppelseitig (kurze Kante)</option>
              </select>
            </div>

            <div className="toggle-row" style={{ borderTop: 'none', paddingTop: 0 }}>
              <span>Farbe</span>
              <button
                type="button"
                className={`toggle ${color ? 'is-on' : ''}`}
                aria-pressed={color}
                onClick={() => setColor((v) => !v)}
                aria-label="Farbe"
              />
            </div>
            <p className="field-hint" style={{ marginTop: -8 }}>
              Aus = Schwarz/Weiß
            </p>

            <div className="field">
              <label htmlFor="copies">Kopien</label>
              <input
                id="copies"
                type="number"
                min={1}
                max={99}
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
              />
            </div>

            <div className="field">
              <label htmlFor="paper-size">Papierformat</label>
              <select
                id="paper-size"
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value)}
              >
                <option value="A4">A4</option>
                <option value="A3">A3</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </div>
          </>
        )}

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

        <div className="field update-settings">
          <span className="field-label">Updates</span>
          <p className="field-hint">
            Aktuelle Version: <strong>{appVersion || '…'}</strong>
            {isWindows
              ? ' — Auto-Update über GitHub Releases (Windows-Installer).'
              : ' — Auto-Update ist für den Windows-Installer vorgesehen.'}
          </p>
          <div className="toggle-row" style={{ borderTop: 'none', paddingTop: 0 }}>
            <span>Automatisch nach Updates suchen</span>
            <button
              type="button"
              className={`toggle ${autoCheckUpdates ? 'is-on' : ''}`}
              aria-pressed={autoCheckUpdates}
              onClick={() => setAutoCheckUpdates((v) => !v)}
              aria-label="Automatisch nach Updates suchen"
            />
          </div>
          <div className="update-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={updateUi.checking || updateUi.downloading}
              onClick={() => void checkUpdates()}
            >
              Nach Updates suchen
            </button>
            {updateUi.availableVersion && !updateUi.downloadedVersion ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={updateUi.downloading}
                onClick={() => void downloadUpdate()}
              >
                Herunterladen
              </button>
            ) : null}
            {updateUi.downloadedVersion ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void installUpdate()}
              >
                Jetzt neu starten und installieren
              </button>
            ) : null}
          </div>
          {updateUi.progress !== null && updateUi.downloading ? (
            <div
              className="update-progress"
              role="progressbar"
              aria-valuenow={updateUi.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="update-progress-bar" style={{ width: `${updateUi.progress}%` }} />
            </div>
          ) : null}
          {updateUi.status ? <p className="update-status">{updateUi.status}</p> : null}
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
