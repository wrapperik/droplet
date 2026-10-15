import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'
import { appendComposition } from './compositionLog.ts'
import { callerFromEnv } from './composeEnv.ts'
import { handleAllowance, handleCompose } from './composeService.ts'
import { EVENT_STREAM, streamEvents, wantsStream } from './composeStream.ts'
import { createAdvancedAllowance, createRateLimiter } from './rateLimit.ts'

// Serves POST /api/compose (and GET, for the Advanced allowance) from the Vite dev server, so the app can call the composer on the address it already
// runs on. The key is read here, on the server, from .env.local (a name without the VITE_ prefix, so it can never be bundled into the browser code).
// In production the same service runs as a Supabase Edge Function.

// A board is sent with the request, and so can up to three attached files (8 MB, a third larger as base64): room for both. Everything else in a request is bounded
// by its own schema, so a large body is only ever files.
const MAX_BODY_BYTES = 12_000_000
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
  const { call, baseModel, advancedModel, limitPerHour, advancedPerDay } = callerFromEnv(env)
  const limiter = createRateLimiter(limitPerHour, HOUR_MS)
  // On this machine a founder's Advanced answers are counted in memory, so restarting the dev server starts the day again.
  const advanced = createAdvancedAllowance(advancedPerDay)

  return {
    name: 'droplet-compose',
    configureServer(server) {
      server.config.logger.info(
        call
          ? `  compose: Quick uses ${baseModel}; Advanced uses ${advancedModel} with web search, ${advancedPerDay} answers a day${advancedModel === baseModel ? '' : ', and Quick answers when Advanced is busy'}`
          : '  compose: no GEMINI_API_KEY set, so /api/compose will say so (see .env.example)',
      )
      server.middlewares.use('/api/compose', async (req, res) => {
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        if (req.method === 'GET') {
          const reply = await handleAllowance({ advanced })
          res.statusCode = reply.status
          res.end(JSON.stringify(reply.body))
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'GET, POST')
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
        if (wantsStream(req.headers.accept)) {
          // The stage as it changes, then the reply, as server-sent events. The status is in the result event.
          res.statusCode = 200
          res.setHeader('content-type', EVENT_STREAM)
          await streamEvents((onStage) => handleCompose(body, { call, limiter, advanced, log: appendComposition, onStage }), (text) => void res.write(text))
          res.end()
          return
        }
        const reply = await handleCompose(body, { call, limiter, advanced, log: appendComposition })
        res.statusCode = reply.status
        res.end(JSON.stringify(reply.body))
      })
    },
  }
}
