import { MODELS, MODEL_LIST, isModelId } from '../../lib/models'
import Icon from '../../ui/Icon'
import Menu from '../../ui/Menu'
import { useStore } from '../store'

export default function ModelPicker() {
  const model = useStore((s) => s.model)
  const setModel = useStore((s) => s.setModel)
  return (
    <Menu
      entries={MODEL_LIST.map((m) => ({ id: m.id, label: m.label, sub: m.tagline, checked: m.id === model }))}
      onSelect={(id) => {
        if (isModelId(id)) setModel(id)
      }}
      trigger={(p) => (
        <button
          ref={p.ref}
          onClick={p.onClick}
          aria-expanded={p['aria-expanded']}
          aria-haspopup={p['aria-haspopup']}
          className="picker"
          aria-label="Choose model"
        >
          {MODELS[model].label}
          <Icon name="chevron-down" size={12} />
        </button>
      )}
    />
  )
}
