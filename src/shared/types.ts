export type PrintStatus = 'none' | 'printing' | 'printed' | 'error'
export type ExportStatus = 'none' | 'exporting' | 'exported' | 'error'

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
  /** All watched fax folders (PDFs only, each with own Archiv/) */
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
  items: Array<{
    path: string
    addedAt: string
    seenAt: string | null
    archived?: boolean
    printStatus?: PrintStatus
    printedAt?: string | null
    exportStatus?: ExportStatus
    exportedAt?: string | null
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
