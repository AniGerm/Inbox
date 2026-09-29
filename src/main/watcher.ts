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

export type WatcherCallbacks = {
  onChange: (items: FaxItem[], unreadCount: number, newlyAdded?: FaxItem) => void
}

export class FaxWatcher {
  private watcher: FSWatcher | null = null
  private folder: string | null = null
  private items = new Map<string, FaxItem>()
  private callbacks: WatcherCallbacks

  constructor(callbacks: WatcherCallbacks) {
    this.callbacks = callbacks
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
    this.folder = folder
    this.items.clear()

    if (!folder || !fs.existsSync(folder)) {
      this.emit()
      return
    }

    const arch = archiveDir(folder)
    if (!fs.existsSync(arch)) {
      fs.mkdirSync(arch, { recursive: true })
    }

    const state = loadInboxState()
    const known = new Map(state.items.map((i) => [i.path, i]))

    this.scanDirectory(folder, false, known)
    this.scanDirectory(arch, true, known)

    this.persist()
    this.emit()

    this.watcher = chokidar.watch([folder, arch], {
      ignored: (p) => {
        if (shouldIgnore(p)) return true
        // Allow the roots and their direct PDF children; ignore other dirs/files
        if (p === folder || p === arch) return false
        if (!isPdf(p)) return true
        const parent = path.dirname(p)
        return parent !== folder && parent !== arch
      },
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 800,
        pollInterval: 200,
      },
      depth: 0,
    })

    this.watcher.on('add', (filePath) => this.handleAdd(filePath))
    this.watcher.on('unlink', (filePath) => this.handleUnlink(filePath))
  }

  stop(): void {
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }
  }

  markSeen(filePath: string): FaxItem[] {
    const item = this.items.get(filePath)
    if (item && item.seenAt === null) {
      item.seenAt = new Date().toISOString()
      this.persist()
      this.emit()
    }
    return this.getItems()
  }

  markUnseen(filePath: string): FaxItem[] {
    const item = this.items.get(filePath)
    if (item) {
      item.seenAt = null
      this.persist()
      this.emit()
    }
    return this.getItems()
  }

  remove(filePath: string): FaxItem[] {
    if (this.items.has(filePath)) {
      this.items.delete(filePath)
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
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
    const item = this.items.get(filePath)
    if (!item) throw new Error('Eintrag nicht gefunden')
    if (item.archived) return { items: this.getItems(), path: filePath }

    const destDir = archiveDir(this.folder)
    fs.mkdirSync(destDir, { recursive: true })
    const dest = uniqueTarget(destDir, item.name)
    fs.renameSync(filePath, dest)

    this.items.delete(filePath)
    const moved: FaxItem = {
      ...item,
      path: dest,
      name: path.basename(dest),
      archived: true,
      seenAt: item.seenAt ?? new Date().toISOString(),
    }
    this.items.set(dest, moved)
    this.persist()
    this.emit()
    return { items: this.getItems(), path: dest }
  }

  restore(filePath: string): { items: FaxItem[]; path: string } {
    if (!this.folder) throw new Error('Kein Faxordner')
    const item = this.items.get(filePath)
    if (!item) throw new Error('Eintrag nicht gefunden')
    if (!item.archived) return { items: this.getItems(), path: filePath }

    const dest = uniqueTarget(this.folder, item.name)
    fs.renameSync(filePath, dest)

    this.items.delete(filePath)
    const moved: FaxItem = {
      ...item,
      path: dest,
      name: path.basename(dest),
      archived: false,
    }
    this.items.set(dest, moved)
    this.persist()
    this.emit()
    return { items: this.getItems(), path: dest }
  }

  rename(filePath: string, newName: string): { items: FaxItem[]; path: string } {
    const item = this.items.get(filePath)
    if (!item) throw new Error('Eintrag nicht gefunden')

    const safeName = sanitizePdfName(newName)
    const destDir = path.dirname(filePath)
    const dest = path.join(destDir, safeName)

    if (dest === filePath) {
      return { items: this.getItems(), path: filePath }
    }
    if (fs.existsSync(dest)) {
      throw new Error('Eine Datei mit diesem Namen existiert bereits.')
    }

    fs.renameSync(filePath, dest)
    this.items.delete(filePath)
    const moved: FaxItem = {
      ...item,
      path: dest,
      name: path.basename(dest),
    }
    this.items.set(dest, moved)
    this.persist()
    this.emit()
    return { items: this.getItems(), path: dest }
  }

  private scanDirectory(
    dir: string,
    archived: boolean,
    known: Map<string, { path: string; addedAt: string; seenAt: string | null; archived?: boolean }>,
  ): void {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (!isPdf(full) || shouldIgnore(full)) continue
      // Skip nested folders / the Archiv entry when scanning the root
      try {
        if (!fs.statSync(full).isFile()) continue
      } catch {
        continue
      }
      const meta = fileMeta(full)
      if (!meta) continue
      const existing = known.get(full)
      this.items.set(full, {
        path: full,
        name,
        addedAt: existing?.addedAt ?? meta.mtime.toISOString(),
        seenAt: existing?.seenAt ?? null,
        size: meta.size,
        archived,
      })
    }
  }

  private handleAdd(filePath: string): void {
    if (!this.folder || !isPdf(filePath) || shouldIgnore(filePath)) return
    if (this.items.has(filePath)) return

    const parent = path.dirname(filePath)
    const arch = archiveDir(this.folder)
    const archived = parent === arch
    const inInbox = parent === this.folder
    if (!archived && !inInbox) return

    const meta = fileMeta(filePath)
    if (!meta) return

    const item: FaxItem = {
      path: filePath,
      name: path.basename(filePath),
      addedAt: new Date().toISOString(),
      seenAt: archived ? new Date().toISOString() : null,
      size: meta.size,
      archived,
    }
    this.items.set(filePath, item)
    this.persist()
    // Notify only for fresh inbox arrivals
    this.emit(archived ? undefined : item)
  }

  private handleUnlink(filePath: string): void {
    if (!this.items.has(filePath)) return
    this.items.delete(filePath)
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
