import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { loadSettings } from './store'
import type { UpdateStatusEvent } from '../shared/types'

const START_DELAY_MS = 10_000
const INTERVAL_MS = 4 * 60 * 60 * 1000

let printingInProgress = false
let checkTimer: ReturnType<typeof setInterval> | null = null
let getMainWindow: () => BrowserWindow | null = () => null

export function setPrintingInProgress(active: boolean): void {
  printingInProgress = active
}

export function isPrintingInProgress(): boolean {
  return printingInProgress
}

function emit(event: UpdateStatusEvent): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  try {
    win.webContents.send('update-status', event)
  } catch (err) {
    console.error('Update-Status konnte nicht gesendet werden:', err)
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return String(err)
}

async function safeCheckForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    console.error('Update-Check fehlgeschlagen:', err)
    emit({ type: 'error', message: errorMessage(err) })
  }
}

function shouldAutoCheck(): boolean {
  try {
    return loadSettings().autoCheckUpdates !== false
  } catch {
    return true
  }
}

function schedulePeriodicChecks(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  checkTimer = setInterval(() => {
    if (shouldAutoCheck()) {
      void safeCheckForUpdates()
    }
  }, INTERVAL_MS)
}

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow

  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) {
      emit({
        type: 'error',
        message: 'Updates nur in der installierten App verfügbar.',
      })
      return { ok: false }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { ok: true }
    } catch (err) {
      console.error('Update-Check fehlgeschlagen:', err)
      emit({ type: 'error', message: errorMessage(err) })
      return { ok: false }
    }
  })

  ipcMain.handle('download-update', async () => {
    if (!app.isPackaged) {
      emit({
        type: 'error',
        message: 'Updates nur in der installierten App verfügbar.',
      })
      return { ok: false }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      console.error('Update-Download fehlgeschlagen:', err)
      emit({ type: 'error', message: errorMessage(err) })
      return { ok: false }
    }
  })

  ipcMain.handle('install-update', () => {
    if (printingInProgress) {
      emit({
        type: 'error',
        message: 'Update während eines Druckvorgangs nicht möglich. Bitte warten.',
      })
      return { ok: false, reason: 'printing' as const }
    }
    if (!app.isPackaged) {
      emit({
        type: 'error',
        message: 'Updates nur in der installierten App verfügbar.',
      })
      return { ok: false }
    }
    try {
      // isSilent=false, isForceRunAfter=true — restart after install (user confirmed)
      autoUpdater.quitAndInstall(false, true)
      return { ok: true }
    } catch (err) {
      console.error('Update-Installation fehlgeschlagen:', err)
      emit({ type: 'error', message: errorMessage(err) })
      return { ok: false }
    }
  })

  if (!app.isPackaged) {
    console.log('Updater: Dev-Modus — automatische Checks übersprungen')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    emit({ type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    emit({ type: 'update-available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info) => {
    emit({
      type: 'update-not-available',
      version: info?.version ?? app.getVersion(),
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent)))
    emit({ type: 'download-progress', percent })
  })

  autoUpdater.on('update-downloaded', (info) => {
    emit({ type: 'update-downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    console.error('electron-updater Fehler:', err)
    emit({ type: 'error', message: errorMessage(err) })
  })

  setTimeout(() => {
    if (shouldAutoCheck()) {
      void safeCheckForUpdates()
    }
  }, START_DELAY_MS)

  schedulePeriodicChecks()
}
