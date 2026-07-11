import { resolveActions } from '../../lib/actions'
import Icon from '../../ui/Icon'
import { useStore } from '../store'

export default function QuickStart() {
  const settings = useStore((s) => s.settings)
  const agentMode = useStore((s) => s.agentMode)
  const composerText = useStore((s) => s.composerText)
  const pageReady = useStore((s) => s.pageContext.status === 'ready')
  const streaming = useStore((s) => s.streaming !== null)
  const send = useStore((s) => s.send)
  const setComposerText = useStore((s) => s.setComposerText)
  const addPageContext = useStore((s) => s.addPageContext)
  if (!settings || agentMode) return null

  const draft = composerText.trim()
  const hasTarget = draft.length > 0 || pageReady
  const actions = resolveActions(settings)

  const run = (id: string) => {
    const action = actions.find((a) => a.id === id)
    if (!action || streaming || !hasTarget) return
    if (draft) {
      setComposerText('')
      void send(`${action.instruction}\n\n<text>\n${draft}\n</text>`)
    } else {
      addPageContext()
      void send(action.instruction)
    }
  }

  if (!hasTarget) {
    return (
      <div className="qs">
        <p className="qs-hint">Ask Briefly anything, or add this page to ask about what you’re reading.</p>
      </div>
    )
  }

  return (
    <div className="qs">
      <div className="qs-pills">
        {actions.map((a, i) => (
          <button
            key={a.id}
            className="qs-pill"
            style={{ animationDelay: `${i * 30}ms` }}
            disabled={streaming}
            onClick={() => run(a.id)}
          >
            <Icon name={a.icon} size={14} />
            {a.name}
          </button>
        ))}
      </div>
    </div>
  )
}
