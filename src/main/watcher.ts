import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'
import { loadInboxState, saveInboxState } from './store'
import { ARCHIVE_DIR_NAME, type ExportStatus, type FaxItem, type PrintStatus } from '../shared/types'

type KnownItem = {
  path: string
  addedAt: string
  seenAt: string | null
  archived?: boolean
  printStatus?: PrintStatus
  printedAt?: string | null
  exportStatus?: ExportStatus
  exportedAt?: string | null
}

function printFieldsFromKnown(existing?: KnownItem): Pick<FaxItem, 'printStatus' | 'printedAt'> {
  const printedAt = existing?.printedAt ?? null
  const printStatus =
    existing?.printStatus ?? (printedAt ? 'printed' : 'none')
  // Never restore mid-flight 'printing' across restarts
  return {
    printStatus: printStatus === 'printing' ? 'none' : printStatus,
    printedAt,
  }
}

function exportFieldsFromKnown(
  existing?: KnownItem,
): Pick<FaxItem, 'exportStatus' | 'exportedAt'> {
  const exportedAt = existing?.exportedAt ?? null
  const exportStatus =
    existing?.exportStatus ?? (exportedAt ? 'exported' : 'none')
  return {
    exportStatus:
      exportStatus === 'exporting' ? 'none' : exportStatus,
    exportedAt,
  }
}

const IGNORE_PATTERNS = [
  /(^|[\/\\])\../,
  /\.tmp$/i,
  /~$/,
  /\.partial$/i,
  /\.crdownload$/i,
  /\.part$/i,
]

function isPdf(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf'
}

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some((re) => re.test(filePath))
}

function fileMeta(filePath: string): { size: number; mtime: Date } | null {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return null
    return { size: stat.size, mtime: stat.mtime }
  } catch {
    return null
  }
}

function archiveDir(folder: string): string {
  return path.join(folder, ARCHIVE_DIR_NAME)
}

function uniqueTarget(dir: string, baseName: string): string {
  let candidate = path.join(dir, baseName)
  if (!fs.existsSync(candidate)) return candidate
  const ext = path.extname(baseName)
  const stem = path.basename(baseName, ext)
  let n = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${n})${ext}`)
    n += 1
  }
  return candidate
}

function sanitizePdfName(raw: string): string {
  const trimmed = raw.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  if (!trimmed) throw new Error('Ungültiger Name')
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`
}

