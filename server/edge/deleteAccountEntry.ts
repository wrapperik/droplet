import { createEdgeDeleteAccountHandler } from './deleteAccountEdge.ts'

// The entry of the `delete-account` Edge Function. `npm run build:edge` bundles this file, with everything it imports, into
// supabase/functions/delete-account/index.ts.
declare const Deno: { env: { toObject(): Record<string, string> }; serve(handler: (request: Request) => Response | Promise<Response>): void }

Deno.serve(createEdgeDeleteAccountHandler(Deno.env.toObject()))
