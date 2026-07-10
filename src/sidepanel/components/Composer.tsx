import { useEffect, useRef, useState } from 'react'
import { resolveActions } from '../../lib/actions'
import { imageBlobsFromClipboard, prepareImage } from '../../lib/images'
import { Dictation } from '../../lib/stt'
import { newId } from '../../lib/db'
import Icon from '../../ui/Icon'
import IconButton from '../../ui/IconButton'
import Menu, { type MenuEntry } from '../../ui/Menu'
import ContextChip from './ContextChip'
import ModelPicker from './ModelPicker'
import { runAgentTask, stopAgent, useAgent } from '../agent'
import { useStore } from '../store'

function WebSearchToggle() {
  const webSearch = useStore((s) => s.webSearch)
  const toggleWebSearch = useStore((s) => s.toggleWebSearch)
  return (
    <IconButton
      icon="globe"
      label={webSearch ? 'Web search on' : 'Web search off'}
      active={webSearch}
      onClick={toggleWebSearch}
    />
  )
}

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

function AttachMenu({ onNotice }: { onNotice: (text: string) => void }) {
  const addAttachment = useStore((s) => s.addAttachment)
  const fileRef = useRef<HTMLInputElement>(null)

  const attachBlob = async (blob: Blob) => {
    try {
      const img = await prepareImage(blob)
      addAttachment({ id: newId(), mediaType: img.mediaType, data: img.data })
    } catch {
      onNotice("Couldn't read that image.")
    }
  }

  const capture = async () => {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 })
      const img = await prepareImage(dataUrl)
      addAttachment({ id: newId(), mediaType: img.mediaType, data: img.data })
    } catch {
      onNotice("Chrome wouldn't let Briefly capture this page.")
    }
  }

  return (
    <>
      <Menu
        entries={[
          { id: 'upload', label: 'Attach image…', icon: 'image' },
          { id: 'capture', label: 'Capture this page', icon: 'camera' }
        ]}
        onSelect={(id) => {
          if (id === 'upload') fileRef.current?.click()
          else if (id === 'capture') void capture()
        }}
        trigger={(p) => (
          <button
            ref={p.ref}
            onClick={p.onClick}
            aria-expanded={p['aria-expanded']}
            aria-haspopup={p['aria-haspopup']}
            className="iconbtn"
            aria-label="Add an image"
          >
            <Icon name="image" size={15} />
          </button>
        )}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          for (const file of Array.from(e.target.files ?? [])) void attachBlob(file)
          e.target.value = ''
        }}
      />
    </>
  )
}

