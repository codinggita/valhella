import { Fragment, memo, useMemo, useState } from 'react'
import type { MessageRow } from '../../lib/db'
import { MODELS, MODEL_LIST, isModelId } from '../../lib/models'
import { buildSegments, collectSources, sourceNumber } from '../../lib/citations'
import { messageText } from '../../lib/export'
import { isImageBlock, isTextBlock } from '../../lib/anthropic/types'
import type { ApiErrorCode } from '../../lib/messages'
import Markdown from './Markdown'
import Sources from './Sources'
import Icon from '../../ui/Icon'
import IconButton from '../../ui/IconButton'
import Menu, { type MenuEntry } from '../../ui/Menu'
import Button from '../../ui/Button'
import Spinner from '../../ui/Spinner'
import { useStore } from '../store'

function errorCopy(code: ApiErrorCode, message: string): { title: string; detail: string } {
  switch (code) {
    case 'auth':
      return { title: 'Your API key was rejected', detail: 'Update it in Settings and try again.' }
    case 'rate-limit':
      return { title: 'Rate limited', detail: 'The API asked for a pause. It usually clears within a minute.' }
    case 'overloaded':
      return { title: 'The API is having a moment', detail: 'Anthropic reported heavy load. Try again shortly.' }
    case 'network':
      return { title: "Couldn't reach the API", detail: 'Check your connection and try again.' }
    case 'bad-request':
      return { title: "The API couldn't accept this request", detail: message }
    default:
      return { title: 'Something went wrong', detail: message }
  }
}

function CopyButton({ text, size = 'sm' }: { text: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false)
  return (
    <IconButton
      icon={copied ? 'check' : 'copy'}
      label={copied ? 'Copied' : 'Copy'}
      size={size}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        })
      }}
    />
  )
}

function UserMessage({ msg, isLastUser }: { msg: MessageRow; isLastUser: boolean }) {
  const streaming = useStore((s) => s.streaming !== null)
  const startEditLast = useStore((s) => s.startEditLast)
  const images = msg.blocks.filter(isImageBlock)
  const texts = msg.blocks.filter(isTextBlock)
  const typed = texts.length > 0 ? texts[texts.length - 1]?.text ?? '' : ''
  return (
    <div className="msg msg-user">
      {images.length > 0 && (
        <div className="msg-images">
          {images.map((img, i) => (
            <img
              key={i}
              className="msg-image"
              src={`data:${img.source.media_type};base64,${img.source.data}`}
              alt="Attached"
            />
          ))}
        </div>
      )}
      {msg.contextTitle && (
        <span className="msg-ctx">
          <Icon name="page" size={11} />
          {msg.contextTitle}
        </span>
      )}
      <div className="msg-user-text">{typed}</div>
      <div className="msg-tools">
        <CopyButton text={typed} />
        {isLastUser && !streaming && (
          <IconButton icon="pencil" label="Edit and resend" size="sm" onClick={startEditLast} />
        )}
      </div>
    </div>
  )
}

