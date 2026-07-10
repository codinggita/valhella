import { useEffect, useRef } from 'react'
import { resolveActions } from '../../lib/actions'
import Icon from '../../ui/Icon'
import IconButton from '../../ui/IconButton'
import Menu, { type MenuEntry } from '../../ui/Menu'
import ContextChip from './ContextChip'
import ModelPicker from './ModelPicker'
import { useStore } from '../store'

function QuickActionsMenu() {
  const settings = useStore((s) => s.settings)
  const composerText = useStore((s) => s.composerText)
  const pageReady = useStore((s) => s.pageContext.status === 'ready')
  const streaming = useStore((s) => s.streaming !== null)
  const send = useStore((s) => s.send)
  const setComposerText = useStore((s) => s.setComposerText)
  if (!settings) return null
  const hasTarget = composerText.trim().length > 0 || pageReady
  const entries: MenuEntry[] = [
    { title: composerText.trim() ? 'Act on your draft' : pageReady ? 'Act on this page' : 'Quick actions' },
    ...resolveActions(settings).map((a) => ({
      id: a.id,
      label: a.name,
      icon: a.icon,
      disabled: !hasTarget || streaming
    }))
  ]
  return (
    <Menu
      entries={entries}
      onSelect={(id) => {
        const action = resolveActions(settings).find((a) => a.id === id)
        if (!action || streaming || !hasTarget) return
        const draft = composerText.trim()
        if (draft) {
          setComposerText('')
          void send(`${action.instruction}\n\n<text>\n${draft}\n</text>`)
        } else {
          void send(action.instruction)
        }
      }}
      trigger={(p) => (
        <button
          ref={p.ref}
          onClick={p.onClick}
          aria-expanded={p['aria-expanded']}
          aria-haspopup={p['aria-haspopup']}
          className="iconbtn"
          aria-label="Quick actions"
          disabled={!hasTarget}
        >
          <Icon name="sparkle" size={15} />
        </button>
      )}
    />
  )
}

export default function Composer() {
  const composerText = useStore((s) => s.composerText)
  const setComposerText = useStore((s) => s.setComposerText)
  const streaming = useStore((s) => s.streaming !== null)
  const editing = useStore((s) => s.editing)
  const send = useStore((s) => s.send)
  const stop = useStore((s) => s.stop)
  const cancelEdit = useStore((s) => s.cancelEdit)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`
  }, [composerText])

  useEffect(() => {
    if (!streaming) taRef.current?.focus()
  }, [streaming])

  useEffect(() => {
    if (editing) taRef.current?.focus()
  }, [editing])

  const canSend = composerText.trim().length > 0

  return (
    <div className="composer">
      {editing && (
        <div className="composer-edit">
          <Icon name="pencil" size={12} />
          <span>Editing your last message</span>
          <IconButton icon="x" label="Cancel editing" size="sm" onClick={cancelEdit} />
        </div>
      )}
      <div className="composer-box">
        <ContextChip />
        <textarea
          ref={taRef}
          className="composer-input"
          rows={1}
          placeholder="Ask Briefly…"
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!streaming && canSend) void send()
            } else if (e.key === 'Escape' && editing) {
              cancelEdit()
            }
          }}
        />
        <div className="composer-row">
          <QuickActionsMenu />
          <ModelPicker />
          <span className="composer-spacer" />
          {streaming ? (
            <button className="send send-stop" onClick={stop} aria-label="Stop generating">
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button className="send" onClick={() => void send()} disabled={!canSend} aria-label="Send message">
              <Icon name="arrow-up" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
