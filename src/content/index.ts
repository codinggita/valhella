import { isTabMessage } from '../lib/messages'
import { extractPage } from './extractor'

declare global {
  interface Window {
    __brieflyContent?: boolean
  }
}

function init(): void {
  if (window.__brieflyContent) return
  window.__brieflyContent = true

  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    if (!isTabMessage(raw)) return
    if (raw.kind === 'extract-page') {
      sendResponse(extractPage())
    }
  })
}

init()

export {}
