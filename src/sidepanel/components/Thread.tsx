import { useEffect, useRef, useState } from 'react'
import Icon from '../../ui/Icon'
import MessageView from './MessageView'
import ContextChip from './ContextChip'
import QuickStart from './QuickStart'
import { useStore } from '../store'

export default function Thread() {
  const messages = useStore((s) => s.messages)
  const streaming = useStore((s) => s.streaming)
  const offline = useStore((s) => s.offline)
  const ref = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const [showJump, setShowJump] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90
    nearBottom.current = near
    setShowJump(!near && streaming !== null)
  }

  useEffect(() => {
    if (!streaming) setShowJump(false)
  }, [streaming])

  const lastUserIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') return i
    }
    return -1
  })()

  return (
    <div className="thread-wrap">
      <ContextChip />
      <div className="thread" ref={ref} onScroll={onScroll}>
        {offline && (
          <div className="banner">
            <Icon name="warning" size={14} />
            You're offline — answers need a connection.
          </div>
        )}
        {messages.length === 0 ? (
          <QuickStart />
        ) : (
          messages.map((m, i) => (
            <MessageView
              key={m.id}
              msg={m}
              isLast={i === messages.length - 1}
              isLastUser={i === lastUserIdx}
              streamingThis={streaming?.messageId === m.id}
            />
          ))
        )}
      </div>
      {showJump && (
        <button
          className="jump"
          onClick={() => {
            const el = ref.current
            if (el) el.scrollTop = el.scrollHeight
            nearBottom.current = true
            setShowJump(false)
          }}
        >
          <Icon name="chevron-down" size={14} />
          Latest
        </button>
      )}
    </div>
  )
}
