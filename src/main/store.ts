import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  normalizeAppMode,
  normalizeAutoArchiveDays,
  normalizeFaxFolders,
  normalizeUserName,
  type AppSettings,
  type DuplexMode,
  type InboxStateFile,
  type PrintMethod,
} from '../shared/types'

const SETTINGS_FILE = 'settings.json'
export const STATE_FILE = 'inbox-state.json'

function userDataPath(filename: string): string {
  return path.join(app.getPath('userData'), filename)
}

function readJsonFile<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback
    const raw = fs.readFileSync(file, 'utf8')
    return { ...fallback, ...JSON.parse(raw) } as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function normalizePrintMethod(value: unknown): PrintMethod {
  if (value === 'direct') return 'direct'
  return 'external'
}

function normalizeDuplex(value: unknown): DuplexMode {
  if (value === 'long' || value === 'short' || value === 'simplex') return value
  return DEFAULT_SETTINGS.duplex
}

function normalizeCopies(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.copies
  return Math.min(99, Math.max(1, Math.round(n)))
}

function normalizeOptionalFolder(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Settings always live in local userData (per machine). */
export function loadSettings(): AppSettings {
  const raw = readJsonFile(userDataPath(SETTINGS_FILE), { ...DEFAULT_SETTINGS })
  const folders = normalizeFaxFolders({
    faxFolder: typeof raw.faxFolder === 'string' ? raw.faxFolder : null,
    faxFolders: Array.isArray(raw.faxFolders) ? raw.faxFolders : [],
  })
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    faxFolders: folders,
    faxFolder: folders[0] ?? null,
    printMethod: normalizePrintMethod(raw.printMethod),
    printerName: typeof raw.printerName === 'string' ? raw.printerName : '',
    duplex: normalizeDuplex(raw.duplex),
    color: typeof raw.color === 'boolean' ? raw.color : DEFAULT_SETTINGS.color,
    copies: normalizeCopies(raw.copies),
    paperSize:
      typeof raw.paperSize === 'string' && raw.paperSize.trim()
        ? raw.paperSize.trim()
        : DEFAULT_SETTINGS.paperSize,
    autoCheckUpdates:
      typeof raw.autoCheckUpdates === 'boolean'
        ? raw.autoCheckUpdates
        : DEFAULT_SETTINGS.autoCheckUpdates,
    exportFolder: normalizeOptionalFolder(raw.exportFolder),
    exportButtonLabel:
      typeof raw.exportButtonLabel === 'string' && raw.exportButtonLabel.trim()
        ? raw.exportButtonLabel.trim()
        : DEFAULT_SETTINGS.exportButtonLabel,
    stateFolder: normalizeOptionalFolder(raw.stateFolder),
    appMode: normalizeAppMode(raw.appMode),
    clientUserName: normalizeUserName(raw.clientUserName),
    autoArchiveEnabled:
      typeof raw.autoArchiveEnabled === 'boolean'
        ? raw.autoArchiveEnabled
        : DEFAULT_SETTINGS.autoArchiveEnabled,
    autoArchiveAfterDays: normalizeAutoArchiveDays(raw.autoArchiveAfterDays),
  }
}

export function saveSettings(settings: AppSettings): void {
  const folders = normalizeFaxFolders(settings)
  writeJson(userDataPath(SETTINGS_FILE), {
    ...settings,
    faxFolders: folders,
    faxFolder: folders[0] ?? null,
    stateFolder: normalizeOptionalFolder(settings.stateFolder),
  })
}

/**
 * Path to inbox-state.json — shared folder when configured, else local userData.
 * Reads settings.json directly to avoid recursion.
 */
export function getInboxStatePath(): string {
  try {
    const settingsFile = userDataPath(SETTINGS_FILE)
    if (fs.existsSync(settingsFile)) {
      const raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as {
        stateFolder?: unknown
      }
      const folder = normalizeOptionalFolder(raw.stateFolder)
      if (folder) {
        return path.join(folder, STATE_FILE)
      }
    }
  } catch {
    /* fall through to local */
  }
  return userDataPath(STATE_FILE)
}

export function loadInboxState(): InboxStateFile {
  const raw = readJsonFile(getInboxStatePath(), { items: [], users: [] })
  return {
    users: Array.isArray(raw.users) ? raw.users : [],
    items: Array.isArray(raw.items) ? raw.items : [],
  }
}

export function saveInboxState(state: InboxStateFile): void {
  writeJson(getInboxStatePath(), state)
}

/**
 * If a shared state folder is newly configured and has no inbox-state.json yet,
 * seed it from the local userData copy so markers are not lost.
 */
export function migrateLocalStateToSharedIfNeeded(stateFolder: string | null): void {
  const folder = typeof stateFolder === 'string' ? stateFolder.trim() : ''
  if (!folder) return
  try {
    fs.mkdirSync(folder, { recursive: true })
    const shared = path.join(folder, STATE_FILE)
    if (fs.existsSync(shared)) return
    const local = userDataPath(STATE_FILE)
    if (!fs.existsSync(local)) return
    fs.copyFileSync(local, shared)
  } catch (err) {
    console.error('Status-Migration fehlgeschlagen:', err)
  }
}
