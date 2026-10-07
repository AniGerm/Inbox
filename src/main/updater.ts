import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { loadSettings } from './store'
import type { UpdateStatusEvent } from '../shared/types'
import {
  BRIDGE_DEB_TAG,
  downloadDebUpdate,
  fetchDebReleaseByTag,
  fetchLatestDebRelease,
  isVersionNewer,
  quitAndInstallDeb,
  type DebReleaseInfo,
} from './linuxDebUpdater'

const START_DELAY_MS = 10_000
const INTERVAL_MS = 4 * 60 * 60 * 1000
/** Let the UI show “restarting…” before the process exits */
const INSTALL_DELAY_MS = 900

let printingInProgress = false
let checkTimer: ReturnType<typeof setInterval> | null = null
let getMainWindow: () => BrowserWindow | null = () => null
let prepareForQuit: () => void = () => undefined
let installInFlight = false

/** Pending .deb update (system install, not AppImage). */
let pendingDeb: DebReleaseInfo | null = null
let downloadedDebPath: string | null = null

export function setPrintingInProgress(active: boolean): void {
  printingInProgress = active
}

export function isPrintingInProgress(): boolean {
  return printingInProgress
}

function isAppImage(): boolean {
  return Boolean(process.env.APPIMAGE)
}

/** Packaged Linux install via .deb / system package (not AppImage). */
function useLinuxDebUpdater(): boolean {
  return process.platform === 'linux' && app.isPackaged && !isAppImage()
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

function shouldAutoCheck(): boolean {
  try {
    return loadSettings().autoCheckUpdates !== false
  } catch {
    return true
  }
}

/**
 * When the newest GitHub release has no installable .deb (e.g. renamed assets),
 * offer the known bridge release (0.4.0) so users can step up, then update cleanly.
 */
async function offerBridgeDebIfWanted(): Promise<DebReleaseInfo | null> {
  const current = app.getVersion()
  const bridgeVersion = BRIDGE_DEB_TAG.replace(/^v/i, '')
  if (!isVersionNewer(bridgeVersion, current)) {
    emit({
      type: 'error',
      message:
        'Kein .deb-Paket im neuesten GitHub-Release gefunden. Bitte das Paket manuell von GitHub Releases installieren.',
    })
    return null
  }

  const win = getMainWindow()
  const boxOpts = {
    type: 'question' as const,
    buttons: ['0.4.0 installieren', 'Abbrechen'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update-Zwischenschritt',
    message: 'Im neuesten Release wurde kein passendes .deb-Paket gefunden.',
    detail:
      'Als Zwischenschritt kann Version 0.4.0 installiert werden. Danach funktionieren weitere Updates mit dem Paketnamen „Inbox“ (ohne „Fax“ im Dateinamen).\n\nJetzt 0.4.0 herunterladen und installieren?',
    noLink: true,
  }
  const { response } =
    win && !win.isDestroyed()
      ? await dialog.showMessageBox(win, boxOpts)
      : await dialog.showMessageBox(boxOpts)
  if (response !== 0) {
    emit({
      type: 'error',
      message: 'Update abgebrochen — kein .deb im neuesten Release.',
    })
    return null
  }

  const bridge = await fetchDebReleaseByTag(BRIDGE_DEB_TAG)
  if (!bridge) {
    emit({
      type: 'error',
      message: `Zwischenschritt ${BRIDGE_DEB_TAG} hat ebenfalls kein .deb-Paket.`,
    })
    return null
  }
  return bridge
}

async function checkDebUpdates(): Promise<void> {
  emit({ type: 'checking' })
  try {
    let latest = await fetchLatestDebRelease()
    if (!latest) {
      latest = await offerBridgeDebIfWanted()
      if (!latest) return
    }
    const current = app.getVersion()
    if (isVersionNewer(latest.version, current)) {
      pendingDeb = latest
      downloadedDebPath = null
      emit({ type: 'update-available', version: latest.version })
    } else {
      pendingDeb = null
      downloadedDebPath = null
      emit({ type: 'update-not-available', version: current })
    }
  } catch (err) {
    console.error('Linux .deb Update-Check fehlgeschlagen:', err)
    emit({ type: 'error', message: errorMessage(err) })
  }
}

async function downloadDeb(): Promise<{ ok: boolean }> {
  if (!pendingDeb) {
    emit({ type: 'error', message: 'Kein Update zum Herunterladen.' })
    return { ok: false }
  }
  try {
    emit({ type: 'download-progress', percent: 0 })
    const dest = await downloadDebUpdate(pendingDeb, (percent) => {
      emit({ type: 'download-progress', percent })
    })
    downloadedDebPath = dest
    emit({ type: 'update-downloaded', version: pendingDeb.version })
    return { ok: true }
  } catch (err) {
    console.error('Linux .deb Download fehlgeschlagen:', err)
    emit({ type: 'error', message: errorMessage(err) })
    return { ok: false }
  }
}

async function safeCheckForUpdates(): Promise<void> {
  if (useLinuxDebUpdater()) {
    await checkDebUpdates()
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    console.error('Update-Check fehlgeschlagen:', err)
    emit({ type: 'error', message: errorMessage(err) })
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
    prepareForQuit()
    // isSilent=false → NSIS UI; isForceRunAfter=true → relaunch after install
    autoUpdater.quitAndInstall(false, true)
  } catch (err) {
    installInFlight = false
    console.error('Update-Installation fehlgeschlagen:', err)
    emit({ type: 'error', message: errorMessage(err) })
  }
}

async function runInstallUpdate(): Promise<{ ok: boolean; reason?: string }> {
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

  const linuxDeb = useLinuxDebUpdater()
  if (linuxDeb && !downloadedDebPath) {
    emit({ type: 'error', message: 'Update noch nicht heruntergeladen.' })
    return { ok: false }
  }

  installInFlight = true
  emit({ type: 'installing', version: pendingDeb?.version ?? app.getVersion() })

  const win = getMainWindow()
  try {
    if (win && !win.isDestroyed()) {
      await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update installieren',
        message: 'Inbox wird jetzt beendet und neu gestartet.',
        detail: linuxDeb
          ? 'Gleich erscheint die Passwort-Abfrage zur Installation. Nach Bestätigung startet die App automatisch neu.'
          : 'Gleich öffnet sich der Installer. Bitte kurz warten — die App startet danach automatisch wieder.',
        buttons: ['Weiter'],
        defaultId: 0,
        noLink: true,
      })
    }
  } catch (err) {
    console.error('Update-Hinweisdialog fehlgeschlagen:', err)
  }

  await new Promise<void>((resolve) => setTimeout(resolve, INSTALL_DELAY_MS))

  if (linuxDeb && downloadedDebPath) {
    try {
      quitAndInstallDeb(downloadedDebPath, prepareForQuit)
    } catch (err) {
      installInFlight = false
      console.error('Linux .deb Installation fehlgeschlagen:', err)
      emit({ type: 'error', message: errorMessage(err) })
      return { ok: false }
    }
    return { ok: true }
  }

  runQuitAndInstall()
  return { ok: true }
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
      await safeCheckForUpdates()
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
    if (useLinuxDebUpdater()) {
      return downloadDeb()
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

  ipcMain.handle('install-update', async () => runInstallUpdate())

  if (!app.isPackaged) {
    console.log('Updater: Dev-Modus — automatische Checks übersprungen')
    return
  }

  if (useLinuxDebUpdater()) {
    console.log('Updater: Linux .deb — Updates per Klick (Download + Passwort)')
    setTimeout(() => {
      if (shouldAutoCheck()) {
        void safeCheckForUpdates()
      }
    }, START_DELAY_MS)
    schedulePeriodicChecks()
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
