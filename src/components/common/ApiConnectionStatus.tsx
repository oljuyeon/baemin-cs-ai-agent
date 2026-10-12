import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type ConnectionState = 'checking' | 'connected' | 'disconnected'

interface AgentHealth {
  configured: boolean
  model?: string
}

export function ApiConnectionStatus() {
  const { t } = useTranslation('common')
  const [state, setState] = useState<ConnectionState>('checking')
  const [model, setModel] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()

    const checkConnection = async () => {
      try {
        const response = await fetch('/api/agent/health', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        const contentType = response.headers.get('content-type') ?? ''
        if (!response.ok || !contentType.includes('application/json')) {
          throw new Error('Agent API health check failed.')
        }

        const health = await response.json() as AgentHealth
        setModel(health.model)
        setState(health.configured ? 'connected' : 'disconnected')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setModel(undefined)
        setState('disconnected')
      }
    }

    void checkConnection()
    const interval = window.setInterval(checkConnection, 30_000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [])

  return (
    <div className="api-connection-status" data-state={state} role="status" aria-live="polite">
      <span className="api-connection-status__dot" aria-hidden="true" />
      <span>
        {state === 'checking'
          ? t('apiStatus.checking')
          : state === 'connected'
            ? t('apiStatus.connected', { model: model ?? t('apiStatus.unknownModel') })
            : t('apiStatus.disconnected')}
      </span>
    </div>
  )
}
