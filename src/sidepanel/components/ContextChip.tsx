import { useState } from 'react'
import { hostnameOf } from '../../lib/settings'
import { unreadableCopy } from '../../lib/pagecontext'
import Icon from '../../ui/Icon'
import IconButton from '../../ui/IconButton'
import Menu from '../../ui/Menu'
import { useStore } from '../store'

function ChipFavicon({ url, favIconUrl }: { url: string; favIconUrl: string | null }) {
  const [failed, setFailed] = useState(false)
  const src = favIconUrl ?? `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`
  if (failed) return <Icon name="page" size={12} />
  return <img className="ctx-favicon" src={src} alt="" width={13} height={13} onError={() => setFailed(true)} />
}

export default function ContextChip() {
  const pc = useStore((s) => s.pageContext)
  const removePageContext = useStore((s) => s.removePageContext)
  const restorePageContext = useStore((s) => s.restorePageContext)
  const blockCurrentSite = useStore((s) => s.blockCurrentSite)
  const unblockSite = useStore((s) => s.unblockSite)

  if (pc.status === 'none') return null

  if (pc.status === 'ready') {
    const host = hostnameOf(pc.page.url) ?? ''
    return (
      <div className="ctxrow">
        <div className="ctx-chip">
          <Menu
            entries={[
              { id: 'remove', label: 'Remove for this message', icon: 'x' },
              { id: 'block', label: `Never attach on ${host}`, icon: 'eye-off' }
            ]}
            onSelect={(id) => {
              if (id === 'remove') removePageContext()
              else if (id === 'block') void blockCurrentSite()
            }}
            trigger={(p) => (
              <button
                ref={p.ref}
                onClick={p.onClick}
                aria-expanded={p['aria-expanded']}
                aria-haspopup={p['aria-haspopup']}
                className="ctx-chip-main"
                title={pc.page.title}
              >
                <ChipFavicon url={pc.page.url} favIconUrl={pc.favIconUrl} />
                <span className="ctx-title">{pc.page.title}</span>
                <Icon name="chevron-down" size={10} />
              </button>
            )}
          />
          <IconButton icon="x" label="Remove page context" size="sm" onClick={removePageContext} />
        </div>
      </div>
    )
  }

  if (pc.status === 'removed') {
    return (
      <div className="ctxrow ctx-muted">
        <Icon name="eye-off" size={12} />
        <span>Page context off for this message</span>
        <button className="ctx-link" onClick={restorePageContext}>
          Undo
        </button>
      </div>
    )
  }

  if (pc.status === 'blocked') {
    return (
      <div className="ctxrow ctx-muted">
        <Icon name="eye-off" size={12} />
        <span>Never attached on {pc.host}</span>
        <button className="ctx-link" onClick={() => void unblockSite(pc.host)}>
          Allow
        </button>
      </div>
    )
  }

  return (
    <div className="ctxrow ctx-muted">
      <Icon name="warning" size={12} />
      <span>{unreadableCopy(pc.reason)}</span>
    </div>
  )
}
