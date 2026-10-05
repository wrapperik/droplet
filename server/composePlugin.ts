import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'
import { appendComposition } from './compositionLog.ts'
import { callerFromEnv } from './composeEnv.ts'
import { handleCompose } from './composeService.ts'
import { createRateLimiter } from './rateLimit.ts'

// Serves POST /api/compose from the Vite dev server, so the app can call the composer on the address it already runs
// on. The key is read here, on the server, from .env.local (a name without the VITE_ prefix, so it can never be
// bundled into the browser code). In production the same service runs as a Supabase Edge Function.

// A board is sent with the request, up to 120 things with their words, so this is room for one.
const MAX_BODY_BYTES = 90_000
const HOUR_MS = 60 * 60 * 1000

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', reject)
  })
}

export function composePlugin(env: Record<string, string>): Plugin {
  const { call, model, fallbackModel, modelUsed, limitPerHour } = callerFromEnv(env)
  const limiter = createRateLimiter(limitPerHour, HOUR_MS)

  return {
    name: 'droplet-compose',
    configureServer(server) {
      server.config.logger.info(
        call ? `  compose: using ${model}${fallbackModel && fallbackModel !== model ? `, falling back to ${fallbackModel} if its quota is used up` : ''}` : '  compose: no GEMINI_API_KEY set, so /api/compose will say so (see .env.example)',
      )
      server.middlewares.use('/api/compose', async (req, res) => {
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'POST')
          res.end(JSON.stringify({ error: 'bad_request', message: 'Use POST.' }))
          return
        }
        let body: unknown
        try {
          body = await readBody(req)
        } catch {
          res.statusCode = 413
          res.end(JSON.stringify({ error: 'bad_request', message: 'That request is too large.' }))
          return
        }
        const reply = await handleCompose(body, { call, limiter, log: appendComposition, modelUsed })
        res.statusCode = reply.status
        res.end(JSON.stringify(reply.body))
      })
    },
  }
}
