/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // Where to ask the composer instead of the default (see src/lib/composeEndpoint.ts).
  readonly VITE_COMPOSE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
