import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, FaxItem, UpdateStatusEvent } from '../shared/types'
import { normalizeFaxFolders } from '../shared/types'
import Setup from './components/Setup'
import Inbox from './components/Inbox'
import SettingsPanel from './components/SettingsPanel'

type UpdateBanner = {
  version: string
  phase: 'available' | 'downloading' | 'ready'
  percent: number | null
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [items, setItems] = useState<FaxItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [focusPath, setFocusPath] = useState<string | null>(null)
  const [focusNewestToken, setFocusNewestToken] = useState(0)
  const [updateBanner, setUpdateBanner] = useState<UpdateBanner | null>(null)
  const [restartingForUpdate, setRestartingForUpdate] = useState(false)

  const refreshInbox = useCallback(async () => {
    const snap = await window.faxInbox.getInbox()
    setItems(snap.items)
    setUnreadCount(snap.unreadCount)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const s = await window.faxInbox.getSettings()
      if (cancelled) return
      setSettings(s)
      await refreshInbox()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshInbox])

  useEffect(() => {
    const offUpdated = window.faxInbox.onInboxUpdated((snap) => {
      setItems(snap.items)
      setUnreadCount(snap.unreadCount)
    })
    const offNewest = window.faxInbox.onFocusNewest(() => {
      setFocusNewestToken((t) => t + 1)
    })
    const offItem = window.faxInbox.onFocusItem((filePath) => {
      setFocusPath(filePath)
    })
    return () => {
      offUpdated()
      offNewest()
      offItem()
    }
  }, [])

  useEffect(() => {
    if (typeof window.faxInbox.onUpdateStatus !== 'function') return
    return window.faxInbox.onUpdateStatus((event: UpdateStatusEvent) => {
      if (event.type === 'update-available') {
        setUpdateBanner({
          version: event.version,
          phase: 'available',
          percent: null,
        })
      } else if (event.type === 'download-progress') {
        setUpdateBanner((prev) =>
          prev
            ? { ...prev, phase: 'downloading', percent: event.percent }
            : {
                version: '',
                phase: 'downloading',
                percent: event.percent,
              },
        )
      } else if (event.type === 'update-downloaded') {
        setUpdateBanner({
          version: event.version,
          phase: 'ready',
          percent: 100,
        })
      } else if (event.type === 'installing') {
        setRestartingForUpdate(true)
        setShowSettings(false)
      } else if (event.type === 'error') {
        setRestartingForUpdate(false)
      }
    })
  }, [])

  const startInstallUpdate = useCallback(async () => {
    if (typeof window.faxInbox.installUpdate !== 'function') return
    setRestartingForUpdate(true)
    setShowSettings(false)
    // Let overlay paint before main shows the native dialog / quits
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => setTimeout(resolve, 80))
    try {
      await window.faxInbox.installUpdate()
    } catch (err) {
      console.error(err)
      setRestartingForUpdate(false)
    }
  }, [])

  const handleSetupComplete = async (faxFolder: string) => {
    const next = await window.faxInbox.saveSettings({
      faxFolder,
      faxFolders: [faxFolder],
    })
    setSettings(next)
    await refreshInbox()
  }

  const handleSettingsSave = async (partial: Partial<AppSettings>) => {
    const next = await window.faxInbox.saveSettings(partial)
    setSettings(next)
    setShowSettings(false)
  }

  if (!ready || !settings) {
    return <div className="loading">Laden…</div>
  }

  const watchedFolders = normalizeFaxFolders(settings)
  if (watchedFolders.length === 0) {
    return <Setup onComplete={handleSetupComplete} />
  }

  const folderLabel =
    watchedFolders.length === 1
      ? watchedFolders[0]
      : `${watchedFolders.length} Ordner`

  return (
    <>
      {updateBanner ? (
        <div className="update-banner" role="status">
          <span className="update-banner-text">
            {updateBanner.phase === 'available' &&
              `Version ${updateBanner.version} verfügbar`}
            {updateBanner.phase === 'downloading' &&
              `Update wird heruntergeladen… ${updateBanner.percent ?? 0} %`}
            {updateBanner.phase === 'ready' &&
              `Version ${updateBanner.version} bereit — per Klick installieren`}
          </span>
          <div className="update-banner-actions">
            {updateBanner.phase === 'available' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={restartingForUpdate}
                onClick={() => void window.faxInbox.downloadUpdate()}
              >
                Herunterladen
              </button>
            ) : null}
            {updateBanner.phase === 'ready' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={restartingForUpdate}
                onClick={() => void startInstallUpdate()}
              >
                Jetzt installieren
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={restartingForUpdate}
              onClick={() => setShowSettings(true)}
            >
              Einstellungen
            </button>
          </div>
        </div>
      ) : null}
      <Inbox
        items={items}
        unreadCount={unreadCount}
        faxFolder={folderLabel}
        faxFolders={watchedFolders}
        exportButtonLabel={settings.exportButtonLabel || 'In Ordner kopieren'}
        exportFolder={settings.exportFolder}
        appMode={settings.appMode === 'recipient' ? 'recipient' : 'reception'}
        clientUserName={settings.clientUserName}
        focusPath={focusPath}
        focusNewestToken={focusNewestToken}
        onOpenSettings={() => setShowSettings(true)}
        onItemsChange={(next) => {
          setItems(next)
          const mode = settings.appMode === 'recipient' ? 'recipient' : 'reception'
          const name = settings.clientUserName?.trim()
          const scoped =
            mode === 'recipient'
              ? name
                ? next.filter((i) => i.assignedTo === name)
                : []
              : next
          setUnreadCount(scoped.filter((i) => !i.archived && i.seenAt === null).length)
        }}
        onConsumedFocusPath={() => setFocusPath(null)}
      />
      {showSettings && !restartingForUpdate && (
        <SettingsPanel
          settings={settings}
          onSave={handleSettingsSave}
          onClose={() => setShowSettings(false)}
          onInstallUpdate={() => void startInstallUpdate()}
        />
      )}
      {restartingForUpdate ? (
        <div className="update-restart-overlay" role="alertdialog" aria-modal="true">
          <div className="update-restart-card">
            <h2>Update wird installiert</h2>
            <p>
              Inbox wird jetzt beendet. Unter Linux erscheint ggf. die Passwort-Abfrage
              zur Installation — bitte bestätigen. Die App startet danach automatisch neu.
            </p>
            <div className="update-restart-spinner" aria-hidden />
          </div>
        </div>
      ) : null}
    </>
  )
}
