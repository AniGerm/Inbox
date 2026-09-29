import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, FaxItem } from '../shared/types'
import Setup from './components/Setup'
import Inbox from './components/Inbox'
import SettingsPanel from './components/SettingsPanel'

export default function App() {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [items, setItems] = useState<FaxItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [focusPath, setFocusPath] = useState<string | null>(null)
  const [focusNewestToken, setFocusNewestToken] = useState(0)

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
