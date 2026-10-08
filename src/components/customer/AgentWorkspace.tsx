import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentAction, AgentCaseState, ChatMessage, CustomerIssue } from '../../types/customer'
import { CheckIcon, SparkIcon } from '../common/icons'
import { CameraIcon, SendIcon } from './CustomerIcons'

interface Props {
  issue: CustomerIssue | null
  messages: ChatMessage[]
  actions: AgentAction[]
  draft: string
  attachedFile: string | null
  caseState: AgentCaseState
  isThinking: boolean
  focusRequest: number
  hasStarted: boolean
  onDraftChange: (value: string) => void
  onAttach: (fileName: string) => void
  onSend: () => void
  onAction: (action: AgentAction) => void
  onReset: () => void
}

export function AgentWorkspace({ issue, messages, actions, draft, attachedFile, caseState, isThinking, focusRequest, hasStarted, onDraftChange, onAttach, onSend, onAction, onReset }: Props) {
  const { t } = useTranslation('customer')
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const canSubmit = Boolean((draft.trim() || attachedFile) && !isThinking)

  useEffect(() => {
    if (focusRequest > 0) textareaRef.current?.focus()
  }, [focusRequest])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, actions, isThinking])

  const submitOnEnter = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (isComposingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return
      event.preventDefault()
      if (canSubmit) onSend()
    }
  }

  return (
    <section className="agent-workspace agent-workspace--conversation" aria-live="polite">
      <div className="agent-workspace__header">
        <span><SparkIcon /></span>
        <div><strong>{t('header.title')}</strong><small><i className={`case-dot case-dot--${caseState}`} />{t(`agent.state.${caseState}`)}</small></div>
        {messages.length > 1 && <button className="agent-workspace__reset" type="button" onClick={onReset}>{t('agent.newCase')}</button>}
      </div>

      <div className="chat-thread chat-thread--live">
        {messages.map((message) => {
          const content = message.translate ? t(message.content) : message.content
          if (message.role === 'tool') {
            return <div className="agent-tool-event" key={message.id}><span><CheckIcon /></span><div><small>{t('agent.toolLabel')}</small><strong>{content}</strong></div></div>
          }
          return (
            <div className={`chat-bubble chat-bubble--${message.role}`} key={message.id}>
              {message.attachment && <span className="chat-bubble__attachment"><CameraIcon />{t('chat.photoIncluded')}</span>}
              {content}
            </div>
          )
        })}

        {isThinking && <div className="agent-thinking"><span /><span /><span /><small>{t('agent.thinking')}</small></div>}

        {actions.length > 0 && !isThinking && (
          <div className="agent-actions">
            <span>{t('agent.nextAction')}</span>
            {actions.map((action) => <button className={action.primary ? 'is-primary' : ''} type="button" onClick={() => onAction(action)} key={action.id}>{action.label ?? t(action.labelKey)}</button>)}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="chat-composer chat-composer--persistent">
        {issue && !hasStarted && <span className="chat-composer__draft-label">{t('chat.draftReady')}</span>}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onCompositionStart={() => { isComposingRef.current = true }}
          onCompositionEnd={() => { isComposingRef.current = false }}
          onKeyDown={submitOnEnter}
          placeholder={t('chat.placeholder')}
        />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => event.target.files?.[0] && onAttach(event.target.files[0].name)} />
        <div className="chat-composer__tools">
          <button className={attachedFile ? 'is-attached' : ''} type="button" onClick={() => fileRef.current?.click()}><CameraIcon />{attachedFile ? t('chat.attached') : t('chat.attach')}</button>
          <span className="chat-composer__enter">{t('chat.enterHint')}</span>
          <button type="button" className="chat-composer__send" disabled={!canSubmit} onClick={onSend} aria-label={t('chat.send')}><SendIcon /></button>
        </div>
        {issue === 'wrong' && !attachedFile && !hasStarted && <small className="chat-composer__hint">{t('chat.requiredHint')}</small>}
      </div>
    </section>
  )
}
