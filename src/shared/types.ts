export type PrintStatus = 'none' | 'printing' | 'printed' | 'error'
export type ExportStatus = 'none' | 'exporting' | 'exported' | 'error'

/** Reception = triage/central; recipient = end-user client filtered by assignment */
export type AppMode = 'reception' | 'recipient'

export interface FaxItem {
  path: string
  name: string
  addedAt: string
  seenAt: string | null
  size: number
  archived: boolean
  /** Last print attempt outcome; 'printed' means handed off to printer/viewer */
  printStatus: PrintStatus
  /** ISO timestamp of last successful handoff; null if never printed */
  printedAt: string | null
  /** Last export/copy attempt outcome */
  exportStatus: ExportStatus
  /** ISO timestamp of last successful export copy; null if never exported */
  exportedAt: string | null
  /** Assigned recipient user name from the shared users list; null = unassigned */
  assignedTo: string | null
  /** ISO timestamp of last assignment; null if never assigned */
  assignedAt: string | null
  /** High-priority flag (synced) */
  priority: boolean
  /** Free-text sticky note; null/empty = none */
  note: string | null
  /** Free-form tags */
  tags: string[]
}

export type PrintMethod = 'external' | 'direct'
export type DuplexMode = 'simplex' | 'long' | 'short'

export interface PrinterInfo {
  name: string
  isDefault: boolean
}

export interface AppSettings {
  /** Primary / first watched folder (legacy + convenience) */
  faxFolder: string | null
  /** All watched inbox folders (PDFs only, each with own Archiv/) */
  faxFolders: string[]
  notificationsEnabled: boolean
  autostart: boolean
  /** external = open PDF in OS default app; direct = silent print to fixed printer */
  printMethod: PrintMethod
  /** Direct print target (Windows / Ubuntu); empty = not configured */
  printerName: string
  duplex: DuplexMode
  /** false = monochrome / black & white */
  color: boolean
  copies: number
  paperSize: string
  /** Periodically check GitHub Releases for updates (packaged builds only) */
  autoCheckUpdates: boolean
  /** Destination folder for the action-bar export/copy button */
  exportFolder: string | null
  /** Custom label for the export button (e.g. "T2 med exportieren") */
  exportButtonLabel: string
  /**
   * Shared folder for inbox-state.json (read/print/export markers).
   * All clients that point here stay in sync. null = local userData only.
   */
  stateFolder: string | null
  /** reception = Empfang/Sortierung; recipient = Empfänger/Ausführender */
  appMode: AppMode
  /** When appMode is recipient: which shared user this client represents */
  clientUserName: string | null
  /** Move old seen documents into Archiv automatically */
  autoArchiveEnabled: boolean
  /** Age in days since addedAt before auto-archive (seen items only) */
  autoArchiveAfterDays: number
}

/** Events forwarded from electron-updater to the renderer */
export type UpdateStatusEvent =
  | { type: 'checking' }
  | { type: 'update-available'; version: string }
  | { type: 'update-not-available'; version?: string }
  | { type: 'download-progress'; percent: number }
  | { type: 'update-downloaded'; version: string }
  | { type: 'installing'; version?: string }
  | { type: 'error'; message: string }

export interface InboxStateFile {
  /** Shared user names for assignment (central list for all clients) */
  users?: string[]
  items: Array<{
    path: string
    addedAt: string
    seenAt: string | null
    archived?: boolean
    printStatus?: PrintStatus
    printedAt?: string | null
    exportStatus?: ExportStatus
    exportedAt?: string | null
    assignedTo?: string | null
    assignedAt?: string | null
    priority?: boolean
    note?: string | null
    tags?: string[]
  }>
}

export const DEFAULT_SETTINGS: AppSettings = {
  faxFolder: null,
  faxFolders: [],
  notificationsEnabled: true,
  autostart: false,
  printMethod: 'external',
  printerName: '',
  duplex: 'simplex',
  color: false,
  copies: 1,
  paperSize: 'A4',
  autoCheckUpdates: true,
  exportFolder: null,
  exportButtonLabel: 'In Ordner kopieren',
  stateFolder: null,
  appMode: 'reception',
  clientUserName: null,
  autoArchiveEnabled: false,
  autoArchiveAfterDays: 30,
}

export function normalizeAppMode(value: unknown): AppMode {
  return value === 'recipient' ? 'recipient' : 'reception'
}

export function normalizeUserName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Unique non-empty trimmed user names, stable order. */
export function normalizeUsers(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const name = entry.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/** Union of user lists (case-insensitive), stable order of first occurrence. */
export function mergeUsers(...lists: unknown[]): string[] {
  return normalizeUsers(lists.flatMap((list) => (Array.isArray(list) ? list : [])))
}

/** Unique non-empty trimmed tags, stable order (case-insensitive). */
export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const tag = entry.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

export function normalizeNote(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function normalizeAutoArchiveDays(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.autoArchiveAfterDays
  return Math.min(365, Math.max(1, Math.round(n)))
}

/** Unique non-empty folder list; prefer faxFolders, fall back to legacy faxFolder. */
export function normalizeFaxFolders(
  settings: Pick<AppSettings, 'faxFolder' | 'faxFolders'>,
): string[] {
  const fromList = Array.isArray(settings.faxFolders)
    ? settings.faxFolders.map((s) => String(s).trim()).filter(Boolean)
    : []
  const raw =
    fromList.length > 0
      ? fromList
      : settings.faxFolder?.trim()
        ? [settings.faxFolder.trim()]
        : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of raw) {
    const key = p.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

export const ARCHIVE_DIR_NAME = 'Archiv'
