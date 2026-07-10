import { isTabMessage } from '../lib/messages'
import { extractPage } from './extractor'
import { initPopup } from './popup'

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

  initPopup()
}

init()

export {}
