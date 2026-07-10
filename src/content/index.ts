declare global {
  interface Window {
    __brieflyContent?: boolean
  }
}

function init(): void {
  if (window.__brieflyContent) return
  window.__brieflyContent = true
}

init()

export {}
