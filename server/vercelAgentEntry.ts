import { createAgentApiHandler } from './agentApiHandler.js'

const handler = createAgentApiHandler({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
})

export const config = {
  maxDuration: 60,
}

export default handler
