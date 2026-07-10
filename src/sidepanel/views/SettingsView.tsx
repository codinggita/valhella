import { useState } from 'react'
import { db } from '../../lib/db'
import { allDataToJson, downloadFile } from '../../lib/export'
import { updateSettings, type ThemeChoice } from '../../lib/settings'
import { validateKey } from '../../lib/anthropic/client'
import Button from '../../ui/Button'
import Dialog from '../../ui/Dialog'
import Icon, { type IconName } from '../../ui/Icon'
import IconButton from '../../ui/IconButton'
import { Input } from '../../ui/Input'
import { useStore } from '../store'

function maskKey(key: string): string {
  if (key.length <= 10) return '••••••••'
  return `${key.slice(0, 7)}…${key.slice(-4)}`
}

export function KeyEditor({ onSaved }: { onSaved?: () => void }) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle')
  const [message, setMessage] = useState('')

  const check = async () => {
    const key = value.trim()
    if (!key) return
    setState('checking')
    const res = await validateKey(key)
    if (res.ok) {
      await updateSettings({ apiKey: key })
      setState('ok')
      setMessage('Key verified and saved.')
      setValue('')
      onSaved?.()
    } else {
      setState('bad')
      setMessage(
        res.error.code === 'auth'
          ? "Anthropic rejected this key. Check it's copied whole."
          : res.error.code === 'network'
            ? "Couldn't reach the Anthropic API to verify."
            : res.error.message
      )
    }
  }

  return (
    <div className="keyed">
      <div className="keyed-row">
        <Input
          type={show ? 'text' : 'password'}
          placeholder="sk-ant-…"
          value={value}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state === 'bad'}
          onChange={(e) => {
            setValue(e.target.value)
            setState('idle')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void check()
          }}
        />
        <button className="iconbtn keyed-eye" aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)}>
          <Icon name={show ? 'eye-off' : 'eye'} size={15} />
        </button>
        <Button variant="primary" loading={state === 'checking'} disabled={!value.trim()} onClick={() => void check()}>
          Verify
        </Button>
      </div>
      {state === 'ok' && (
        <div className="keyed-note keyed-ok">
          <Icon name="check" size={13} />
          {message}
        </div>
      )}
      {state === 'bad' && (
        <div className="keyed-note keyed-bad">
          <Icon name="warning" size={13} />
          {message}
        </div>
      )}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  return (
    <section className="set-section">
      <h2 className="set-h">
        <Icon name={icon} size={13} />
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function SettingsView() {
  const settings = useStore((s) => s.settings)
  const [editingKey, setEditingKey] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [cleared, setCleared] = useState(false)
  const newChat = useStore((s) => s.newChat)

  if (!settings) return null

  const setTheme = (theme: ThemeChoice) => void updateSettings({ theme })

  const exportAll = async () => {
    const conversations = await db.conversations.orderBy('updatedAt').reverse().toArray()
    const data = []
    for (const conversation of conversations) {
      const messages = await db.messages.where('conversationId').equals(conversation.id).sortBy('createdAt')
      data.push({ conversation, messages })
    }
    downloadFile('briefly-export.json', 'application/json', allDataToJson(data, settings))
  }

  const clearAll = async () => {
    await db.messages.clear()
    await db.conversations.clear()
    await db.audioCache.clear()
    setClearOpen(false)
    setCleared(true)
    newChat()
    window.setTimeout(() => setCleared(false), 2500)
  }

  return (
    <div className="set">
      <Section title="API key" icon="key">
        {settings.apiKey && !editingKey ? (
          <div className="set-keyrow">
            <span className="set-keymask">{maskKey(settings.apiKey)}</span>
            <Button size="sm" onClick={() => setEditingKey(true)}>
              Replace
            </Button>
          </div>
        ) : (
          <KeyEditor onSaved={() => setEditingKey(false)} />
        )}
        <p className="set-note">
          Your key lives only in this browser's extension storage and is sent only to api.anthropic.com.
        </p>
      </Section>

      <Section title="Appearance" icon="sun">
        <div className="seg" role="radiogroup" aria-label="Theme">
          {(
            [
              ['system', 'monitor', 'System'],
              ['light', 'sun', 'Light'],
              ['dark', 'moon', 'Dark']
            ] as const
          ).map(([value, icon, label]) => (
            <button
              key={value}
              className={`seg-btn${settings.theme === value ? ' on' : ''}`}
              role="radio"
              aria-checked={settings.theme === value}
              onClick={() => setTheme(value)}
            >
              <Icon name={icon} size={13} />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Sites" icon="globe">
        <div className="set-row">
          <div className="set-row-main">
            <div className="set-row-title">Page context blocklist</div>
            <div className="set-row-sub">Briefly never attaches page content on these sites.</div>
          </div>
        </div>
        {settings.siteContextBlocklist.length === 0 ? (
          <p className="set-note">
            No sites blocked. Use the context chip's menu in the composer to add the site you're on.
          </p>
        ) : (
          <ul className="set-sitelist">
            {settings.siteContextBlocklist.map((host) => (
              <li key={host} className="set-site">
                <span className="set-site-host">{host}</span>
                <IconButton
                  icon="x"
                  label={`Allow context on ${host}`}
                  size="sm"
                  onClick={() =>
                    void updateSettings({
                      siteContextBlocklist: settings.siteContextBlocklist.filter((h) => h !== host)
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Data" icon="download">
        <div className="set-row">
          <div className="set-row-main">
            <div className="set-row-title">Export everything</div>
            <div className="set-row-sub">All conversations and settings as JSON. Your key is never included.</div>
          </div>
          <Button size="sm" icon="download" onClick={() => void exportAll()}>
            Export
          </Button>
        </div>
        <div className="set-row">
          <div className="set-row-main">
            <div className="set-row-title">Clear all conversations</div>
            <div className="set-row-sub">Removes every conversation and cached audio. Keeps your key and settings.</div>
          </div>
          <Button size="sm" variant="danger" onClick={() => setClearOpen(true)}>
            {cleared ? 'Cleared' : 'Clear…'}
          </Button>
        </div>
      </Section>

      <Dialog
        open={clearOpen}
        title="Clear all conversations?"
        confirmLabel="Clear everything"
        danger
        onClose={() => setClearOpen(false)}
        onConfirm={() => void clearAll()}
      >
        Every conversation on this device will be deleted. Export first if you want a copy — there's no undo.
      </Dialog>
    </div>
  )
}
