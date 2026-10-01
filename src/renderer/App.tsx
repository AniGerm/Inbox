import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, FaxItem, UpdateStatusEvent } from '../shared/types'
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
      }
    })
  }, [])

  const handleSetupComplete = async (faxFolder: string) => {
    const next = await window.faxInbox.saveSettings({ faxFolder })
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

  if (!settings.faxFolder) {
    return <Setup onComplete={handleSetupComplete} />
  }

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
              `Version ${updateBanner.version} bereit — neu starten zum Installieren`}
          </span>
          <div className="update-banner-actions">
            {updateBanner.phase === 'available' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void window.faxInbox.downloadUpdate()}
              >
                Herunterladen
              </button>
            ) : null}
            {updateBanner.phase === 'ready' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void window.faxInbox.installUpdate()}
              >
                Jetzt neu starten und installieren
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost"
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
        faxFolder={settings.faxFolder}
        focusPath={focusPath}
        focusNewestToken={focusNewestToken}
        onOpenSettings={() => setShowSettings(true)}
        onItemsChange={(next) => {
          setItems(next)
          setUnreadCount(next.filter((i) => !i.archived && i.seenAt === null).length)
        }}
        onConsumedFocusPath={() => setFocusPath(null)}
      />
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={handleSettingsSave}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  )
}
