import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FaxItem } from '../../shared/types'
import PdfPreview from './PdfPreview'
import RenameDialog from './RenameDialog'

type ViewMode = 'inbox' | 'archive'
type DayBucket = 'heute' | 'gestern' | 'vorgestern' | 'spaeter'

type Props = {
  items: FaxItem[]
  unreadCount: number
  faxFolder: string
  focusPath: string | null
  focusNewestToken: number
  onOpenSettings: () => void
  onItemsChange: (items: FaxItem[]) => void
  onConsumedFocusPath: () => void
}

const BUCKET_ORDER: DayBucket[] = ['heute', 'gestern', 'vorgestern', 'spaeter']
const BUCKET_LABEL: Record<DayBucket, string> = {
  heute: 'Heute',
  gestern: 'Gestern',
  vorgestern: 'Vorgestern',
  spaeter: 'Später',
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function bucketFor(iso: string, now = new Date()): DayBucket {
  const day = startOfLocalDay(new Date(iso))
  const today = startOfLocalDay(now)
  const diffDays = Math.round((today - day) / 86_400_000)
  if (diffDays <= 0) return 'heute'
  if (diffDays === 1) return 'gestern'
  if (diffDays === 2) return 'vorgestern'
  return 'spaeter'
}

function groupByDay(items: FaxItem[]): Array<{ key: DayBucket; label: string; items: FaxItem[] }> {
  const buckets = new Map<DayBucket, FaxItem[]>()
  for (const key of BUCKET_ORDER) buckets.set(key, [])
  for (const item of items) {
    buckets.get(bucketFor(item.addedAt))!.push(item)
  }
  return BUCKET_ORDER.map((key) => ({
    key,
    label: BUCKET_LABEL[key],
    items: buckets.get(key)!,
  })).filter((g) => g.items.length > 0)
}

function formatWhen(iso: string, bucket: DayBucket): string {
  const d = new Date(iso)
  if (bucket === 'heute' || bucket === 'gestern' || bucket === 'vorgestern') {
    return new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  }
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export default function Inbox({
  items,
  unreadCount,
  faxFolder,
  focusPath,
  focusNewestToken,
  onOpenSettings,
  onItemsChange,
  onConsumedFocusPath,
}: Props) {
  const [view, setView] = useState<ViewMode>('inbox')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(
    () => items.filter((i) => (view === 'archive' ? i.archived : !i.archived)),
    [items, view],
  )

  const groups = useMemo(() => groupByDay(visible), [visible])

  const selected = items.find((i) => i.path === selectedPath) ?? null
  const selectedVisible = selected && visible.some((i) => i.path === selected.path) ? selected : null

  useEffect(() => {
    if (selectedPath && !visible.some((i) => i.path === selectedPath)) {
      setSelectedPath(visible[0]?.path ?? null)
    } else if (!selectedPath && visible[0]) {
      setSelectedPath(visible[0].path)
    }
  }, [visible, selectedPath])

  const selectItem = useCallback(
    async (item: FaxItem) => {
      setSelectedPath(item.path)
      if (item.seenAt === null && !item.archived) {
        const next = await window.faxInbox.markSeen(item.path)
        onItemsChange(next)
      }
    },
    [onItemsChange],
  )

  useEffect(() => {
    if (!focusPath) return
    const target = items.find((i) => i.path === focusPath)
    if (target) {
      setView(target.archived ? 'archive' : 'inbox')
      void selectItem(target)
      // Scroll selected into view after paint
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-path="${CSS.escape(focusPath)}"]`)
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    }
    onConsumedFocusPath()
  }, [focusPath, items, onConsumedFocusPath, selectItem])

  useEffect(() => {
    if (focusNewestToken > 0) {
      setView('inbox')
      const newest = items.find((i) => !i.archived)
      if (newest) void selectItem(newest)
    }
  }, [focusNewestToken, items, selectItem])

  const print = useCallback(async () => {
    if (!selectedVisible) return
    setPrinting(true)
    try {
      await window.faxInbox.printFax(selectedVisible.path)
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Druck fehlgeschlagen'
      window.alert(`Drucken fehlgeschlagen:\n\n${msg}`)
    } finally {
      setPrinting(false)
    }
  }, [selectedVisible])

  const remove = useCallback(async () => {
    if (!selectedVisible) return
    const result = await window.faxInbox.deleteFax(selectedVisible.path)
    if (result.deleted) {
      onItemsChange(result.items)
      const nextVisible = result.items.filter((i) =>
        view === 'archive' ? i.archived : !i.archived,
      )
      setSelectedPath(nextVisible[0]?.path ?? null)
    }
  }, [selectedVisible, onItemsChange, view])

  const archiveOrRestore = useCallback(async () => {
    if (!selectedVisible) return
    try {
      const result = selectedVisible.archived
        ? await window.faxInbox.restoreFax(selectedVisible.path)
        : await window.faxInbox.archiveFax(selectedVisible.path)
      onItemsChange(result.items)
      const nextVisible = result.items.filter((i) =>
        view === 'archive' ? i.archived : !i.archived,
      )
      setSelectedPath(nextVisible[0]?.path ?? null)
    } catch (err) {
      console.error(err)
    }
  }, [selectedVisible, onItemsChange, view])

  const toggleSeen = useCallback(async () => {
    if (!selectedVisible) return
    const next =
      selectedVisible.seenAt === null
        ? await window.faxInbox.markSeen(selectedVisible.path)
        : await window.faxInbox.markUnseen(selectedVisible.path)
    onItemsChange(next)
  }, [selectedVisible, onItemsChange])

  const handleRename = useCallback(
    async (newName: string) => {
      if (!selectedVisible) return
      const result = await window.faxInbox.renameFax(selectedVisible.path, newName)
      onItemsChange(result.items)
      setSelectedPath(result.path)
      setRenaming(false)
    },
    [selectedVisible, onItemsChange],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (renaming) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        void print()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        if (selectedVisible) setRenaming(true)
        return
      }

      if (e.key === 'Delete') {
        if (selectedVisible) {
          e.preventDefault()
          void remove()
        }
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (visible.length === 0) return
        const idx = visible.findIndex((i) => i.path === selectedPath)
        const nextIdx =
          e.key === 'ArrowDown'
            ? Math.min(visible.length - 1, Math.max(0, idx) + 1)
            : Math.max(0, (idx < 0 ? 0 : idx) - 1)
        void selectItem(visible[nextIdx])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, selectedVisible, selectedPath, print, remove, selectItem, renaming])

  const switchView = (mode: ViewMode) => {
    setView(mode)
    const list = items.filter((i) => (mode === 'archive' ? i.archived : !i.archived))
    setSelectedPath(list[0]?.path ?? null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Fax Inbox</h1>
        {unreadCount > 0 && (
          <span className="unread-pill">
            {unreadCount === 1 ? '1 ungelesen' : `${unreadCount} ungelesen`}
          </span>
        )}
        <div className="topbar-spacer" />
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Einstellungen"
          title="Einstellungen"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M19.4 13a7.8 7.8 0 0 0 .05-2l2.05-1.6-2-3.46-2.45.8a7.7 7.7 0 0 0-1.73-1L15 3.5h-6l-.37 2.24a7.7 7.7 0 0 0-1.73 1l-2.45-.8-2 3.46L4.55 11a7.8 7.8 0 0 0 0 2l-2.05 1.6 2 3.46 2.45-.8c.53.42 1.11.76 1.73 1L9 20.5h6l.37-2.24a7.7 7.7 0 0 0 1.73-1l2.45.8 2-3.46L19.4 13Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <div className="shell">
        <aside className="list-pane">
          <div className="view-switch" role="tablist" aria-label="Ansicht">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'inbox'}
              className={`view-tab ${view === 'inbox' ? 'is-active' : ''}`}
              onClick={() => switchView('inbox')}
            >
              Posteingang
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'archive'}
              className={`view-tab ${view === 'archive' ? 'is-active' : ''}`}
              onClick={() => switchView('archive')}
            >
              Archiv
            </button>
          </div>
          <div className="list-scroll" ref={listRef} role="listbox" aria-label="Faxliste">
            {visible.length === 0 ? (
              <div className="empty" style={{ paddingTop: 40 }}>
                <p>{view === 'archive' ? 'Archiv ist leer.' : 'Noch keine Faxe.'}</p>
                {view === 'inbox' && <p className="path">Überwacht: {faxFolder}</p>}
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.key} className="list-group" aria-label={group.label}>
                  <div className="list-group-banner" role="presentation">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const unread = item.seenAt === null && !item.archived
                    const selectedCls = item.path === selectedPath ? 'is-selected' : ''
                    return (
                      <button
                        key={item.path}
                        type="button"
                        role="option"
                        data-path={item.path}
                        aria-selected={item.path === selectedPath}
                        className={`list-item ${unread ? 'is-unread' : ''} ${selectedCls}`}
                        onClick={() => void selectItem(item)}
                      >
                        <span className="dot" aria-hidden />
                        <span className="item-name">{item.name}</span>
                        <span className="item-meta">{formatWhen(item.addedAt, group.key)}</span>
                      </button>
                    )
                  })}
                </section>
              ))
            )}
          </div>
        </aside>

        <section className="preview-pane">
          {selectedVisible ? (
            <>
              <div className="action-bar">
                <span className="file-label" title={selectedVisible.name}>
                  {selectedVisible.name}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => setRenaming(true)}>
                  Umbenennen
                </button>
                {!selectedVisible.archived && (
                  <button type="button" className="btn btn-ghost" onClick={() => void toggleSeen()}>
                    {selectedVisible.seenAt === null ? 'Als gelesen' : 'Als ungelesen'}
                  </button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => void archiveOrRestore()}>
                  {selectedVisible.archived ? 'Wiederherstellen' : 'Archivieren'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={printing}
                  onClick={() => void print()}
                >
                  Drucken
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => void remove()}
                >
                  Löschen
                </button>
              </div>
              <PdfPreview filePath={selectedVisible.path} />
            </>
          ) : (
            <div className="empty">
              <h2>Nichts ausgewählt</h2>
              <p>
                {view === 'archive'
                  ? 'Archivierte Faxe erscheinen hier nach dem Archivieren.'
                  : 'Wähle ein Fax links, oder warte auf neue PDFs im überwachten Ordner.'}
              </p>
              <p className="path">{faxFolder}</p>
            </div>
          )}
        </section>
      </div>

      {renaming && selectedVisible && (
        <RenameDialog
          currentName={selectedVisible.name}
          onCancel={() => setRenaming(false)}
          onConfirm={(name) => void handleRename(name)}
        />
      )}
    </div>
  )
}
