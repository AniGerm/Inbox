export interface FaxItem {
  path: string
  name: string
  addedAt: string
  seenAt: string | null
  size: number
  archived: boolean
}

export interface AppSettings {
  faxFolder: string | null
  notificationsEnabled: boolean
  autostart: boolean
  // Scan folder reserved for a later release — not used in MVP.
  // scanFolder: string | null
}

export interface InboxStateFile {
  items: Array<{
    path: string
    addedAt: string
    seenAt: string | null
    archived?: boolean
  }>
}

export const DEFAULT_SETTINGS: AppSettings = {
  faxFolder: null,
  notificationsEnabled: true,
  autostart: false,
}

export const ARCHIVE_DIR_NAME = 'Archiv'
