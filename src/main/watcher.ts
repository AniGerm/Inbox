import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'
import {
  loadInboxState,
  saveInboxState,
  getInboxStatePath,
  loadSettings,
} from './store'
import {
  ARCHIVE_DIR_NAME,
  normalizeNote,
  normalizeTags,
  normalizeUsers,
  type ExportStatus,
  type FaxItem,
  type PrintStatus,
} from '../shared/types'

type KnownItem = {
  path: string
  addedAt: string
  seenAt: string | null
  archived?: boolean
  printStatus?: PrintStatus
  printedAt?: string | null
  exportStatus?: ExportStatus
  exportedAt?: string | null
  assignedTo?: string | null
  assignedAt?: string | null
  priority?: boolean
  note?: string | null
  tags?: string[]
}

function assignmentFieldsFromKnown(
  existing?: KnownItem,
): Pick<FaxItem, 'assignedTo' | 'assignedAt'> {
  const assignedTo =
    typeof existing?.assignedTo === 'string' && existing.assignedTo.trim()
      ? existing.assignedTo.trim()
      : null
  const assignedAt =
    assignedTo && typeof existing?.assignedAt === 'string' && existing.assignedAt
      ? existing.assignedAt
      : null
  return { assignedTo, assignedAt }
}

function metaFieldsFromKnown(
  existing?: KnownItem,
): Pick<FaxItem, 'priority' | 'note' | 'tags'> {
  return {
    priority: existing?.priority === true,
    note: normalizeNote(existing?.note ?? null),
    tags: normalizeTags(existing?.tags),
  }
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
  private users: string[] = []
  private callbacks: WatcherCallbacks
  private rescanTimer: ReturnType<typeof setInterval> | null = null
  private stateSyncTimer: ReturnType<typeof setInterval> | null = null
  private autoArchiveTimer: ReturnType<typeof setInterval> | null = null
  private lastStateMtimeMs = 0
  private writingState = false

  constructor(callbacks: WatcherCallbacks) {
    this.callbacks = callbacks
  }

  getUsers(): string[] {
    return [...this.users]
  }

  addUser(name: string): string[] {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Benutzername darf nicht leer sein.')
    const key = trimmed.toLowerCase()
    if (this.users.some((u) => u.toLowerCase() === key)) {
      return this.getUsers()
    }
    this.users = [...this.users, trimmed]
    this.persist()
    this.emit()
    return this.getUsers()
  }

  removeUser(name: string): string[] {
    const key = name.trim().toLowerCase()
    if (!key) return this.getUsers()
    const before = this.users.length
    this.users = this.users.filter((u) => u.toLowerCase() !== key)
    if (this.users.length === before) return this.getUsers()

    let cleared = false
    for (const item of this.items.values()) {
      if (item.assignedTo?.toLowerCase() === key) {
        item.assignedTo = null
        item.assignedAt = null
        cleared = true
      }
    }
    this.persist()
    if (cleared) this.emit()
    else this.emit()
    return this.getUsers()
  }

  /** Assign document to a shared user, or null to clear assignment. */
  assignFax(filePath: string, userName: string | null): FaxItem[] {
    this.applyAssign(filePath, userName)
    this.persist()
    this.emit()
    return this.getItems()
  }

  assignMany(filePaths: string[], userName: string | null): FaxItem[] {
    for (const p of filePaths) {
      try {
        this.applyAssign(p, userName)
      } catch {
        /* skip missing */
      }
    }
    this.persist()
    this.emit()
    return this.getItems()
  }

  private applyAssign(filePath: string, userName: string | null): void {
    const item = this.items.get(this.key(filePath))
    if (!item) throw new Error('Eintrag nicht gefunden')

    if (userName === null || userName.trim() === '') {
      item.assignedTo = null
      item.assignedAt = null
      return
    }

    const trimmed = userName.trim()
    const match = this.users.find((u) => u.toLowerCase() === trimmed.toLowerCase())
    if (!match) throw new Error('Unbekannter Benutzer. Bitte zuerst in den Einstellungen anlegen.')
    item.assignedTo = match
    item.assignedAt = new Date().toISOString()
  }

  setPriority(filePath: string, priority: boolean): FaxItem[] {
    const item = this.items.get(this.key(filePath))
    if (!item) throw new Error('Eintrag nicht gefunden')
    item.priority = priority === true
    this.persist()
    this.emit()
    return this.getItems()
  }

  setPriorityMany(filePaths: string[], priority: boolean): FaxItem[] {
    for (const p of filePaths) {
      const item = this.items.get(this.key(p))
      if (item) item.priority = priority === true
    }
    this.persist()
    this.emit()
    return this.getItems()
  }

  setNote(filePath: string, note: string | null): FaxItem[] {
    const item = this.items.get(this.key(filePath))
    if (!item) throw new Error('Eintrag nicht gefunden')
    item.note = normalizeNote(note)
    this.persist()
    this.emit()
    return this.getItems()
  }

  setTags(filePath: string, tags: string[]): FaxItem[] {
    const item = this.items.get(this.key(filePath))
    if (!item) throw new Error('Eintrag nicht gefunden')
    item.tags = normalizeTags(tags)
    this.persist()
    this.emit()
    return this.getItems()
  }

  setTagsMany(filePaths: string[], tags: string[], mode: 'replace' | 'add' = 'add'): FaxItem[] {
    const nextTags = normalizeTags(tags)
    for (const p of filePaths) {
      const item = this.items.get(this.key(p))
      if (!item) continue
      if (mode === 'replace') {
        item.tags = nextTags
      } else {
        item.tags = normalizeTags([...item.tags, ...nextTags])
      }
    }
    this.persist()
    this.emit()
    return this.getItems()
  }

  archiveMany(filePaths: string[]): FaxItem[] {
    for (const p of filePaths) {
      try {
        const item = this.items.get(this.key(p))
        if (item && !item.archived) this.archive(p)
      } catch (err) {
        console.error('Stapel-Archiv fehlgeschlagen:', err)
      }
    }
    return this.getItems()
  }

  /** Delete without UI confirm — caller must confirm once for batches. */
  removeMany(filePaths: string[]): FaxItem[] {
    for (const p of filePaths) {
      const k = this.key(p)
      const item = this.items.get(k)
      if (!item) continue
      this.items.delete(k)
      try {
        if (fs.existsSync(item.path)) fs.unlinkSync(item.path)
      } catch (err) {
        console.error('Stapel-Löschen fehlgeschlagen:', err)
      }
    }
    this.persist()
    this.emit()
    return this.getItems()
  }

  /** Archive seen, non-archived items older than settings threshold. */
  runAutoArchive(): number {
    const settings = loadSettings()
    if (!settings.autoArchiveEnabled) return 0
    const days = settings.autoArchiveAfterDays
    const cutoff = Date.now() - days * 86_400_000
    const candidates = this.getItems().filter(
      (i) =>
        !i.archived &&
        i.seenAt != null &&
        new Date(i.addedAt).getTime() < cutoff,
    )
    let count = 0
    for (const item of candidates) {
      try {
        this.archive(item.path)
        count += 1
      } catch (err) {
        console.error('Auto-Archiv fehlgeschlagen:', err)
      }
    }
    return count
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

    const state = loadInboxState()
    this.users = normalizeUsers(state.users)

    if (this.folders.length === 0) {
      this.emit()
      return
    }

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

    // Multi-client: pick up read/print/export markers from shared inbox-state.json
    this.stateSyncTimer = setInterval(() => {
      this.reloadSharedStateIfChanged()
    }, 2000)
    this.touchStateMtime()

    this.runAutoArchive()
    this.autoArchiveTimer = setInterval(() => {
      this.runAutoArchive()
    }, 5 * 60_000)
  }

  stop(): void {
    if (this.rescanTimer) {
      clearInterval(this.rescanTimer)
      this.rescanTimer = null
    }
    if (this.stateSyncTimer) {
      clearInterval(this.stateSyncTimer)
      this.stateSyncTimer = null
    }
    if (this.autoArchiveTimer) {
      clearInterval(this.autoArchiveTimer)
      this.autoArchiveTimer = null
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
    if (!root) throw new Error('Kein Eingangsordner für diese Datei')

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
    if (!root) throw new Error('Kein Eingangsordner für diese Datei')

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
        ...assignmentFieldsFromKnown(existing),
        ...metaFieldsFromKnown(existing),
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
          assignedTo: null,
          assignedAt: null,
          priority: false,
          note: null,
          tags: [],
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
      assignedTo: null,
      assignedAt: null,
      priority: false,
      note: null,
      tags: [],
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
    this.writingState = true
    try {
      saveInboxState({
        users: this.users,
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
            assignedTo,
            assignedAt,
            priority,
            note,
            tags,
          }) => ({
            path: p,
            addedAt,
            seenAt,
            archived,
            printStatus,
            printedAt,
            exportStatus,
            exportedAt,
            assignedTo,
            assignedAt,
            priority,
            note,
            tags,
          }),
        ),
      })
      this.touchStateMtime()
    } finally {
      // Brief grace so our own write does not bounce back as "external"
      setTimeout(() => {
        this.writingState = false
      }, 250)
    }
  }

  private touchStateMtime(): void {
    try {
      const p = getInboxStatePath()
      if (fs.existsSync(p)) {
        this.lastStateMtimeMs = fs.statSync(p).mtimeMs
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Apply metadata from a shared inbox-state.json written by another client
   * (seen / print / export / assignment / users). Last writer wins via file mtime.
   */
  private reloadSharedStateIfChanged(): void {
    if (this.writingState) return
    try {
      const p = getInboxStatePath()
      if (!fs.existsSync(p)) return
      const mtime = fs.statSync(p).mtimeMs
      if (mtime <= this.lastStateMtimeMs) return
      this.lastStateMtimeMs = mtime

      const state = loadInboxState()
      let changed = false

      const nextUsers = normalizeUsers(state.users)
      if (
        nextUsers.length !== this.users.length ||
        nextUsers.some((u, i) => u !== this.users[i])
      ) {
        this.users = nextUsers
        changed = true
      }

      for (const known of state.items) {
        const item = this.items.get(this.key(known.path))
        if (!item) continue

        const nextSeen = known.seenAt ?? null
        if (item.seenAt !== nextSeen) {
          item.seenAt = nextSeen
          changed = true
        }

        const printFields = printFieldsFromKnown(known)
        if (
          item.printStatus !== printFields.printStatus ||
          item.printedAt !== printFields.printedAt
        ) {
          item.printStatus = printFields.printStatus
          item.printedAt = printFields.printedAt
          changed = true
        }

        const exportFields = exportFieldsFromKnown(known)
        if (
          item.exportStatus !== exportFields.exportStatus ||
          item.exportedAt !== exportFields.exportedAt
        ) {
          item.exportStatus = exportFields.exportStatus
          item.exportedAt = exportFields.exportedAt
          changed = true
        }

        const assignment = assignmentFieldsFromKnown(known)
        if (
          item.assignedTo !== assignment.assignedTo ||
          item.assignedAt !== assignment.assignedAt
        ) {
          item.assignedTo = assignment.assignedTo
          item.assignedAt = assignment.assignedAt
          changed = true
        }

        const meta = metaFieldsFromKnown(known)
        if (item.priority !== meta.priority) {
          item.priority = meta.priority
          changed = true
        }
        if (item.note !== meta.note) {
          item.note = meta.note
          changed = true
        }
        const tagsKey = (item.tags ?? []).join('\0')
        const nextTagsKey = meta.tags.join('\0')
        if (tagsKey !== nextTagsKey) {
          item.tags = meta.tags
          changed = true
        }

        if (typeof known.archived === 'boolean' && item.archived !== known.archived) {
          // Do not flip archived from remote metadata alone — archive is a file move.
        }
      }

      if (changed) {
        this.emit()
      }
    } catch (err) {
      console.error('Shared-State Sync fehlgeschlagen:', err)
    }
  }

  private emit(newlyAdded?: FaxItem): void {
    this.callbacks.onChange(this.getItems(), this.getUnreadCount(), newlyAdded)
  }
}
