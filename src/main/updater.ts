import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { loadSettings } from './store'
import type { UpdateStatusEvent } from '../shared/types'

const START_DELAY_MS = 10_000
const INTERVAL_MS = 4 * 60 * 60 * 1000
/** Let the UI show “restarting…” before the process exits */
const INSTALL_DELAY_MS = 900

let printingInProgress = false
let checkTimer: ReturnType<typeof setInterval> | null = null
let getMainWindow: () => BrowserWindow | null = () => null
let prepareForQuit: () => void = () => undefined
let installInFlight = false

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

function runQuitAndInstall(): void {
  try {
    // Mark app as quitting so the tray close-handler does not only hide the window
    prepareForQuit()
    // isSilent=false → NSIS UI; isForceRunAfter=true → relaunch after install
    autoUpdater.quitAndInstall(false, true)
  } catch (err) {
    installInFlight = false
    console.error('Update-Installation fehlgeschlagen:', err)
    emit({ type: 'error', message: errorMessage(err) })
  }
}

export function initUpdater(
  getWindow: () => BrowserWindow | null,
  opts?: { prepareForQuit?: () => void },
): void {
  getMainWindow = getWindow
  if (opts?.prepareForQuit) prepareForQuit = opts.prepareForQuit

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

  ipcMain.handle('install-update', async () => {
    if (installInFlight) return { ok: true }
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

    installInFlight = true
    emit({ type: 'installing', version: app.getVersion() })

    const win = getMainWindow()
    try {
      if (win && !win.isDestroyed()) {
        await dialog.showMessageBox(win, {
          type: 'info',
          title: 'Update installieren',
          message: 'Fax Inbox wird jetzt beendet und neu gestartet.',
          detail:
            'Gleich öffnet sich der Installer. Bitte kurz warten — die App startet danach automatisch wieder.',
          buttons: ['Weiter'],
          defaultId: 0,
          noLink: true,
        })
      }
    } catch (err) {
      console.error('Update-Hinweisdialog fehlgeschlagen:', err)
    }

    // Allow renderer overlay to paint; then quit into the installer
    await new Promise<void>((resolve) => setTimeout(resolve, INSTALL_DELAY_MS))
    runQuitAndInstall()
    return { ok: true }
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
