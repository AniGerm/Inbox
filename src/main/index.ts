import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  shell,
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { FaxWatcher } from './watcher'
import { loadSettings, saveSettings } from './store'
import {
  showNewFaxNotification,
  loadTrayIconFromFile,
  focusMainWindow,
} from './notifications'
import type { AppSettings, FaxItem } from '../shared/types'

// Linux: Chromium setuid/userns sandbox often aborts before any window on
// Ubuntu (AppImage/AppArmor). Must be set before app ready.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}

// Required on Windows so system toasts are associated with this app
if (process.platform === 'win32') {
  app.setAppUserModelId('com.faxinbox.app')
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let watcher: FaxWatcher | null = null
let isQuitting = false
let latestItems: FaxItem[] = []
let unreadCount = 0

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function openFaxInApp(filePath: string): void {
  focusMainWindow(mainWindow)
  const send = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('focus-item', filePath)
  }
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.once('did-finish-load', () => setTimeout(send, 40))
  } else {
    // Short delay so a just-shown window paints before selection
    setTimeout(send, 40)
  }
}

function preloadPath(): string {
  const candidates = [
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, 'preload.mjs'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 520,
    title: 'Fax Inbox',
    backgroundColor: '#f2f5fa',
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  })

  const reveal = () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }

  win.once('ready-to-show', reveal)

  // If ready-to-show never fires (load hang), still surface the window.
  const showFallback = setTimeout(reveal, 2500)

  win.webContents.on('did-finish-load', () => {
    clearTimeout(showFallback)
    reveal()
  })

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    clearTimeout(showFallback)
    console.error('Window load failed:', code, desc, url)
    reveal()
    void dialog.showErrorBox(
      'Fax Inbox',
      `Die Oberfläche konnte nicht geladen werden.\n\n${desc} (${code})`,
    )
  })

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

function updateTray(): void {
  if (!tray) return
  const label =
    unreadCount === 0
      ? 'Fax Inbox'
      : unreadCount === 1
        ? 'Fax Inbox — 1 ungelesen'
        : `Fax Inbox — ${unreadCount} ungelesen`
  tray.setToolTip(label)
  tray.setImage(loadTrayIconFromFile(unreadCount))

  // Windows: overlay badge via title; Linux: tooltip carries count
  if (process.platform === 'win32' && mainWindow) {
    mainWindow.setOverlayIcon(
      unreadCount > 0 ? createBadgeOverlay(unreadCount) : null,
      unreadCount > 0 ? `${unreadCount} ungelesen` : '',
    )
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: unreadCount > 0 ? `Öffnen (${unreadCount} neu)` : 'Öffnen',
      click: () => {
        focusMainWindow(mainWindow)
        mainWindow?.webContents.send('focus-newest')
      },
    },
    { type: 'separator' },
    {
      label: 'Beenden',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)
}

function createBadgeOverlay(count: number): Electron.NativeImage {
  // Tiny 16x16 badge-ish image; Electron draws it on the taskbar icon (Windows)
  const text = count > 9 ? '9+' : String(count)
  // Use empty image fallback — overlay text via setTitle on mac; for win we use a simple colored square
  void text
  return loadTrayIconFromFile(count)
}

function broadcastState(items: FaxItem[], count: number, newlyAdded?: FaxItem): void {
  latestItems = items
  unreadCount = count
  updateTray()
  mainWindow?.webContents.send('inbox-updated', { items, unreadCount: count })

  if (newlyAdded) {
    const settings = loadSettings()
    if (settings.notificationsEnabled) {
      showNewFaxNotification(newlyAdded.name, newlyAdded.path, openFaxInApp)
    }
  }
}

function startWatcherFromSettings(): void {
  const settings = loadSettings()
  if (!watcher) {
    watcher = new FaxWatcher({
      onChange: (items, count, newlyAdded) => {
        broadcastState(items, count, newlyAdded)
      },
    })
  }
  if (settings.faxFolder) {
    watcher.start(settings.faxFolder)
  } else {
    watcher.stop()
    broadcastState([], 0)
  }
}

function applyAutostart(enabled: boolean): void {
  try {
    // Windows: show window on login (openAsHidden is mainly a macOS concept).
    // Only register when packaged — otherwise Start Menu / reboot can't find a real install.
    if (!app.isPackaged) {
      console.warn('Autostart nur in der installierten App verfügbar')
      return
    }
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: process.platform === 'darwin',
      path: process.execPath,
      args: [],
    })
  } catch (err) {
    console.error('Autostart konnte nicht gesetzt werden:', err)
  }
}


function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `Befehl fehlgeschlagen (${code})`))
    })
  })
}

