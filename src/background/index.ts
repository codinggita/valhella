import { PORT_PANEL, type PanelPortMessage } from '../lib/messages'

const panelPorts = new Map<number, chrome.runtime.Port>()

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
  }
})

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_PANEL) {
    port.onMessage.addListener((raw) => {
      const msg = raw as PanelPortMessage
      if (msg.kind === 'hello') {
        panelPorts.set(msg.windowId, port)
        port.onDisconnect.addListener(() => {
          if (panelPorts.get(msg.windowId) === port) panelPorts.delete(msg.windowId)
        })
      }
    })
  }
})

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-panel') return
  const windowId = tab?.windowId
  if (windowId === undefined) return
  const port = panelPorts.get(windowId)
  if (port) {
    port.postMessage({ kind: 'close' })
  } else {
    void chrome.sidePanel.open({ windowId })
  }
})
