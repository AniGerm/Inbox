import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type DuplexMode,
  type InboxStateFile,
  type PrintMethod,
} from '../shared/types'

const SETTINGS_FILE = 'settings.json'
const STATE_FILE = 'inbox-state.json'

function userDataPath(filename: string): string {
  return path.join(app.getPath('userData'), filename)
}

function readJson<T>(file: string, fallback: T): T {
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
  // legacy 'system' (Electron dialog) → external
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

export function loadSettings(): AppSettings {
  const raw = readJson(userDataPath(SETTINGS_FILE), { ...DEFAULT_SETTINGS })
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
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
  }
}

export function saveSettings(settings: AppSettings): void {
  writeJson(userDataPath(SETTINGS_FILE), settings)
}

export function loadInboxState(): InboxStateFile {
  return readJson(userDataPath(STATE_FILE), { items: [] })
}

export function saveInboxState(state: InboxStateFile): void {
  writeJson(userDataPath(STATE_FILE), state)
}