/** Windows: Shell Print verb (zuverlässiger Druckdialog als hidden BrowserWindow). */
async function printPdfWindowsShell(filePath: string): Promise<void> {
  const ps = [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Start-Process -LiteralPath ${JSON.stringify(filePath)} -Verb Print`,
  ]
  await runCommand('powershell.exe', ps)
}

async function printPdfElectron(filePath: string, parent: BrowserWindow | null): Promise<void> {
  const printWin = new BrowserWindow({
    show: false,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    modal: !!(parent && !parent.isDestroyed()),
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
    },
  })

  const url = pathToFileURL(filePath).href
  await printWin.loadURL(url)
  await new Promise<void>((resolve, reject) => {
    const fail = (_e: unknown, code: number, desc: string) => {
      reject(new Error(`PDF laden fehlgeschlagen: ${desc} (${code})`))
    }
    if (printWin.webContents.isLoading()) {
      printWin.webContents.once('did-finish-load', () => resolve())
      printWin.webContents.once('did-fail-load', fail)
    } else {
      resolve()
    }
  })

  await new Promise((r) => setTimeout(r, 400))

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Druckdialog-Timeout — bitte erneut versuchen'))
    }, 120_000)
    printWin.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
      clearTimeout(timer)
      if (!printWin.isDestroyed()) printWin.close()
      if (!success && failureReason !== 'cancelled') {
        reject(new Error(failureReason || 'Druck fehlgeschlagen'))
      } else {
        resolve()
      }
    })
  })
}

async function printPdfFile(filePath: string, parent: BrowserWindow | null): Promise<void> {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('Datei nicht gefunden')
  }

  if (process.platform === 'win32') {
    try {
      await printPdfWindowsShell(resolved)
      return
    } catch (shellErr) {
      console.warn('Windows Shell-Druck fehlgeschlagen, versuche Electron:', shellErr)
      await printPdfElectron(resolved, parent)
      return
    }
  }

  await printPdfElectron(resolved, parent)
}

function registerIpc(): void {
  ipcMain.handle('get-settings', () => loadSettings())

  ipcMain.handle('save-settings', (_e, partial: Partial<AppSettings>) => {
    const current = loadSettings()
    const next: AppSettings = { ...current, ...partial }
    saveSettings(next)
    if (partial.autostart !== undefined) {
      applyAutostart(next.autostart)
    }
    if (partial.faxFolder !== undefined) {
      startWatcherFromSettings()
    }
    return next
  })

  ipcMain.handle('pick-fax-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Faxordner wählen',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('get-inbox', () => ({
    items: latestItems,
    unreadCount,
  }))

  ipcMain.handle('mark-seen', (_e, filePath: string) => {
    return watcher?.markSeen(filePath) ?? latestItems
  })

  ipcMain.handle('mark-unseen', (_e, filePath: string) => {
    return watcher?.markUnseen(filePath) ?? latestItems
  })

  ipcMain.handle('delete-fax', async (_e, filePath: string) => {
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Löschen', 'Abbrechen'],
      defaultId: 1,
      cancelId: 1,
      title: 'Fax löschen',
      message: 'Dieses Fax wirklich löschen?',
      detail: path.basename(filePath),
      noLink: true,
    })
    if (response !== 0) return { deleted: false, items: latestItems }
    const items = watcher?.remove(filePath) ?? latestItems
    return { deleted: true, items }
  })

  ipcMain.handle('archive-fax', (_e, filePath: string) => {
    if (!watcher) throw new Error('Watcher nicht bereit')
    return watcher.archive(filePath)
  })

  ipcMain.handle('restore-fax', (_e, filePath: string) => {
    if (!watcher) throw new Error('Watcher nicht bereit')
    return watcher.restore(filePath)
  })

  ipcMain.handle('rename-fax', (_e, filePath: string, newName: string) => {
    if (!watcher) throw new Error('Watcher nicht bereit')
    return watcher.rename(filePath, newName)
  })

  ipcMain.handle('print-fax', async (_e, filePath: string) => {
    await printPdfFile(filePath, mainWindow)
    return true
  })

  ipcMain.handle('read-pdf', async (_e, filePath: string) => {
    if (!fs.existsSync(filePath)) throw new Error('Datei nicht gefunden')
    const buf = fs.readFileSync(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('reveal-in-folder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('get-platform', () => process.platform)
}

// Single-instance lock must run before ready; otherwise a second start can
// quit silently while an invisible first process still holds the lock.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.exit(0)
} else {
  app.on('second-instance', () => {
    focusMainWindow(mainWindow)
    mainWindow?.webContents.send('focus-newest')
  })

  app.whenReady().then(() => {
    registerIpc()
    mainWindow = createWindow()

    try {
      tray = new Tray(loadTrayIconFromFile(0))
      tray.on('click', () => {
        focusMainWindow(mainWindow)
        mainWindow?.webContents.send('focus-newest')
      })
      updateTray()
    } catch (err) {
      // GNOME without AppIndicator: tray may be unavailable — window still works.
      console.error('Tray konnte nicht erstellt werden:', err)
    }

    const settings = loadSettings()
    applyAutostart(settings.autostart)
    startWatcherFromSettings()

    app.on('activate', () => {
      focusMainWindow(mainWindow)
    })
  }).catch((err) => {
    console.error('App-Start fehlgeschlagen:', err)
    dialog.showErrorBox(
      'Fax Inbox',
      `Start fehlgeschlagen:\n\n${err instanceof Error ? err.message : String(err)}`,
    )
    app.exit(1)
  })
}

app.on('before-quit', () => {
  isQuitting = true
  watcher?.stop()
})

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms for inbox monitoring
})
