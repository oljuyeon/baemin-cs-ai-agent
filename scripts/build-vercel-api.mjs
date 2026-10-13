import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

await mkdir('api', { recursive: true })

await build({
  entryPoints: ['server/vercelAgentEntry.ts'],
  outfile: 'api/agent.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
})
