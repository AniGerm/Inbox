import { BrowserWindow, Notification, nativeImage, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { deflateSync } from 'node:zlib'

export type OpenFaxHandler = (filePath: string) => void

/**
 * System notification for a new fax (Windows toast + Ubuntu/libnotify).
 * Body click and the "App öffnen" action (where supported) both open the app
 * and jump to the fax.
 */
export function showNewFaxNotification(
  fileName: string,
  filePath: string,
  onOpen: OpenFaxHandler,
): void {
  if (!Notification.isSupported()) return

  const open = () => onOpen(filePath)
  const icon = loadTrayIconFromFile(1)

  const options: Electron.NotificationConstructorOptions = {
    title: 'Neues Fax',
    body: fileName,
    icon,
    silent: false,
    urgency: 'normal',
    timeoutType: 'default',
  }

  // Action button: fully supported on Windows; on some Linux DEs also shown.
  // Clicking the toast body works on Windows and Ubuntu.
  if (process.platform === 'win32' || process.platform === 'linux') {
    options.actions = [{ type: 'button', text: 'App öffnen' }]
  }
  if (process.platform === 'win32') {
    options.closeButtonText = 'Schließen'
  }

  const notification = new Notification(options)
  notification.on('click', open)
  notification.on('action', (_event, _index) => open())
  notification.show()
}

export function getTrayIcon(unreadCount: number): Electron.NativeImage {
  const size = 16
  const canvas = Buffer.from(
    createSimplePng(size, unreadCount > 0 ? [26, 58, 107] : [90, 101, 120]),
  )
  return nativeImage.createFromBuffer(canvas)
}

export function resolveResource(...parts: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', ...parts)
  }
  return path.join(app.getAppPath(), 'resources', ...parts)
}

export function loadTrayIconFromFile(unreadCount: number): Electron.NativeImage {
  const iconPath = resolveResource('tray-icon.png')
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) {
      return img.resize({ width: 16, height: 16 })
    }
  }
  return getTrayIcon(unreadCount)
}

/** Minimal uncompressed PNG generator for a solid-color square. */
function createSimplePng(size: number, rgb: [number, number, number]): Buffer {
  const [r, g, b] = rgb
  const stride = size * 3 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    const row = y * stride
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3
      const cx = x - size / 2 + 0.5
      const cy = y - size / 2 + 0.5
      const inCircle = cx * cx + cy * cy <= (size / 2.4) * (size / 2.4)
      if (inCircle) {
        raw[i] = r
        raw[i + 1] = g
        raw[i + 2] = b
      } else {
        raw[i] = 0
        raw[i + 1] = 0
        raw[i + 2] = 0
      }
    }
  }

  const compressed = deflateSync(raw)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  function chunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const crcData = Buffer.concat([typeBuf, data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(crcData), 0)
    return Buffer.concat([len, typeBuf, data, crc])
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

export function focusMainWindow(win: BrowserWindow | null): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.show()
  win.focus()
  if (process.platform === 'win32') {
    // Flash taskbar briefly so the user notices the jump
    win.flashFrame(true)
    setTimeout(() => {
      if (!win.isDestroyed()) win.flashFrame(false)
    }, 1200)
  }
}
