export type PrintStatus = 'none' | 'printing' | 'printed' | 'error'

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
}

export type PrintMethod = 'external' | 'direct'
export type DuplexMode = 'simplex' | 'long' | 'short'

export interface PrinterInfo {
  name: string
  isDefault: boolean
}

export interface AppSettings {
  faxFolder: string | null
  notificationsEnabled: boolean
  autostart: boolean
  /** external = open PDF in OS default app; direct = silent print to fixed printer (Windows) */
  printMethod: PrintMethod
  /** Windows direct print target; empty = not configured */
  printerName: string
  duplex: DuplexMode
  /** false = monochrome / black & white */
  color: boolean
  copies: number
  paperSize: string
  // Scan folder reserved for a later release — not used in MVP.
  // scanFolder: string | null
}

export interface InboxStateFile {
  items: Array<{
    path: string
    addedAt: string
    seenAt: string | null
    archived?: boolean
    printStatus?: PrintStatus
    printedAt?: string | null
  }>
}

export const DEFAULT_SETTINGS: AppSettings = {
  faxFolder: null,
  notificationsEnabled: true,
  autostart: false,
  printMethod: 'external',
  printerName: '',
  duplex: 'simplex',
  color: false,
  copies: 1,
  paperSize: 'A4',
}

export const ARCHIVE_DIR_NAME = 'Archiv'
