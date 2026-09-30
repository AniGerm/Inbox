import { useCallback, useEffect, useState } from 'react'
import type {
  AppSettings,
  DuplexMode,
  PrintMethod,
  PrinterInfo,
} from '../../shared/types'

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
    settings.printMethod === 'direct' ? 'direct' : 'external',
  )
  const [printerName, setPrinterName] = useState(settings.printerName ?? '')
  const [duplex, setDuplex] = useState<DuplexMode>(settings.duplex ?? 'simplex')
  const [color, setColor] = useState(settings.color ?? false)
  const [copies, setCopies] = useState(settings.copies ?? 1)
  const [paperSize, setPaperSize] = useState(settings.paperSize ?? 'A4')
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printersLoading, setPrintersLoading] = useState(false)
  const [platform, setPlatform] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const refreshPrinters = useCallback(async () => {
    setPrintersLoading(true)
    try {
      const list = await window.faxInbox.listPrinters()
      setPrinters(list)
      if (!printerName) {
        const def = list.find((p) => p.isDefault)
        if (def) setPrinterName(def.name)
      }
    } catch (err) {
      console.error(err)
      setPrinters([])
    } finally {
      setPrintersLoading(false)
    }
  }, [printerName])

  useEffect(() => {
    void window.faxInbox.getPlatform().then(setPlatform)
  }, [])

  useEffect(() => {
    if (printMethod === 'direct') {
      void refreshPrinters()
    }
  }, [printMethod, refreshPrinters])

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
        platform === 'win32' ? printMethod : printMethod === 'direct' ? 'external' : printMethod
      await onSave({
        faxFolder: faxFolder.trim() || null,
        notificationsEnabled,
        autostart,
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
                    ? 'ohne Dialog, mit den Optionen unten'
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
