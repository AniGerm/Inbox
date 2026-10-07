import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  FaxItem,
  PrinterInfo,
  UpdateStatusEvent,
} from '../shared/types'

export interface InboxSnapshot {
  items: FaxItem[]
  unreadCount: number
}

export interface PathResult {
  items: FaxItem[]
  path: string
}

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  saveSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('save-settings', partial),
  pickFaxFolder: (): Promise<string | null> => ipcRenderer.invoke('pick-fax-folder'),
  pickExportFolder: (): Promise<string | null> => ipcRenderer.invoke('pick-export-folder'),
  pickStateFolder: (): Promise<string | null> => ipcRenderer.invoke('pick-state-folder'),
  exportFax: (
    filePath: string,
  ): Promise<{ ok: true; dest: string; items: FaxItem[] }> =>
    ipcRenderer.invoke('export-fax', filePath),
  getInbox: (): Promise<InboxSnapshot> => ipcRenderer.invoke('get-inbox'),
  markSeen: (filePath: string): Promise<FaxItem[]> => ipcRenderer.invoke('mark-seen', filePath),
  markUnseen: (filePath: string): Promise<FaxItem[]> => ipcRenderer.invoke('mark-unseen', filePath),
  deleteFax: (filePath: string): Promise<{ deleted: boolean; items: FaxItem[] }> =>
    ipcRenderer.invoke('delete-fax', filePath),
  archiveFax: (filePath: string): Promise<PathResult> => ipcRenderer.invoke('archive-fax', filePath),
  restoreFax: (filePath: string): Promise<PathResult> => ipcRenderer.invoke('restore-fax', filePath),
  renameFax: (filePath: string, newName: string): Promise<PathResult> =>
    ipcRenderer.invoke('rename-fax', filePath, newName),
  assignFax: (filePath: string, userName: string | null): Promise<FaxItem[]> =>
    ipcRenderer.invoke('assign-fax', filePath, userName),
  getUsers: (): Promise<string[]> => ipcRenderer.invoke('get-users'),
  addUser: (name: string): Promise<string[]> => ipcRenderer.invoke('add-user', name),
  removeUser: (name: string): Promise<string[]> => ipcRenderer.invoke('remove-user', name),
  printPreview: (filePath?: string): Promise<boolean> =>
    ipcRenderer.invoke('print-preview', filePath),
  listPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke('list-printers'),
  readPdf: (filePath: string): Promise<ArrayBuffer> => ipcRenderer.invoke('read-pdf', filePath),
  revealInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('reveal-in-folder', filePath),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('get-platform'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('download-update'),
  installUpdate: (): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb: (event: UpdateStatusEvent) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: UpdateStatusEvent) => cb(event)
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },
  onInboxUpdated: (cb: (snap: InboxSnapshot) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, snap: InboxSnapshot) => cb(snap)
    ipcRenderer.on('inbox-updated', handler)
    return () => ipcRenderer.removeListener('inbox-updated', handler)
  },
  onFocusNewest: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('focus-newest', handler)
    return () => ipcRenderer.removeListener('focus-newest', handler)
  },
  onFocusItem: (cb: (filePath: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, filePath: string) => cb(filePath)
    ipcRenderer.on('focus-item', handler)
    return () => ipcRenderer.removeListener('focus-item', handler)
  },
}

contextBridge.exposeInMainWorld('faxInbox', api)

export type FaxInboxApi = typeof api