/** Resolve paths; on Windows compare case-insensitively (chokidar/SMB quirks). */
function normKey(p: string): string {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function samePath(a: string, b: string): boolean {
  return normKey(a) === normKey(b)
}

export type WatcherCallbacks = {
  onChange: (items: FaxItem[], unreadCount: number, newlyAdded?: FaxItem) => void
}

export class FaxWatcher {
  private watcher: FSWatcher | null = null
  private folders: string[] = []
  private items = new Map<string, FaxItem>()
  private callbacks: WatcherCallbacks
  private rescanTimer: ReturnType<typeof setInterval> | null = null

  constructor(callbacks: WatcherCallbacks) {
    this.callbacks = callbacks
  }

  private key(filePath: string): string {
    return normKey(filePath)
  }

  /** Primary folder (first), for backwards-compatible display. */
  getFolder(): string | null {
    return this.folders[0] ?? null
  }

  getFolders(): string[] {
    return [...this.folders]
  }

  getItems(): FaxItem[] {
    return [...this.items.values()].sort(
      (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
    )
  }

  getUnreadCount(): number {
    return this.getItems().filter((i) => !i.archived && i.seenAt === null).length
  }

  /** Which watched inbox root owns this file (inbox or its Archiv/). */
  private findRoot(filePath: string): string | null {
    const parent = path.dirname(path.resolve(filePath))
    for (const folder of this.folders) {
      if (samePath(parent, folder) || samePath(parent, archiveDir(folder))) {
        return folder
      }
    }
    return null
  }

  private isWatchedPath(full: string): { folder: string; archived: boolean } | null {
    const parent = path.dirname(full)
    for (const folder of this.folders) {
      if (samePath(parent, folder)) return { folder, archived: false }
      if (samePath(parent, archiveDir(folder))) return { folder, archived: true }
    }
    return null
  }

  start(folders: string | string[]): void {
    this.stop()
    const list = (Array.isArray(folders) ? folders : [folders])
      .map((f) => path.resolve(f.trim()))
      .filter(Boolean)
    const seen = new Set<string>()
    this.folders = []
    for (const f of list) {
      const k = this.key(f)
      if (seen.has(k)) continue
      seen.add(k)
      this.folders.push(f)
    }
    this.items.clear()

    if (this.folders.length === 0) {
      this.emit()
      return
    }

    const state = loadInboxState()
    const known = new Map(state.items.map((i) => [this.key(i.path), i]))

    const watchRoots: string[] = []
    for (const folder of this.folders) {
      if (!fs.existsSync(folder)) continue
      const arch = archiveDir(folder)
      if (!fs.existsSync(arch)) {
        fs.mkdirSync(arch, { recursive: true })
      }
      this.scanDirectory(folder, false, known)
      this.scanDirectory(arch, true, known)
      watchRoots.push(folder, arch)
    }

    this.persist()
    this.emit()

    if (watchRoots.length === 0) return

    // Windows (esp. SMB/network fax folders): native fs.watch often misses events.
    // Polling + periodic rescan makes detection reliable like on Linux.
    const usePolling = process.platform === 'win32'

    this.watcher = chokidar.watch(watchRoots, {
      ignored: (p: string) => {
        const full = path.resolve(p)
        if (shouldIgnore(full)) return true
        for (const folder of this.folders) {
          const arch = archiveDir(folder)
          if (samePath(full, folder) || samePath(full, arch)) return false
        }
        if (!isPdf(full)) return true
        return this.isWatchedPath(full) === null
      },
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: usePolling ? 1200 : 800,
        pollInterval: 200,
      },
      depth: 0,
      usePolling,
      interval: 1000,
      binaryInterval: 1000,
      atomic: true,
    })

    this.watcher.on('add', (filePath) => this.handleAdd(filePath))
    this.watcher.on('change', (filePath) => this.handleAdd(filePath))
    this.watcher.on('unlink', (filePath) => this.handleUnlink(filePath))
    this.watcher.on('error', (err) => {
      console.error('Ordnerüberwachung Fehler:', err)
    })

    if (usePolling) {
      this.rescanTimer = setInterval(() => {
        this.rescanForNewFiles()
      }, 2500)
    }
  }

  stop(): void {
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }
    this.folders = []
  }

  markSeen(filePath: string): FaxItem[] {
    const item = this.items.get(this.key(filePath))
    if (item && item.seenAt === null) {
      item.seenAt = new Date().toISOString()
      this.persist()
      this.emit()
    }
    return this.getItems()
  }

  markUnseen(filePath: string): FaxItem[] {
    const item = this.items.get(this.key(filePath))
    if (item) {
      item.seenAt = null
      this.persist()
      this.emit()
    }
    return this.getItems()
  }

  setPrintStatus(
    filePath: string,
    status: PrintStatus,
    printedAt?: string | null,
  ): FaxItem[] {
    const item = this.items.get(this.key(filePath))
    if (item) {
      item.printStatus = status
      if (status === 'printed') {
        item.printedAt = printedAt ?? new Date().toISOString()
      }
      this.persist()
      this.emit()
    }
    return this.getItems()
  }

  setExportStatus(
    filePath: string,
    status: ExportStatus,
    exportedAt?: string | null,
  ): FaxItem[] {
    const item = this.items.get(this.key(filePath))
    if (item) {
      item.exportStatus = status
      if (status === 'exported') {
        item.exportedAt = exportedAt ?? new Date().toISOString()
      }
      this.persist()
      this.emit()
    }
    return this.getItems()
  }

  remove(filePath: string): FaxItem[] {
    const k = this.key(filePath)
    const item = this.items.get(k)
    if (item) {
      this.items.delete(k)
      try {
        const real = item.path
        if (fs.existsSync(real)) fs.unlinkSync(real)
      } catch (err) {
        console.error('Löschen fehlgeschlagen:', err)
        throw err
      }
      this.persist()
      this.emit()
    }
    return this.getItems()
  }

  archive(filePath: string): { items: FaxItem[]; path: string } {
    const k = this.key(filePath)
    const item = this.items.get(k)
    if (!item) throw new Error('Eintrag nicht gefunden')
    if (item.archived) return { items: this.getItems(), path: item.path }

    const root = this.findRoot(item.path)
    if (!root) throw new Error('Kein Faxordner für diese Datei')

    const destDir = archiveDir(root)
    fs.mkdirSync(destDir, { recursive: true })
    const dest = uniqueTarget(destDir, item.name)
    fs.renameSync(item.path, dest)

    this.items.delete(k)
    const moved: FaxItem = {
      ...item,
      path: dest,
      name: path.basename(dest),
      archived: true,
      seenAt: item.seenAt ?? new Date().toISOString(),
    }
    this.items.set(this.key(dest), moved)
    this.persist()
    this.emit()
    return { items: this.getItems(), path: dest }
  }

  restore(filePath: string): { items: FaxItem[]; path: string } {
    const k = this.key(filePath)
    const item = this.items.get(k)
    if (!item) throw new Error('Eintrag nicht gefunden')
    if (!item.archived) return { items: this.getItems(), path: item.path }

    const root = this.findRoot(item.path)
    if (!root) throw new Error('Kein Faxordner für diese Datei')

    const dest = uniqueTarget(root, item.name)
    fs.renameSync(item.path, dest)

    this.items.delete(k)
    const moved: FaxItem = {
      ...item,
      path: dest,
      name: path.basename(dest),
      archived: false,
    }
    this.items.set(this.key(dest), moved)
    this.persist()
    this.emit()
    return { items: this.getItems(), path: dest }
  }

  rename(filePath: string, newName: string): { items: FaxItem[]; path: string } {
    const k = this.key(filePath)
    const item = this.items.get(k)
    if (!item) throw new Error('Eintrag nicht gefunden')

    const safeName = sanitizePdfName(newName)
    const destDir = path.dirname(item.path)
    const dest = path.join(destDir, safeName)

    if (samePath(dest, item.path)) {
      return { items: this.getItems(), path: item.path }
    }
    if (fs.existsSync(dest)) {
      throw new Error('Eine Datei mit diesem Namen existiert bereits.')
    }

    fs.renameSync(item.path, dest)
    this.items.delete(k)
    const moved: FaxItem = {
      ...item,
      path: dest,
      name: path.basename(dest),
    }
    this.items.set(this.key(dest), moved)
    this.persist()
    this.emit()
    return { items: this.getItems(), path: dest }
  }

  private scanDirectory(
    dir: string,
    archived: boolean,
    known: Map<string, KnownItem>,
  ): void {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      const full = path.resolve(dir, name)
      if (!isPdf(full) || shouldIgnore(full)) continue
      try {
        if (!fs.statSync(full).isFile()) continue
      } catch {
        continue
      }
      const meta = fileMeta(full)
      if (!meta) continue
      const existing = known.get(this.key(full))
      this.items.set(this.key(full), {
        path: full,
        name,
        addedAt: existing?.addedAt ?? meta.mtime.toISOString(),
        seenAt: existing?.seenAt ?? null,
        size: meta.size,
        archived,
        ...printFieldsFromKnown(existing),
        ...exportFieldsFromKnown(existing),
      })
    }
  }

  /** Fallback for Windows/network folders when chokidar misses an event. */
  private rescanForNewFiles(): void {
    if (this.folders.length === 0) return

    const roots: Array<{ dir: string; archived: boolean }> = []
    for (const folder of this.folders) {
      roots.push({ dir: folder, archived: false })
      roots.push({ dir: archiveDir(folder), archived: true })
    }

    let changed = false
    const seenKeys = new Set<string>()

    for (const { dir, archived } of roots) {
      if (!fs.existsSync(dir)) continue
      for (const name of fs.readdirSync(dir)) {
        const full = path.resolve(dir, name)
        if (!isPdf(full) || shouldIgnore(full)) continue
        try {
          if (!fs.statSync(full).isFile()) continue
        } catch {
          continue
        }
        const k = this.key(full)
        seenKeys.add(k)
        if (this.items.has(k)) {
          const meta = fileMeta(full)
          const item = this.items.get(k)!
          if (meta && item.size !== meta.size) {
            item.size = meta.size
            changed = true
          }
          continue
        }
        const meta = fileMeta(full)
        if (!meta) continue
        const item: FaxItem = {
          path: full,
          name: path.basename(full),
          addedAt: new Date().toISOString(),
          seenAt: archived ? new Date().toISOString() : null,
          size: meta.size,
          archived,
          printStatus: 'none',
          printedAt: null,
          exportStatus: 'none',
          exportedAt: null,
        }
        this.items.set(k, item)
        changed = true
        this.persist()
        this.emit(archived ? undefined : item)
      }
    }

    for (const [k, item] of [...this.items.entries()]) {
      if (seenKeys.has(k)) continue
      if (!fs.existsSync(item.path)) {
        this.items.delete(k)
        changed = true
      }
    }
    if (changed) {
      this.persist()
      this.emit()
    }
  }

  private handleAdd(filePath: string): void {
    if (this.folders.length === 0 || !isPdf(filePath) || shouldIgnore(filePath)) return
    const full = path.resolve(filePath)
    const k = this.key(full)
    if (this.items.has(k)) return

    const hit = this.isWatchedPath(full)
    if (!hit) return

    const meta = fileMeta(full)
    if (!meta) return

    const item: FaxItem = {
      path: full,
      name: path.basename(full),
      addedAt: new Date().toISOString(),
      seenAt: hit.archived ? new Date().toISOString() : null,
      size: meta.size,
      archived: hit.archived,
      printStatus: 'none',
      printedAt: null,
      exportStatus: 'none',
      exportedAt: null,
    }
    this.items.set(k, item)
    this.persist()
    this.emit(hit.archived ? undefined : item)
  }

  private handleUnlink(filePath: string): void {
    const k = this.key(filePath)
    if (!this.items.has(k)) return
    this.items.delete(k)
    this.persist()
    this.emit()
  }

  private persist(): void {
    saveInboxState({
      items: this.getItems().map(
        ({
          path: p,
          addedAt,
          seenAt,
          archived,
          printStatus,
          printedAt,
          exportStatus,
          exportedAt,
        }) => ({
          path: p,
          addedAt,
          seenAt,
          archived,
          printStatus,
          printedAt,
          exportStatus,
          exportedAt,
        }),
      ),
    })
  }

  private emit(newlyAdded?: FaxItem): void {
    this.callbacks.onChange(this.getItems(), this.getUnreadCount(), newlyAdded)
  }
}
