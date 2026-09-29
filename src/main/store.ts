import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, type AppSettings, type InboxStateFile } from '../shared/types'

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

export function loadSettings(): AppSettings {
  return readJson(userDataPath(SETTINGS_FILE), { ...DEFAULT_SETTINGS })
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