function AssistantMessage({ msg, isLast, streamingThis }: { msg: MessageRow; isLast: boolean; streamingThis: boolean }) {
  const searchActivity = useStore((s) => (streamingThis ? s.searchActivity : null))
  const thinking = useStore((s) => (streamingThis ? s.thinking : false))
  const connecting = useStore((s) => (streamingThis ? s.streaming?.connecting ?? false : false))
  const streamingAny = useStore((s) => s.streaming !== null)
  const retryLast = useStore((s) => s.retryLast)
  const continueLast = useStore((s) => s.continueLast)

  const segments = useMemo(() => buildSegments(msg.blocks), [msg.blocks])
  const sources = useMemo(() => collectSources(msg.blocks), [msg.blocks])
  const hasText = segments.some((s) => s.text.trim().length > 0)
  const plain = messageText(msg)
  const badge = msg.model && isModelId(msg.model) ? MODELS[msg.model].label : null

  const retryEntries: MenuEntry[] = [
    { id: 'same', label: 'Retry', icon: 'retry' },
    { sep: true },
    { title: 'Retry with' },
    ...MODEL_LIST.map((m) => ({ id: m.id, label: m.label, sub: m.tagline }))
  ]

  return (
    <div className="msg msg-assistant">
      {searchActivity && (
        <div className="activity">
          <Spinner size={11} />
          <span>
            {searchActivity.tool === 'web_search'
              ? searchActivity.detail
                ? `Searching “${searchActivity.detail}”`
                : 'Searching the web'
              : searchActivity.detail
                ? `Reading ${searchActivity.detail}`
                : 'Reading a page'}
          </span>
        </div>
      )}
      {!hasText && streamingThis && (thinking || connecting) && (
        <div className="thinking">{thinking ? 'Thinking…' : 'One moment…'}</div>
      )}
      <div className="msg-body">
        {segments.map((seg, i) => (
          <Fragment key={i}>
            <Markdown text={seg.text} />
            {seg.citations.length > 0 && (
              <span className="cite-refs">
                {[...new Set(seg.citations.map((c) => sourceNumber(sources, c.url)).filter((n) => n !== null))].map(
                  (n) => {
                    const src = sources[Number(n) - 1]
                    return (
                      <a key={n} className="cite-ref" href={src?.url} target="_blank" rel="noreferrer">
                        {n}
                      </a>
                    )
                  }
                )}
              </span>
            )}
          </Fragment>
        ))}
        {streamingThis && hasText && <span className="caret" aria-hidden="true" />}
      </div>
      {!streamingThis && sources.length > 0 && <Sources sources={sources} />}
      {msg.stopReason === 'refusal' && (
        <div className="notice notice-info">
          <Icon name="shield" size={15} />
          <div>
            <div className="notice-title">Briefly declined this request</div>
            <div className="notice-sub">The model judged it couldn't help with this one safely.</div>
          </div>
        </div>
      )}
      {msg.stopReason === 'max_tokens' && !streamingThis && (
        <div className="notice notice-warn">
          <Icon name="warning" size={15} />
          <div className="notice-grow">
            <div className="notice-title">This response hit the length limit</div>
          </div>
          {isLast && !streamingAny && (
            <Button size="sm" variant="soft" onClick={() => void continueLast()}>
              Continue
            </Button>
          )}
        </div>
      )}
      {msg.error && (
        <div className="notice notice-error">
          <Icon name="warning" size={15} />
          <div className="notice-grow">
            <div className="notice-title">{errorCopy(msg.error.code, msg.error.message).title}</div>
            <div className="notice-sub">{errorCopy(msg.error.code, msg.error.message).detail}</div>
          </div>
          {isLast && !streamingAny && (
            <Button size="sm" variant="soft" icon="retry" onClick={() => void retryLast()}>
              Retry
            </Button>
          )}
        </div>
      )}
      {!streamingThis && (hasText || badge) && (
        <div className="msg-meta">
          {badge && <span className="msg-badge">{badge}</span>}
          {msg.stopped && <span className="msg-stopped">stopped</span>}
          <span className="msg-actions">
            {plain && <CopyButton text={plain} />}
            {isLast && !streamingAny && hasText && (
              <Menu
                entries={retryEntries}
                align="end"
                onSelect={(id) => {
                  if (id === 'same') void retryLast()
                  else if (isModelId(id)) void retryLast(id)
                }}
                trigger={(p) => (
                  <button
                    ref={p.ref}
                    onClick={p.onClick}
                    aria-expanded={p['aria-expanded']}
                    aria-haspopup={p['aria-haspopup']}
                    className="iconbtn iconbtn-sm"
                    aria-label="Retry"
                  >
                    <Icon name="retry" size={14} />
                  </button>
                )}
              />
            )}
          </span>
        </div>
      )}
    </div>
  )
}

export default memo(
  function MessageView({
    msg,
    isLast,
    isLastUser,
    streamingThis
  }: {
    msg: MessageRow
    isLast: boolean
    isLastUser: boolean
    streamingThis: boolean
  }) {
    if (msg.role === 'user') return <UserMessage msg={msg} isLastUser={isLastUser} />
    return <AssistantMessage msg={msg} isLast={isLast} streamingThis={streamingThis} />
  },
  (prev, next) =>
    prev.msg === next.msg &&
    prev.isLast === next.isLast &&
    prev.isLastUser === next.isLastUser &&
    prev.streamingThis === next.streamingThis
)
