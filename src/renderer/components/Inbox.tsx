import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppMode, ExportStatus, FaxItem, PrintStatus } from '../../shared/types'
import {
  collectAllTags,
  itemMatchesFilters,
  itemMatchesQuery,
  type ListFilters,
} from '../../shared/search'
import PdfPreview from './PdfPreview'
import RenameDialog from './RenameDialog'
import AssignDialog from './AssignDialog'
import NoteDialog from './NoteDialog'
import TagsDialog from './TagsDialog'

type ViewMode = 'inbox' | 'archive'
type DayBucket = 'heute' | 'gestern' | 'vorgestern' | 'spaeter'

type Props = {
  items: FaxItem[]
  unreadCount: number
  faxFolder: string
  faxFolders?: string[]
  exportButtonLabel: string
  exportFolder: string | null
  appMode: AppMode
  clientUserName: string | null
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

const EMPTY_FILTERS: ListFilters = {
  unreadOnly: false,
  priorityOnly: false,
  withNoteOnly: false,
  unassignedOnly: false,
  tag: null,
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

function sortGroupItems(items: FaxItem[]): FaxItem[] {
  return [...items].sort((a, b) => {
    const p = Number(!!b.priority) - Number(!!a.priority)
    if (p !== 0) return p
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  })
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
    items: sortGroupItems(buckets.get(key)!),
  })).filter((g) => g.items.length > 0)
}

