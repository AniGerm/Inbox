import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'
import { loadInboxState, saveInboxState } from './store'
import { ARCHIVE_DIR_NAME, type FaxItem } from '../shared/types'

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
  private folder: string | null = null
  private items = new Map<string, FaxItem>()
  private callbacks: WatcherCallbacks
  private rescanTimer: ReturnType<typeof setInterval> | null = null

  constructor(callbacks: WatcherCallbacks) {
    this.callbacks = callbacks
  }

  private key(filePath: string): string {
    return normKey(filePath)
  }

  getFolder(): string | null {
    return this.folder
  }

  getItems(): FaxItem[] {
    return [...this.items.values()].sort(
      (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
    )
  }

  getUnreadCount(): number {
    return this.getItems().filter((i) => !i.archived && i.seenAt === null).length
  }

  start(folder: string): void {
    this.stop()
    const resolvedFolder = path.resolve(folder)
    this.folder = resolvedFolder
    this.items.clear()

    if (!resolvedFolder || !fs.existsSync(resolvedFolder)) {
      this.emit()
      return
    }

    const arch = archiveDir(resolvedFolder)
    if (!fs.existsSync(arch)) {
      fs.mkdirSync(arch, { recursive: true })
    }

    const state = loadInboxState()
    const known = new Map(state.items.map((i) => [this.key(i.path), i]))

    this.scanDirectory(resolvedFolder, false, known)
    this.scanDirectory(arch, true, known)

    this.persist()
    this.emit()

    // Windows (esp. SMB/network fax folders): native fs.watch often misses events.
    // Polling + periodic rescan makes detection reliable like on Linux.
    const usePolling = process.platform === 'win32'

    this.watcher = chokidar.watch([resolvedFolder, arch], {
      ignored: (p: string) => {
        const full = path.resolve(p)
        if (shouldIgnore(full)) return true
        if (samePath(full, resolvedFolder) || samePath(full, arch)) return false
        if (!isPdf(full)) return true
        const parent = path.dirname(full)
        return !samePath(parent, resolvedFolder) && !samePath(parent, arch)
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
    if (!this.folder) throw new Error('Kein Faxordner')
    const k = this.key(filePath)
    const item = this.items.get(k)
    if (!item) throw new Error('Eintrag nicht gefunden')
    if (item.archived) return { items: this.getItems(), path: item.path }

    const destDir = archiveDir(this.folder)
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
    if (!this.folder) throw new Error('Kein Faxordner')
    const k = this.key(filePath)
    const item = this.items.get(k)
    if (!item) throw new Error('Eintrag nicht gefunden')
    if (!item.archived) return { items: this.getItems(), path: item.path }

    const dest = uniqueTarget(this.folder, item.name)
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
    known: Map<
      string,
      { path: string; addedAt: string; seenAt: string | null; archived?: boolean }
    >,
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
      })
    }
  }

  /** Fallback for Windows/network folders when chokidar misses an event. */
  private rescanForNewFiles(): void {
    if (!this.folder || !fs.existsSync(this.folder)) return

    const roots: Array<{ dir: string; archived: boolean }> = [
      { dir: this.folder, archived: false },
      { dir: archiveDir(this.folder), archived: true },
    ]

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
          // Keep size fresh
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
        }
        this.items.set(k, item)
        changed = true
        this.persist()
        this.emit(archived ? undefined : item)
      }
    }

    // Drop entries whose files vanished (without unlink event)
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
    if (!this.folder || !isPdf(filePath) || shouldIgnore(filePath)) return
    const full = path.resolve(filePath)
    const k = this.key(full)
    if (this.items.has(k)) return

    const parent = path.dirname(full)
    const arch = archiveDir(this.folder)
    const archived = samePath(parent, arch)
    const inInbox = samePath(parent, this.folder)
    if (!archived && !inInbox) return

    const meta = fileMeta(full)
    if (!meta) return

    const item: FaxItem = {
      path: full,
      name: path.basename(full),
      addedAt: new Date().toISOString(),
      seenAt: archived ? new Date().toISOString() : null,
      size: meta.size,
      archived,
    }
    this.items.set(k, item)
    this.persist()
    this.emit(archived ? undefined : item)
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
      items: this.getItems().map(({ path: p, addedAt, seenAt, archived }) => ({
        path: p,
        addedAt,
        seenAt,
        archived,
      })),
    })
  }

  private emit(newlyAdded?: FaxItem): void {
    this.callbacks.onChange(this.getItems(), this.getUnreadCount(), newlyAdded)
  }
}
