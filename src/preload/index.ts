import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, FaxItem, PrinterInfo } from '../shared/types'

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
  getInbox: (): Promise<InboxSnapshot> => ipcRenderer.invoke('get-inbox'),
  markSeen: (filePath: string): Promise<FaxItem[]> => ipcRenderer.invoke('mark-seen', filePath),
  markUnseen: (filePath: string): Promise<FaxItem[]> => ipcRenderer.invoke('mark-unseen', filePath),
  deleteFax: (filePath: string): Promise<{ deleted: boolean; items: FaxItem[] }> =>
    ipcRenderer.invoke('delete-fax', filePath),
  archiveFax: (filePath: string): Promise<PathResult> => ipcRenderer.invoke('archive-fax', filePath),
  restoreFax: (filePath: string): Promise<PathResult> => ipcRenderer.invoke('restore-fax', filePath),
  renameFax: (filePath: string, newName: string): Promise<PathResult> =>
    ipcRenderer.invoke('rename-fax', filePath, newName),
  printPreview: (filePath?: string): Promise<boolean> =>
    ipcRenderer.invoke('print-preview', filePath),
  listPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke('list-printers'),
  readPdf: (filePath: string): Promise<ArrayBuffer> => ipcRenderer.invoke('read-pdf', filePath),
  revealInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('reveal-in-folder', filePath),
  getPlatform: (): Promise<string> => ipcRenderer.invoke('get-platform'),
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
