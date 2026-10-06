import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createAgentApiPlugin } from './server/agentApiPlugin'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      createAgentApiPlugin({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || 'gpt-5.4-mini',
      }),
    ],
  }
})