function formatWhen(iso: string, bucket: DayBucket): string {
  const d = new Date(iso)
  const time = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  if (bucket === 'heute') return `heute, ${time} Uhr`
  if (bucket === 'gestern') return `gestern, ${time} Uhr`
  if (bucket === 'vorgestern') return `vorgestern, ${time} Uhr`
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function formatPrintedAt(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function formatPrintedAtShort(iso: string): string {
  const d = new Date(iso)
  const time = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  const bucket = bucketFor(iso)
  if (bucket === 'heute') return `heute ${time}`
  if (bucket === 'gestern') return `gestern ${time}`
  if (bucket === 'vorgestern') return `vorgestern ${time}`
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function formatReprintConfirm(printedAt: string): string {
  const d = new Date(printedAt)
  const date = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  return `Du hast dieses Dokument bereits am ${date} um ${time} Uhr gedruckt.\n\nMöchtest du es erneut drucken?`
}

function printStatusLabel(item: FaxItem): string {
  const status: PrintStatus = item.printStatus ?? 'none'
  switch (status) {
    case 'printing':
      return 'Wird gedruckt…'
    case 'printed':
      return item.printedAt ? `Gedruckt ${formatPrintedAt(item.printedAt)}` : 'Gedruckt'
    case 'error':
      return 'Druck fehlgeschlagen'
    default:
      return 'Noch nicht gedruckt'
  }
}

function exportStatusLabel(item: FaxItem): string {
  const status: ExportStatus = item.exportStatus ?? 'none'
  switch (status) {
    case 'exporting':
      return 'Wird kopiert…'
    case 'exported':
      return item.exportedAt ? `Exportiert ${formatPrintedAt(item.exportedAt)}` : 'Exportiert'
    case 'error':
      return 'Export fehlgeschlagen'
    default:
      return 'Noch nicht exportiert'
  }
}

function formatReexportConfirm(exportedAt: string): string {
  const d = new Date(exportedAt)
  const date = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  return `Du hast dieses Dokument bereits am ${date} um ${time} Uhr exportiert.\n\nMöchtest du es erneut kopieren?`
}

function PrinterIcon({ slashed = false }: { slashed?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 9V5h10v4M7 15H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M7 14h10v5H7v-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {slashed ? (
        <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  )
}

function StorageIcon({ slashed = false }: { slashed?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="15.5" r="1.1" fill="currentColor" />
      {slashed ? (
        <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  )
}

function StatusSpinner() {
  return (
    <svg className="print-status-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function StatusCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 13.5 9.5 18 19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StatusError() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
    </svg>
  )
}

function PrintStatusIcon({ status }: { status: PrintStatus }) {
  if (status === 'printing') return <StatusSpinner />
  if (status === 'printed') return <StatusCheck />
  if (status === 'error') return <StatusError />
  return <PrinterIcon slashed />
}

function ExportStatusIcon({ status }: { status: ExportStatus }) {
  if (status === 'exporting') return <StatusSpinner />
  if (status === 'exported') return <StatusCheck />
  if (status === 'error') return <StatusError />
  return <StorageIcon slashed />
}

function UserIcon({ slashed = false }: { slashed?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 19.5c1.2-3.2 3.5-4.8 7-4.8s5.8 1.6 7 4.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {slashed ? (
        <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  )
}

function FlagIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 21V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M5 4h11l-2.2 3.5L16 11H5V4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
        opacity={filled ? 0.9 : 1}
      />
    </svg>
  )
}

function PostItIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4h9l5 5v11H6V4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path d="M15 4v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function assignmentStatusLabel(item: FaxItem): string {
  if (item.assignedTo) {
    return item.assignedAt
      ? `Zugewiesen an ${item.assignedTo} · ${formatPrintedAt(item.assignedAt)}`
      : `Zugewiesen an ${item.assignedTo}`
  }
  return 'Nicht zugewiesen'
}

export default function Inbox({
  items,
  unreadCount,
  faxFolder,
  faxFolders,
  exportButtonLabel,
  exportFolder,
  appMode,
  clientUserName,
  focusPath,
  focusNewestToken,
  onOpenSettings,
  onItemsChange,
  onConsumedFocusPath,
}: Props) {
  const [view, setView] = useState<ViewMode>('inbox')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignUsers, setAssignUsers] = useState<string[]>([])
  const [assignTargets, setAssignTargets] = useState<string[] | null>(null)
  const [noteEditing, setNoteEditing] = useState(false)
  const [tagsEditing, setTagsEditing] = useState(false)
  const [tagsTargets, setTagsTargets] = useState<string[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS)
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => new Set())
  const lastClickedPath = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const isReception = appMode !== 'recipient'
  const recipientName = clientUserName?.trim() || null

  const roleFiltered = useMemo(() => {
    if (isReception) return items
    if (!recipientName) return []
    return items.filter((i) => i.assignedTo === recipientName)
  }, [items, isReception, recipientName])

  const archiveScoped = useMemo(
    () => roleFiltered.filter((i) => (view === 'archive' ? i.archived : !i.archived)),
    [roleFiltered, view],
  )

  const visible = useMemo(() => {
    return archiveScoped.filter(
      (i) => itemMatchesQuery(i, query) && itemMatchesFilters(i, filters),
    )
  }, [archiveScoped, query, filters])

  const tagSuggestions = useMemo(() => collectAllTags(roleFiltered), [roleFiltered])

  const displayUnread = useMemo(() => {
    if (isReception) return unreadCount
    return roleFiltered.filter((i) => !i.archived && i.seenAt === null).length
  }, [isReception, unreadCount, roleFiltered])

  const groups = useMemo(() => groupByDay(visible), [visible])

  const selected = roleFiltered.find((i) => i.path === selectedPath) ?? null
  const selectedVisible =
    selected && visible.some((i) => i.path === selected.path) ? selected : null

  const selectedCount = selectedSet.size
  const dialogOpen = renaming || assigning || noteEditing || tagsEditing

  useEffect(() => {
    if (selectedPath && !visible.some((i) => i.path === selectedPath)) {
      setSelectedPath(visible[0]?.path ?? null)
    } else if (!selectedPath && visible[0]) {
      setSelectedPath(visible[0].path)
    }
  }, [visible, selectedPath])

  useEffect(() => {
    setSelectedSet((prev) => {
      const next = new Set<string>()
      for (const p of prev) {
        if (visible.some((i) => i.path === p)) next.add(p)
      }
      return next.size === prev.size ? prev : next
    })
  }, [visible])

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
    const target = roleFiltered.find((i) => i.path === focusPath)
    if (target) {
      setView(target.archived ? 'archive' : 'inbox')
      void selectItem(target)
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-path="${CSS.escape(focusPath)}"]`)
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    }
    onConsumedFocusPath()
  }, [focusPath, roleFiltered, onConsumedFocusPath, selectItem])

  useEffect(() => {
    if (focusNewestToken <= 0) return
    setView('inbox')
    const newest = roleFiltered.find((i) => !i.archived)
    if (newest) void selectItem(newest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNewestToken])

  const print = useCallback(async () => {
    if (!selectedVisible) return
    if (selectedVisible.printStatus === 'printed' && selectedVisible.printedAt) {
      const ok = window.confirm(formatReprintConfirm(selectedVisible.printedAt))
      if (!ok) return
    }
    try {
      await window.faxInbox.printPreview(selectedVisible.path)
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Druck fehlgeschlagen'
      window.alert(`Drucken fehlgeschlagen:\n\n${msg}`)
    }
  }, [selectedVisible])

  const exportCopy = useCallback(async () => {
    if (!selectedVisible) return
    if (!exportFolder?.trim()) {
      const go = window.confirm(
        'Noch kein Exportordner gesetzt.\n\nEinstellungen öffnen, um Ordner und Button-Namen festzulegen?',
      )
      if (go) onOpenSettings()
      return
    }
    if (selectedVisible.exportStatus === 'exported' && selectedVisible.exportedAt) {
      const ok = window.confirm(formatReexportConfirm(selectedVisible.exportedAt))
      if (!ok) return
    }
    setExporting(true)
    try {
      const result = await window.faxInbox.exportFax(selectedVisible.path)
      onItemsChange(result.items)
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Kopieren fehlgeschlagen'
      window.alert(`Kopieren fehlgeschlagen:\n\n${msg}`)
    } finally {
      setExporting(false)
    }
  }, [selectedVisible, exportFolder, onOpenSettings, onItemsChange])

  const applyRoleFilter = useCallback(
    (list: FaxItem[]) => {
      if (isReception) return list
      if (!recipientName) return []
      return list.filter((i) => i.assignedTo === recipientName)
    },
    [isReception, recipientName],
  )

  const remove = useCallback(async () => {
    if (!selectedVisible) return
    const result = await window.faxInbox.deleteFax(selectedVisible.path)
    if (result.deleted) {
      onItemsChange(result.items)
      const nextVisible = applyRoleFilter(result.items).filter((i) =>
        view === 'archive' ? i.archived : !i.archived,
      )
      setSelectedPath(nextVisible[0]?.path ?? null)
      setSelectedSet((prev) => {
        const next = new Set(prev)
        next.delete(selectedVisible.path)
        return next
      })
    }
  }, [selectedVisible, onItemsChange, view, applyRoleFilter])

  const archiveOrRestore = useCallback(async () => {
    if (!selectedVisible) return
    try {
      const result = selectedVisible.archived
        ? await window.faxInbox.restoreFax(selectedVisible.path)
        : await window.faxInbox.archiveFax(selectedVisible.path)
      onItemsChange(result.items)
      const nextVisible = applyRoleFilter(result.items).filter((i) =>
        view === 'archive' ? i.archived : !i.archived,
      )
      setSelectedPath(nextVisible[0]?.path ?? null)
    } catch (err) {
      console.error(err)
    }
  }, [selectedVisible, onItemsChange, view, applyRoleFilter])

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

  const openAssign = useCallback(
    async (paths?: string[]) => {
      if (!isReception) return
      try {
        const list =
          typeof window.faxInbox.getUsers === 'function'
            ? await window.faxInbox.getUsers()
            : []
        setAssignUsers(list)
      } catch (err) {
        console.error(err)
        setAssignUsers([])
      }
      setAssignTargets(paths ?? null)
      setAssigning(true)
    },
    [isReception],
  )

  const handleAssign = useCallback(
    async (userName: string | null) => {
      const targets = assignTargets ?? (selectedVisible ? [selectedVisible.path] : [])
      if (targets.length === 0) return
      const next =
        targets.length === 1
          ? await window.faxInbox.assignFax(targets[0], userName)
          : await window.faxInbox.assignMany(targets, userName)
      onItemsChange(next)
      setAssigning(false)
      setAssignTargets(null)
      setSelectedSet(new Set())
    },
    [assignTargets, selectedVisible, onItemsChange],
  )

  const togglePriority = useCallback(async () => {
    if (!selectedVisible) return
    const next = await window.faxInbox.setPriority(
      selectedVisible.path,
      !selectedVisible.priority,
    )
    onItemsChange(next)
  }, [selectedVisible, onItemsChange])

  const handleNote = useCallback(
    async (note: string | null) => {
      if (!selectedVisible) return
      const next = await window.faxInbox.setNote(selectedVisible.path, note)
      onItemsChange(next)
      setNoteEditing(false)
    },
    [selectedVisible, onItemsChange],
  )

  const handleTags = useCallback(
    async (tags: string[]) => {
      const targets = tagsTargets ?? (selectedVisible ? [selectedVisible.path] : [])
      if (targets.length === 0) return
      const next =
        targets.length === 1
          ? await window.faxInbox.setTags(targets[0], tags)
          : await window.faxInbox.setTagsMany(targets, tags, 'add')
      onItemsChange(next)
      setTagsEditing(false)
      setTagsTargets(null)
      if (targets.length > 1) setSelectedSet(new Set())
    },
    [tagsTargets, selectedVisible, onItemsChange],
  )

  const toggleSelect = useCallback((path: string, shiftKey: boolean) => {
    setSelectedSet((prev) => {
      const next = new Set(prev)
      if (shiftKey && lastClickedPath.current) {
        const paths = visible.map((i) => i.path)
        const a = paths.indexOf(lastClickedPath.current)
        const b = paths.indexOf(path)
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a]
          for (let i = from; i <= to; i += 1) next.add(paths[i])
          return next
        }
      }
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    lastClickedPath.current = path
  }, [visible])

  const selectAllVisible = () => {
    setSelectedSet(new Set(visible.map((i) => i.path)))
  }

  const clearSelection = () => setSelectedSet(new Set())

  const bulkPriority = async (priority: boolean) => {
    const paths = [...selectedSet]
    if (paths.length === 0) return
    const next = await window.faxInbox.setPriorityMany(paths, priority)
    onItemsChange(next)
    clearSelection()
  }

  const bulkArchive = async () => {
    const paths = [...selectedSet]
    if (paths.length === 0) return
    const next = await window.faxInbox.archiveMany(paths)
    onItemsChange(next)
    clearSelection()
  }

  const bulkExport = async () => {
    const paths = [...selectedSet]
    if (paths.length === 0) return
    if (!exportFolder?.trim()) {
      const go = window.confirm(
        'Noch kein Exportordner gesetzt.\n\nEinstellungen öffnen?',
      )
      if (go) onOpenSettings()
      return
    }
    setExporting(true)
    try {
      let latest = items
      for (const p of paths) {
        const result = await window.faxInbox.exportFax(p)
        latest = result.items
      }
      onItemsChange(latest)
      clearSelection()
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Kopieren fehlgeschlagen'
      window.alert(`Stapel-Export fehlgeschlagen:\n\n${msg}`)
    } finally {
      setExporting(false)
    }
  }

  const bulkDelete = async () => {
    const paths = [...selectedSet]
    if (paths.length === 0) return
    const result = await window.faxInbox.deleteMany(paths)
    if (result.deleted) {
      onItemsChange(result.items)
      clearSelection()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return

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

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAllVisible()
        return
      }

      if (e.key === 'Delete') {
        if (selectedCount > 0) {
          e.preventDefault()
          void bulkDelete()
        } else if (selectedVisible) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedVisible, selectedPath, print, remove, selectItem, dialogOpen, selectedCount])

  const switchView = (mode: ViewMode) => {
    setView(mode)
    clearSelection()
    const list = roleFiltered.filter((i) => (mode === 'archive' ? i.archived : !i.archived))
    setSelectedPath(list[0]?.path ?? null)
  }

  const toggleFilter = (key: keyof Omit<ListFilters, 'tag'>) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const filtersActive =
    filters.unreadOnly ||
    filters.priorityOnly ||
    filters.withNoteOnly ||
    filters.unassignedOnly ||
    !!filters.tag ||
    !!query.trim()

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Inbox</h1>
        {displayUnread > 0 && (
          <span className="unread-pill">
            {displayUnread === 1 ? '1 ungelesen' : `${displayUnread} ungelesen`}
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

          <div className="list-tools">
            <input
              className="search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Suche Name, Notiz, Tag, Nutzer…"
              aria-label="Suche"
            />
            <div className="filter-chips" role="group" aria-label="Filter">
              <button
                type="button"
                className={`chip ${filters.unreadOnly ? 'is-active' : ''}`}
                onClick={() => toggleFilter('unreadOnly')}
              >
                Ungelesen
              </button>
              <button
                type="button"
                className={`chip ${filters.priorityOnly ? 'is-active' : ''}`}
                onClick={() => toggleFilter('priorityOnly')}
              >
                Priorität
              </button>
              <button
                type="button"
                className={`chip ${filters.withNoteOnly ? 'is-active' : ''}`}
                onClick={() => toggleFilter('withNoteOnly')}
              >
                Mit Notiz
              </button>
              {isReception ? (
                <button
                  type="button"
                  className={`chip ${filters.unassignedOnly ? 'is-active' : ''}`}
                  onClick={() => toggleFilter('unassignedOnly')}
                >
                  Nicht zugewiesen
                </button>
              ) : null}
              <select
                className="chip-select"
                value={filters.tag ?? ''}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    tag: e.target.value ? e.target.value : null,
                  }))
                }
                aria-label="Tag-Filter"
              >
                <option value="">Alle Tags</option>
                {tagSuggestions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {filtersActive ? (
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    setQuery('')
                    setFilters(EMPTY_FILTERS)
                  }}
                >
                  Zurücksetzen
                </button>
              ) : null}
            </div>
            <div className="select-tools">
              <button type="button" className="btn btn-ghost btn-tiny" onClick={selectAllVisible}>
                Alle sichtbaren
              </button>
              {selectedCount > 0 ? (
                <button type="button" className="btn btn-ghost btn-tiny" onClick={clearSelection}>
                  Auswahl aufheben ({selectedCount})
                </button>
              ) : null}
            </div>
          </div>

          {selectedCount > 0 ? (
            <div className="bulk-bar" role="toolbar" aria-label="Stapelaktionen">
              <span className="bulk-count">{selectedCount} gewählt</span>
              <button type="button" className="btn btn-ghost btn-tiny" onClick={() => void bulkPriority(true)}>
                Priorität an
              </button>
              <button type="button" className="btn btn-ghost btn-tiny" onClick={() => void bulkPriority(false)}>
                Priorität aus
              </button>
              {isReception ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-tiny"
                  onClick={() => void openAssign([...selectedSet])}
                >
                  Zuweisen
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-tiny"
                onClick={() => {
                  setTagsTargets([...selectedSet])
                  setTagsEditing(true)
                }}
              >
                Tags
              </button>
              {view === 'inbox' ? (
                <button type="button" className="btn btn-ghost btn-tiny" onClick={() => void bulkArchive()}>
                  Archivieren
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-tiny"
                disabled={exporting}
                onClick={() => void bulkExport()}
              >
                Export
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-tiny btn-danger"
                onClick={() => void bulkDelete()}
              >
                Löschen
              </button>
            </div>
          ) : null}

          <div className="list-scroll" ref={listRef} role="listbox" aria-label="Dokumentliste">
            {visible.length === 0 ? (
              <div className="empty" style={{ paddingTop: 40 }}>
                <p>
                  {view === 'archive'
                    ? 'Archiv ist leer.'
                    : !isReception && !recipientName
                      ? 'Kein Benutzer gewählt. Bitte in den Einstellungen „Dieser Client ist“ festlegen.'
                      : !isReception
                        ? `Keine zugewiesenen Dokumente für ${recipientName}.`
                        : filtersActive
                          ? 'Keine Treffer für Suche/Filter.'
                          : 'Noch keine Dokumente.'}
                </p>
                {view === 'inbox' && isReception && !filtersActive && (
                  <p className="path" title={(faxFolders ?? [faxFolder]).join('\n')}>
                    Überwacht: {faxFolder}
                  </p>
                )}
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
                    const checked = selectedSet.has(item.path)
                    const printStatus: PrintStatus = item.printStatus ?? 'none'
                    const exportStatus: ExportStatus = item.exportStatus ?? 'none'
                    const printLabel = printStatusLabel(item)
                    const exportLabel = exportStatusLabel(item)
                    const assignLabel = assignmentStatusLabel(item)
                    const printedShort =
                      printStatus === 'printed' && item.printedAt
                        ? formatPrintedAtShort(item.printedAt)
                        : null
                    const exportedShort =
                      exportStatus === 'exported' && item.exportedAt
                        ? formatPrintedAtShort(item.exportedAt)
                        : null
                    const assignedShort =
                      item.assignedTo && item.assignedAt
                        ? formatPrintedAtShort(item.assignedAt)
                        : item.assignedTo
                          ? item.assignedTo
                          : null
                    const tags = item.tags ?? []
                    return (
                      <div
                        key={item.path}
                        className={`list-item-row ${unread ? 'is-unread' : ''} ${selectedCls} ${item.priority ? 'is-priority' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="list-check"
                          checked={checked}
                          aria-label={`${item.name} auswählen`}
                          onChange={() => undefined}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSelect(item.path, e.shiftKey)
                          }}
                        />
                        <button
                          type="button"
                          role="option"
                          data-path={item.path}
                          aria-selected={item.path === selectedPath}
                          className={`list-item ${unread ? 'is-unread' : ''} ${selectedCls}`}
                          onClick={() => void selectItem(item)}
                        >
                          <span className="dot" aria-hidden />
                          <span className="item-name-block">
                            <span className="item-name">
                              {item.priority ? (
                                <span className="priority-inline" title="Priorität" aria-label="Priorität">
                                  <FlagIcon filled />
                                </span>
                              ) : null}
                              {item.name}
                            </span>
                            {tags.length > 0 ? (
                              <span className="item-tags">
                                {tags.slice(0, 2).map((t) => (
                                  <span key={t} className="tag-pill is-compact">
                                    {t}
                                  </span>
                                ))}
                                {tags.length > 2 ? (
                                  <span className="tag-pill is-compact">+{tags.length - 2}</span>
                                ) : null}
                              </span>
                            ) : null}
                            <span className="item-meta" title={`Empfangen ${formatPrintedAt(item.addedAt)}`}>
                              {formatWhen(item.addedAt, group.key)}
                            </span>
                          </span>
                          <span className="file-status" aria-hidden={false}>
                            <span
                              className={`file-status-row is-${printStatus}`}
                              title={printLabel}
                              aria-label={printLabel}
                            >
                              <PrintStatusIcon status={printStatus} />
                              {printedShort ? (
                                <span className="file-status-meta">
                                  <span className="file-status-glyph" aria-hidden>
                                    <PrinterIcon />
                                  </span>
                                  <span className="file-status-time">{printedShort}</span>
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={`file-status-row is-${exportStatus}`}
                              title={exportLabel}
                              aria-label={exportLabel}
                            >
                              <ExportStatusIcon status={exportStatus} />
                              {exportedShort ? (
                                <span className="file-status-meta">
                                  <span className="file-status-glyph" aria-hidden>
                                    <StorageIcon />
                                  </span>
                                  <span className="file-status-time">{exportedShort}</span>
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={`file-status-row ${item.assignedTo ? 'is-assigned' : 'is-unassigned'}`}
                              title={assignLabel}
                              aria-label={assignLabel}
                            >
                              {item.assignedTo ? <UserIcon /> : <UserIcon slashed />}
                              {assignedShort ? (
                                <span className="file-status-meta">
                                  <span className="file-status-glyph" aria-hidden>
                                    <UserIcon />
                                  </span>
                                  <span className="file-status-time">
                                    {item.assignedTo && item.assignedAt
                                      ? `${item.assignedTo} · ${assignedShort}`
                                      : assignedShort}
                                  </span>
                                </span>
                              ) : null}
                            </span>
                            {item.note ? (
                              <span
                                className="file-status-row is-note"
                                title={item.note}
                                aria-label={`Notiz: ${item.note}`}
                              >
                                <PostItIcon />
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </div>
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
                <button
                  type="button"
                  className={`btn btn-ghost ${selectedVisible.priority ? 'is-priority-active' : ''}`}
                  title={selectedVisible.priority ? 'Priorität entfernen' : 'Priorität setzen'}
                  onClick={() => void togglePriority()}
                >
                  <FlagIcon filled={!!selectedVisible.priority} />
                  Priorität
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setNoteEditing(true)}>
                  Notiz
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setTagsTargets(null)
                    setTagsEditing(true)
                  }}
                >
                  Tags
                </button>
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
                <button type="button" className="btn btn-primary" onClick={() => void print()}>
                  Drucken
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={exporting}
                  title={
                    exportFolder?.trim()
                      ? `Kopiert nach: ${exportFolder}`
                      : 'Exportordner in den Einstellungen festlegen'
                  }
                  onClick={() => void exportCopy()}
                >
                  {exporting ? 'Kopiere…' : exportButtonLabel.trim() || 'In Ordner kopieren'}
                </button>
                {isReception ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    title={
                      selectedVisible.assignedTo
                        ? `Zugewiesen an ${selectedVisible.assignedTo}`
                        : 'Nutzer zuweisen'
                    }
                    onClick={() => void openAssign()}
                  >
                    Nutzer zuweisen
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => void remove()}
                >
                  Löschen
                </button>
              </div>
              {selectedVisible.note ? (
                <div className="note-banner" title={selectedVisible.note}>
                  <PostItIcon />
                  <span>{selectedVisible.note}</span>
                </div>
              ) : null}
              <PdfPreview filePath={selectedVisible.path} />
            </>
          ) : (
            <div className="empty">
              <h2>Nichts ausgewählt</h2>
              <p>
                {view === 'archive'
                  ? 'Archivierte Dokumente erscheinen hier nach dem Archivieren.'
                  : !isReception && !recipientName
                    ? 'In den Einstellungen Modus Empfänger und Benutzer wählen.'
                    : !isReception
                      ? 'Sobald der Empfang ein Dokument zuweist, erscheint es hier.'
                      : 'Wähle ein Dokument links, oder warte auf neue PDFs im überwachten Ordner.'}
              </p>
              {isReception ? <p className="path">{faxFolder}</p> : null}
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
      {assigning && isReception && (
        <AssignDialog
          currentAssignee={
            assignTargets && assignTargets.length === 1
              ? roleFiltered.find((i) => i.path === assignTargets[0])?.assignedTo ?? null
              : selectedVisible && !assignTargets
                ? selectedVisible.assignedTo
                : null
          }
          users={assignUsers}
          onCancel={() => {
            setAssigning(false)
            setAssignTargets(null)
          }}
          onAssign={(userName) => void handleAssign(userName)}
        />
      )}
      {noteEditing && selectedVisible && (
        <NoteDialog
          initialNote={selectedVisible.note}
          onCancel={() => setNoteEditing(false)}
          onConfirm={(note) => void handleNote(note)}
        />
      )}
      {tagsEditing && (
        <TagsDialog
          initialTags={
            tagsTargets && tagsTargets.length === 1
              ? roleFiltered.find((i) => i.path === tagsTargets[0])?.tags ?? []
              : tagsTargets
                ? []
                : selectedVisible?.tags ?? []
          }
          suggestions={tagSuggestions}
          title={tagsTargets && tagsTargets.length > 1 ? 'Tags hinzufügen (Stapel)' : 'Tags'}
          onCancel={() => {
            setTagsEditing(false)
            setTagsTargets(null)
          }}
          onConfirm={(tags) => void handleTags(tags)}
        />
      )}
    </div>
  )
}
