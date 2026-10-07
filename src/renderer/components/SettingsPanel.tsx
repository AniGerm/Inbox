import { useCallback, useEffect, useState } from 'react'
import type {
  AppMode,
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
  onInstallUpdate?: () => void
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
    case 'installing':
      return {
        ...prev,
        checking: false,
        downloading: false,
        status: 'App wird beendet — Installation startet…',
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

export default function SettingsPanel({ settings, onSave, onClose, onInstallUpdate }: Props) {
  const initialFolders =
    Array.isArray(settings.faxFolders) && settings.faxFolders.length > 0
      ? settings.faxFolders
      : settings.faxFolder
        ? [settings.faxFolder]
        : ['']
  const [faxFolders, setFaxFolders] = useState<string[]>(initialFolders)
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    settings.notificationsEnabled,
  )
  const [autostart, setAutostart] = useState(settings.autostart)
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(
    settings.autoCheckUpdates !== false,
  )
  const [exportFolder, setExportFolder] = useState(settings.exportFolder ?? '')
  const [exportButtonLabel, setExportButtonLabel] = useState(
    settings.exportButtonLabel?.trim()
      ? settings.exportButtonLabel
      : 'In Ordner kopieren',
  )
  const [stateFolder, setStateFolder] = useState(settings.stateFolder ?? '')
  const [appMode, setAppMode] = useState<AppMode>(
    settings.appMode === 'recipient' ? 'recipient' : 'reception',
  )
  const [clientUserName, setClientUserName] = useState(settings.clientUserName ?? '')
  const [users, setUsers] = useState<string[]>([])
  const [newUserName, setNewUserName] = useState('')
  const [usersBusy, setUsersBusy] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(
    settings.autoArchiveEnabled === true,
  )
  const [autoArchiveAfterDays, setAutoArchiveAfterDays] = useState(
    settings.autoArchiveAfterDays ?? 30,
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

  const refreshUsers = useCallback(async () => {
    if (typeof window.faxInbox.getUsers !== 'function') {
      setUsers([])
      return
    }
    try {
      const list = await window.faxInbox.getUsers()
      setUsers(list)
      setClientUserName((current) => {
        if (!current.trim()) return current
        const match = list.find((u) => u.toLowerCase() === current.trim().toLowerCase())
        return match ?? ''
      })
    } catch (err) {
      console.error(err)
      setUsers([])
    }
  }, [])

  useEffect(() => {
    void refreshUsers()
  }, [refreshUsers])

  const addUser = async () => {
    const name = newUserName.trim()
    if (!name || typeof window.faxInbox.addUser !== 'function') return
    setUsersBusy(true)
    setUsersError(null)
    try {
      const list = await window.faxInbox.addUser(name)
      setUsers(list)
      setNewUserName('')
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Benutzer konnte nicht angelegt werden.')
    } finally {
      setUsersBusy(false)
    }
  }

  const removeUser = async (name: string) => {
    if (typeof window.faxInbox.removeUser !== 'function') return
    setUsersBusy(true)
    setUsersError(null)
    try {
      const list = await window.faxInbox.removeUser(name)
      setUsers(list)
      setClientUserName((current) =>
        current.trim().toLowerCase() === name.toLowerCase() ? '' : current,
      )
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Benutzer konnte nicht entfernt werden.')
    } finally {
      setUsersBusy(false)
    }
  }

  useEffect(() => {
    if (printMethod === 'direct' && (platform === 'win32' || platform === 'linux')) {
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

  const pick = async (index: number) => {
    const chosen = await window.faxInbox.pickFaxFolder()
    if (!chosen) return
    setFaxFolders((prev) => {
      const next = [...prev]
      next[index] = chosen
      return next
    })
  }

  const pickExport = async () => {
    if (typeof window.faxInbox.pickExportFolder !== 'function') return
    const chosen = await window.faxInbox.pickExportFolder()
    if (!chosen) return
    setExportFolder(chosen)
  }

  const pickState = async () => {
    if (typeof window.faxInbox.pickStateFolder !== 'function') return
    const chosen = await window.faxInbox.pickStateFolder()
    if (!chosen) return
    setStateFolder(chosen)
  }

  const addFolder = () => {
    setFaxFolders((prev) => [...prev, ''])
  }

  const removeFolder = (index: number) => {
    setFaxFolders((prev) => {
      if (prev.length <= 1) return ['']
      return prev.filter((_, i) => i !== index)
    })
  }

  const supportsDirectPrint = platform === 'win32' || platform === 'linux'

  const save = async () => {
    setBusy(true)
    try {
      const method: PrintMethod =
        supportsDirectPrint
          ? printMethod
          : printMethod === 'direct'
            ? 'external'
            : printMethod
      const folders = faxFolders.map((f) => f.trim()).filter(Boolean)
      await onSave({
        faxFolders: folders,
        faxFolder: folders[0] ?? null,
        notificationsEnabled,
        autostart,
        autoCheckUpdates,
        exportFolder: exportFolder.trim() || null,
        exportButtonLabel: exportButtonLabel.trim() || 'In Ordner kopieren',
        stateFolder: stateFolder.trim() || null,
        appMode,
        clientUserName:
          appMode === 'recipient' ? clientUserName.trim() || null : clientUserName.trim() || null,
        autoArchiveEnabled,
        autoArchiveAfterDays: Math.min(
          365,
          Math.max(1, Math.round(Number(autoArchiveAfterDays)) || 30),
        ),
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
    if (onInstallUpdate) {
      onInstallUpdate()
      return
    }
    if (typeof window.faxInbox.installUpdate !== 'function') return
    await window.faxInbox.installUpdate()
  }

  const isWindows = platform === 'win32'
  const showDirectOptions = printMethod === 'direct' && supportsDirectPrint

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
          <span className="field-label" id="fax-folders-label">
            Eingangsordner
          </span>
          <p className="field-hint">
            Überwachte Ordner für eingehende PDFs — Fax, Scans, Anhänge (jeder mit eigenem Unterordner
            Archiv).
          </p>
          <div className="folder-list" role="group" aria-labelledby="fax-folders-label">
            {faxFolders.map((folder, index) => (
              <div key={index} className="folder-row">
                <div className="path-field">
                  <input
                    id={index === 0 ? 'fax-folder' : `fax-folder-${index}`}
                    value={folder}
                    onChange={(e) => {
                      const value = e.target.value
                      setFaxFolders((prev) => {
                        const next = [...prev]
                        next[index] = value
                        return next
                      })
                    }}
                    placeholder="Pfad zum Eingangsordner"
                    aria-label={`Eingangsordner ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void pick(index)}
                    title="Ordner wählen"
                    aria-label="Ordner wählen"
                  >
                    …
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost folder-remove"
                    onClick={() => removeFolder(index)}
                    disabled={faxFolders.length <= 1 && !folder.trim()}
                    title="Ordner entfernen"
                    aria-label="Ordner entfernen"
                  >
                    −
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost folder-add"
            onClick={addFolder}
            title="Weiteren Ordner hinzufügen"
          >
            + Ordner hinzufügen
          </button>
        </div>

        <div className="field">
          <span className="field-label" id="state-folder-label">
            Status-Datenbank (Multi-Client)
          </span>
          <p className="field-hint">
            Gemeinsamer Ordner für <strong>gelesen / gedruckt / exportiert / Zuweisung / Benutzer</strong>{' '}
            (Datei <code>inbox-state.json</code>). Alle PCs wählen denselben Netzwerkordner — dann sind
            Marker, Benutzerliste und Zuweisungen überall synchron. Leer = nur lokal auf diesem PC.
          </p>
          <div className="path-field">
            <input
              id="state-folder"
              value={stateFolder}
              onChange={(e) => setStateFolder(e.target.value)}
              placeholder="z. B. \\Server\FaxInbox-Status oder /mnt/share/fax-status"
              aria-labelledby="state-folder-label"
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void pickState()}
              title="Ordner wählen"
              aria-label="Statusordner wählen"
            >
              …
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label" id="app-mode-label">
            App-Modus
          </span>
          <p className="field-hint">
            <strong>Empfang</strong> sieht alle Dokumente und weist Nutzer zu.{' '}
            <strong>Empfänger</strong> sieht nur die ihm zugewiesenen Dokumente.
          </p>
          <div className="radio-group" role="radiogroup" aria-labelledby="app-mode-label">
            <label className="radio-row">
              <input
                type="radio"
                name="app-mode"
                checked={appMode === 'reception'}
                onChange={() => setAppMode('reception')}
              />
              <span>Empfang / Sortierung / Zentrale</span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="app-mode"
                checked={appMode === 'recipient'}
                onChange={() => setAppMode('recipient')}
              />
              <span>Empfänger / Ausführender</span>
            </label>
          </div>
          {appMode === 'recipient' ? (
            <>
              <label htmlFor="client-user-name" style={{ marginTop: 10 }}>
                Dieser Client ist
              </label>
              <select
                id="client-user-name"
                value={clientUserName}
                onChange={(e) => setClientUserName(e.target.value)}
                aria-label="Benutzer für diesen Client"
              >
                <option value="">— Benutzer wählen —</option>
                {users.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {users.length === 0 ? (
                <p className="field-hint">Zuerst unten Benutzer anlegen (idealerweise über den Statusordner).</p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="field">
          <span className="field-label" id="users-label">
            Benutzer für Zuordnung
          </span>
          <p className="field-hint">
            Zentrale Liste in der Status-Datei. Am Empfang werden Dokumente diesen Namen zugewiesen.
          </p>
          <div className="user-add-row">
            <input
              id="new-user-name"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addUser()
                }
              }}
              placeholder="z. B. Max Mustermann"
              aria-labelledby="users-label"
              disabled={usersBusy}
            />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={usersBusy || !newUserName.trim()}
              onClick={() => void addUser()}
            >
              Hinzufügen
            </button>
          </div>
          {usersError ? (
            <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{usersError}</p>
          ) : null}
          {users.length === 0 ? (
            <p className="field-hint">Noch keine Benutzer angelegt.</p>
          ) : (
            <ul className="user-list" aria-label="Benutzerliste">
              {users.map((u) => (
                <li key={u} className="user-list-item">
                  <span>{u}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-danger"
                    disabled={usersBusy}
                    onClick={() => void removeUser(u)}
                    aria-label={`${u} entfernen`}
                  >
                    Entfernen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="field">
          <span className="field-label" id="auto-archive-label">
            Auto-Archiv
          </span>
          <p className="field-hint">
            Gelesene Dokumente, die älter als die gewählte Anzahl Tage sind, werden automatisch in
            den Archiv-Ordner verschoben (beim Start und alle 5 Minuten).
          </p>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoArchiveEnabled}
              onChange={(e) => setAutoArchiveEnabled(e.target.checked)}
              aria-labelledby="auto-archive-label"
            />
            <span>Auto-Archiv aktiv</span>
          </label>
          <label htmlFor="auto-archive-days" style={{ marginTop: 10 }}>
            Nach Tagen (gelesen)
          </label>
          <input
            id="auto-archive-days"
            type="number"
            min={1}
            max={365}
            value={autoArchiveAfterDays}
            disabled={!autoArchiveEnabled}
            onChange={(e) => setAutoArchiveAfterDays(Number(e.target.value))}
          />
        </div>

        <div className="field">
          <span className="field-label" id="export-folder-label">
            Export / Kopieren
          </span>
          <p className="field-hint">
            Zusätzlicher Button neben <strong>Drucken</strong>: kopiert das gewählte Dokument dauerhaft
            in einen Ordner deiner Wahl (z. B. T2 med, Dokumente, …). Name des Buttons ist frei
            wählbar.
          </p>
          <label htmlFor="export-button-label">Button-Beschriftung</label>
          <input
            id="export-button-label"
            value={exportButtonLabel}
            onChange={(e) => setExportButtonLabel(e.target.value)}
            placeholder="In Ordner kopieren"
            aria-labelledby="export-folder-label"
          />
          <label htmlFor="export-folder" style={{ marginTop: 10 }}>
            Zielordner
          </label>
          <div className="path-field">
            <input
              id="export-folder"
              value={exportFolder}
              onChange={(e) => setExportFolder(e.target.value)}
              placeholder="Ordner zum Kopieren wählen"
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void pickExport()}
              title="Ordner wählen"
              aria-label="Exportordner wählen"
            >
              …
            </button>
          </div>
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
            <label className={`radio-row ${!supportsDirectPrint ? 'is-disabled' : ''}`}>
              <input
                type="radio"
                name="printMethod"
                value="direct"
                checked={printMethod === 'direct'}
                disabled={!supportsDirectPrint}
                onChange={() => setPrintMethod('direct')}
              />
              <span>
                Direkt auf festen Drucker drucken
                <span className="radio-hint">
                  {supportsDirectPrint
                    ? isWindows
                      ? 'ohne Dialog, mit den Optionen unten (Windows)'
                      : 'ohne Dialog über CUPS, mit den Optionen unten (Ubuntu)'
                    : 'nur unter Windows und Ubuntu verfügbar'}
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
                  {isWindows
                    ? 'Keine Drucker gefunden. Windows-Drucker prüfen und Liste aktualisieren.'
                    : 'Keine Drucker gefunden. CUPS prüfen (`lpstat -a`) und Liste aktualisieren.'}
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
              : platform === 'linux'
                ? ' — Update per Klick: .deb mit Passwort-Abfrage, AppImage mit Neustart.'
                : ' — Updates über GitHub Releases.'}
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
                Jetzt installieren
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
