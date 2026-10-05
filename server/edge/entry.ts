import { createEdgeComposeHandler } from './composeEdge.ts'

// The entry of the Supabase Edge Function. `npm run build:edge` bundles this file, with everything it imports, into
// supabase/functions/compose/index.ts, so the function is one self-contained file that can be deployed from the command line or pasted into
// the dashboard.
declare const Deno: { env: { toObject(): Record<string, string> }; serve(handler: (request: Request) => Response | Promise<Response>): void }

Deno.serve(createEdgeComposeHandler(Deno.env.toObject()))