function AttachmentTray() {
  const attachments = useStore((s) => s.attachments)
  const removeAttachment = useStore((s) => s.removeAttachment)
  if (attachments.length === 0) return null
  return (
    <div className="attach-tray">
      {attachments.map((a) => (
        <span key={a.id} className="attach-thumb">
          <img src={`data:${a.mediaType};base64,${a.data}`} alt="Attached image" />
          <button className="attach-x" aria-label="Remove image" onClick={() => removeAttachment(a.id)}>
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
    </div>
  )
}

export default function Composer() {
  const composerText = useStore((s) => s.composerText)
  const setComposerText = useStore((s) => s.setComposerText)
  const streaming = useStore((s) => s.streaming !== null)
  const editing = useStore((s) => s.editing)
  const hasAttachments = useStore((s) => s.attachments.length > 0)
  const agentMode = useStore((s) => s.agentMode)
  const setAgentMode = useStore((s) => s.setAgentMode)
  const model = useStore((s) => s.model)
  const send = useStore((s) => s.send)
  const stop = useStore((s) => s.stop)
  const cancelEdit = useStore((s) => s.cancelEdit)
  const agentRunning = useAgent((s) => s.running)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const dictationRef = useRef<Dictation | null>(null)
  const baseRef = useRef('')
  const [dictating, setDictating] = useState(false)
  const [interim, setInterim] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeAction, setNoticeAction] = useState<'setup' | null>(null)

  const busy = streaming || agentRunning

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 168)}px`
    if (overlayRef.current) overlayRef.current.scrollTop = ta.scrollTop
  }, [composerText, interim])

  useEffect(() => {
    if (!busy) taRef.current?.focus()
  }, [busy])

  useEffect(() => {
    if (editing) taRef.current?.focus()
  }, [editing])

  useEffect(() => {
    return () => dictationRef.current?.stop()
  }, [])

  const stopDictation = () => dictationRef.current?.stop()

  const toggleMic = () => {
    if (dictating) {
      stopDictation()
      return
    }
    setNotice(null)
    setNoticeAction(null)
    const d = new Dictation()
    dictationRef.current = d
    const current = useStore.getState().composerText
    baseRef.current = current ? `${current.replace(/\s+$/, '')} ` : ''
    setDictating(true)
    d.start({
      onText: (finalText, interimText) => {
        setComposerText(baseRef.current + finalText)
        setInterim(interimText)
      },
      onStop: () => {
        setDictating(false)
        setInterim('')
        taRef.current?.focus()
      },
      onError: (code) => {
        setDictating(false)
        setInterim('')
        if (code === 'not-allowed') {
          setNotice('Microphone is blocked — allow it from the setup page.')
          setNoticeAction('setup')
        } else if (code === 'network') {
          setNotice('Dictation needs a connection.')
        } else {
          setNotice("Dictation isn't available in this browser.")
        }
      }
    })
  }

  const doSend = () => {
    stopDictation()
    const text = useStore.getState().composerText.trim()
    if (agentMode) {
      if (!text) return
      setComposerText('')
      void runAgentTask(text)
    } else {
      void send()
    }
  }

  const canSend = composerText.trim().length > 0 || (!agentMode && hasAttachments)

  return (
    <div className="composer">
      {editing && (
        <div className="composer-edit">
          <Icon name="pencil" size={12} />
          <span>Editing your last message</span>
          <IconButton icon="x" label="Cancel editing" size="sm" onClick={cancelEdit} />
        </div>
      )}
      {notice && (
        <div className="composer-edit">
          <Icon name="warning" size={12} />
          <span>{notice}</span>
          {noticeAction === 'setup' && (
            <button
              className="ctx-link"
              onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })}
            >
              Open setup
            </button>
          )}
          <IconButton
            icon="x"
            label="Dismiss"
            size="sm"
            onClick={() => {
              setNotice(null)
              setNoticeAction(null)
            }}
          />
        </div>
      )}
      <div className="composer-box">
        {!agentMode && <ContextChip />}
        {!agentMode && <AttachmentTray />}
        <div className="composer-inputwrap">
          <textarea
            ref={taRef}
            className="composer-input"
            rows={1}
            placeholder={
              dictating ? 'Listening…' : agentMode ? 'Tell Briefly what to do in your browser…' : 'Ask Briefly…'
            }
            value={composerText}
            readOnly={dictating}
            onChange={(e) => setComposerText(e.target.value)}
            onPaste={(e) => {
              if (agentMode) return
              const blobs = imageBlobsFromClipboard(e.clipboardData.items)
              if (blobs.length > 0) {
                e.preventDefault()
                for (const blob of blobs) {
                  void prepareImage(blob).then((img) =>
                    useStore.getState().addAttachment({ id: newId(), mediaType: img.mediaType, data: img.data })
                  )
                }
              }
            }}
            onScroll={() => {
              if (overlayRef.current && taRef.current) overlayRef.current.scrollTop = taRef.current.scrollTop
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (!busy && canSend) doSend()
              } else if (e.key === 'Escape' && dictating) {
                stopDictation()
              } else if (e.key === 'Escape' && editing) {
                cancelEdit()
              }
            }}
          />
          {dictating && (
            <div ref={overlayRef} className="composer-overlay" aria-hidden="true">
              <span className="composer-overlay-final">{composerText}</span>
              <span className="composer-overlay-interim">{interim ? ` ${interim.trim()}` : ''}</span>
            </div>
          )}
        </div>
        <div className="composer-row">
          <div className="modeseg" role="radiogroup" aria-label="Mode">
            <button
              className={`modeseg-btn${!agentMode ? ' on' : ''}`}
              role="radio"
              aria-checked={!agentMode}
              onClick={() => setAgentMode(false)}
            >
              <Icon name="chat" size={12} />
              Chat
            </button>
            <button
              className={`modeseg-btn${agentMode ? ' on' : ''}`}
              role="radio"
              aria-checked={agentMode}
              onClick={() => setAgentMode(true)}
            >
              <Icon name="bolt" size={12} />
              Act
            </button>
          </div>
          <ModelPicker />
          <span className="composer-spacer" />
          {!agentMode && <QuickActionsMenu />}
          {!agentMode && <AttachMenu onNotice={setNotice} />}
          {!agentMode && <WebSearchToggle />}
          <IconButton
            icon="mic"
            label={dictating ? 'Stop dictation' : 'Dictate'}
            active={dictating}
            className={dictating ? 'mic-live' : undefined}
            onClick={toggleMic}
          />
          {busy ? (
            <button
              className="send send-stop"
              onClick={agentRunning ? stopAgent : stop}
              aria-label={agentRunning ? 'Stop the agent' : 'Stop generating'}
            >
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button className="send" onClick={doSend} disabled={!canSend} aria-label="Send">
              <Icon name="arrow-up" size={16} />
            </button>
          )}
        </div>
      </div>
      {agentMode && model !== 'claude-opus-4-8' && (
        <p className="composer-hint">Tip: Opus 4.8 is the strongest pick for multi-step tasks.</p>
      )}
    </div>
  )
}
