/**
 * One-shot screenshot helper for Fax Inbox (run with: npx electron scripts/capture-screens.mjs)
 * Seeds a temp userData + fax folder, opens the app, writes PNGs.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = process.env.SCREENSHOT_DIR || '/opt/cursor/artifacts/screenshots'
const mediaDir = '/cursor/stores/bc-01a0edd4-fedc-7ba2-9c17-bc6a3abe9d2a/media'
const faxDir = '/tmp/fax-demo-screens'
const userData = '/tmp/fax-inbox-userdata-screens'

function writeMinimalPdf(target) {
  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 594] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 18 Tf 48 520 Td (Fax von Ricoh IM350F) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000272 00000 n 
0000000391 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
468
%%EOF
`
  fs.writeFileSync(target, pdf)
}

function seed() {
  fs.mkdirSync(faxDir, { recursive: true })
  fs.mkdirSync(path.join(faxDir, 'Archiv'), { recursive: true })
  fs.mkdirSync(userData, { recursive: true })
  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(mediaDir, { recursive: true })

  writeMinimalPdf(path.join(faxDir, 'angebot-mueller.pdf'))
  writeMinimalPdf(path.join(faxDir, 'termin-bestaetigung.pdf'))
  writeMinimalPdf(path.join(faxDir, 'rechnung-alt.pdf'))

  fs.writeFileSync(
    path.join(userData, 'settings.json'),
    JSON.stringify(
      {
        faxFolder: faxDir,
        notificationsEnabled: false,
        autostart: false,
      },
      null,
      2,
    ),
  )

  const now = new Date().toISOString()
  fs.writeFileSync(
    path.join(userData, 'inbox-state.json'),
    JSON.stringify(
      {
        items: [
          {
            path: path.join(faxDir, 'angebot-mueller.pdf'),
            addedAt: now,
            seenAt: null,
            archived: false,
            printStatus: 'none',
            printedAt: null,
            exportStatus: 'none',
            exportedAt: null,
            assignedTo: null,
            assignedAt: null,
      priority: false,
      note: null,
      tags: [],
          },
          {
            path: path.join(faxDir, 'termin-bestaetigung.pdf'),
            addedAt: new Date(Date.now() - 3600_000).toISOString(),
            seenAt: new Date(Date.now() - 1800_000).toISOString(),
            archived: false,
            printStatus: 'printed',
            printedAt: new Date(Date.now() - 1800_000).toISOString(),
            exportStatus: 'exported',
            exportedAt: new Date(Date.now() - 1200_000).toISOString(),
            assignedTo: 'Max',
            assignedAt: new Date(Date.now() - 1500_000).toISOString(),
          },
        ],
        users: ['Max', 'Anna'],
      },
      null,
      2,
    ),
  )
}

async function saveShot(win, name) {
  const img = await win.webContents.capturePage()
  const png = img.toPNG()
  const a = path.join(outDir, name)
  const b = path.join(mediaDir, name)
  fs.writeFileSync(a, png)
  fs.writeFileSync(b, png)
  console.log('saved', a)
  console.log('saved', b)
}

app.whenReady().then(async () => {
  // Re-point userData before any store reads — must be before ready typically,
  // but we set via env ELECTRON before launch. Fallback:
  try {
    app.setPath('userData', userData)
  } catch {
    /* already set via CLI */
  }

  seed()

  // Import after userData path is set by launching with --user-data-dir
  // Load built renderer + use the real main by spawning isn't ideal here.
  // Instead load dist UI with a minimal bridge for screenshot of layout only if main isn't used.
  // Prefer loading the actual packaged entry: we start BrowserWindow like main does,
  // but watcher won't run — for visual proof of chrome we load Vite or dist and mock API.

  const preload = path.join(root, 'dist-electron', 'preload.js')
  const distIndex = path.join(root, 'dist', 'index.html')

  // Use real main modules by requiring the built CJS main is hard; launch real app window shell:
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: true,
    backgroundColor: '#f4f2ee',
    webPreferences: {
      preload: fs.existsSync(preload) ? preload : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Without the real main IPC handlers, preload will fail invokes.
  // Register minimal stubs so the UI can render for screenshots.
  const items = [
    {
      path: path.join(faxDir, 'angebot-mueller.pdf'),
      name: 'angebot-mueller.pdf',
      addedAt: new Date().toISOString(),
      seenAt: null,
      size: 500,
      archived: false,
      printStatus: 'none',
      printedAt: null,
      exportStatus: 'none',
      exportedAt: null,
      assignedTo: null,
      assignedAt: null,
      priority: false,
      note: null,
      tags: [],
    },
    {
      path: path.join(faxDir, 'termin-bestaetigung.pdf'),
      name: 'termin-bestaetigung.pdf',
      addedAt: new Date(Date.now() - 86_400_000).toISOString(),
      seenAt: new Date().toISOString(),
      size: 500,
      archived: false,
      printStatus: 'printed',
      printedAt: new Date(Date.now() - 86_000_000).toISOString(),
      exportStatus: 'exported',
      exportedAt: new Date(Date.now() - 80_000_000).toISOString(),
      assignedTo: 'Max',
      assignedAt: new Date(Date.now() - 85_000_000).toISOString(),
      priority: true,
      note: 'Bitte in Akte ablegen',
      tags: ['Patient'],
    },
    {
      path: path.join(faxDir, 'rechnung-alt.pdf'),
      name: 'rechnung-alt.pdf',
      addedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      seenAt: new Date().toISOString(),
      size: 500,
      archived: false,
      printStatus: 'error',
      printedAt: null,
      exportStatus: 'none',
      exportedAt: null,
      assignedTo: null,
      assignedAt: null,
      priority: false,
      note: null,
      tags: [],
    },
  ]

  const settings = {
    faxFolder: faxDir,
    notificationsEnabled: false,
    autostart: false,
    appMode: 'reception',
    clientUserName: null,
    autoArchiveEnabled: false,
    autoArchiveAfterDays: 30,
  }

  ipcMain.handle('get-settings', () => settings)
  ipcMain.handle('save-settings', (_e, partial) => Object.assign(settings, partial))
  ipcMain.handle('pick-fax-folder', async () => faxDir)
  ipcMain.handle('get-inbox', () => ({
    items,
    unreadCount: items.filter((i) => !i.archived && !i.seenAt).length,
  }))
  ipcMain.handle('mark-seen', (_e, p) => {
    const it = items.find((i) => i.path === p)
    if (it) it.seenAt = new Date().toISOString()
    return items
  })
  ipcMain.handle('mark-unseen', (_e, p) => {
    const it = items.find((i) => i.path === p)
    if (it) it.seenAt = null
    return items
  })
  ipcMain.handle('delete-fax', async () => ({ deleted: false, items }))
  ipcMain.handle('archive-fax', async (_e, p) => ({ items, path: p }))
  ipcMain.handle('restore-fax', async (_e, p) => ({ items, path: p }))
  ipcMain.handle('rename-fax', async (_e, p) => ({ items, path: p }))
  ipcMain.handle('print-fax', async () => true)
  ipcMain.handle('read-pdf', async (_e, filePath) => {
    const buf = fs.readFileSync(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })
  ipcMain.handle('reveal-in-folder', () => {})
  ipcMain.handle('get-platform', () => process.platform)

  if (fs.existsSync(distIndex)) {
    await win.loadFile(distIndex)
  } else {
    await win.loadURL('http://localhost:5173')
  }

  await new Promise((r) => setTimeout(r, 2500))
  // Click first item via execute if needed — mark-seen on load of selection happens in UI
  await saveShot(win, 'fax-inbox-main-v2.png')

  // Setup screen: clear fax folder setting
  settings.faxFolder = null
  await win.reload()
  await new Promise((r) => setTimeout(r, 1500))
  await saveShot(win, 'fax-inbox-setup-v2.png')

  app.exit(0)
})
