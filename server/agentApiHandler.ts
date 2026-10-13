import type { IncomingMessage, ServerResponse } from 'node:http'
import { createAgentApiPlugin, type PluginOptions } from './agentApiPlugin.js'

type Next = (error?: unknown) => void
type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next?: Next,
) => void | Promise<void>

type MiddlewareRegistry = {
  use: (path: string, handler: RouteHandler) => void
}

const writeJson = (response: ServerResponse, status: number, body: unknown) => {
  if (response.writableEnded) return
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

/**
 * Reuses the exact Vite development middleware contracts in a serverless runtime.
 * Keeping one route implementation prevents local and deployed Agent behavior from drifting.
 */
export function createAgentApiHandler(options: PluginOptions) {
  const routes = new Map<string, RouteHandler>()
  const plugin = createAgentApiPlugin(options)
  const configureServer = plugin.configureServer as unknown as ((server: {
    middlewares: MiddlewareRegistry
  }) => unknown) | undefined

  if (!configureServer) throw new Error('Agent API plugin has no server configuration hook.')

  configureServer({
    middlewares: {
      use(path, handler) {
        routes.set(path.replace(/\/$/, ''), handler)
      },
    },
  })

  return async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const rewrittenAction = requestUrl.searchParams.get('action')
    const pathname = (rewrittenAction
      ? `/api/agent/${rewrittenAction}`
      : requestUrl.pathname
    ).replace(/\/$/, '')
    const handler = routes.get(pathname)
    if (!handler) {
      return writeJson(response, 404, { error: 'Agent API route not found.' })
    }

    let nextError: unknown
    let nextCalled = false
    await handler(request, response, (error) => {
      nextCalled = true
      nextError = error
    })

    if (nextCalled && !response.writableEnded) {
      return writeJson(
        response,
        nextError ? 500 : 404,
        { error: nextError instanceof Error ? nextError.message : 'Agent API route not found.' },
      )
    }
  }
}
