import type { FaxInboxApi } from '../preload/index'

declare global {
  interface Window {
    faxInbox: FaxInboxApi
  }
}

export {}
