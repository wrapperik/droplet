import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeHeaders, resolveComposeTarget } from './composeEndpoint.ts'

describe('resolveComposeTarget', () => {
  const supabaseUrl = 'https://abc.supabase.co'

  it('is the dev server\'s own address in development, whether or not Supabase is set up, so no deploy is needed to work', () => {
    expect(resolveComposeTarget({ production: false })).toEqual({ url: '/api/compose', authenticated: false })
    expect(resolveComposeTarget({ supabaseUrl, production: false })).toEqual({ url: '/api/compose', authenticated: false })
  })

  it('is the Edge Function in the deployed app, with the founder\'s token', () => {
    expect(resolveComposeTarget({ supabaseUrl, production: true })).toEqual({ url: 'https://abc.supabase.co/functions/v1/compose', authenticated: true })
    expect(resolveComposeTarget({ supabaseUrl: `${supabaseUrl}/`, production: true }).url).toBe('https://abc.supabase.co/functions/v1/compose')
  })

  it('is the dev server\'s address in a build with no Supabase, since there is no function to ask', () => {
    expect(resolveComposeTarget({ production: true })).toEqual({ url: '/api/compose', authenticated: false })
  })

  it('can be pointed elsewhere, to try the deployed function from the dev server, and sends the token only to Supabase', () => {
    expect(resolveComposeTarget({ composeUrl: `${supabaseUrl}/functions/v1/compose`, supabaseUrl, production: false })).toEqual({ url: `${supabaseUrl}/functions/v1/compose`, authenticated: true })
    expect(resolveComposeTarget({ composeUrl: 'https://elsewhere.example/compose', supabaseUrl, production: true })).toEqual({ url: 'https://elsewhere.example/compose', authenticated: false })
  })

  it('ignores an override that is empty', () => {
    expect(resolveComposeTarget({ composeUrl: '  ', production: false }).url).toBe('/api/compose')
  })
})

describe('composeHeaders', () => {
  afterEach(() => {
    vi.doUnmock('./supabase.ts')
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('adds nothing for the dev server', async () => {
    expect(await composeHeaders({ url: '/api/compose', authenticated: false })).toEqual({})
  })

  it('sends the signed-in founder\'s own access token, and the publishable key the platform asks for', async () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'publishable-key')
    vi.doMock('./supabase.ts', () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'user-token' } } }) } }) }))
    const { composeHeaders: headers } = await import('./composeEndpoint.ts')
    expect(await headers({ url: 'https://abc.supabase.co/functions/v1/compose', authenticated: true })).toEqual({ authorization: 'Bearer user-token', apikey: 'publishable-key' })
  })

  it('sends no token when there is no session, so the function says to sign in, and never sends the publishable key as one', async () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'publishable-key')
    vi.doMock('./supabase.ts', () => ({ getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }) }))
    const { composeHeaders: headers } = await import('./composeEndpoint.ts')
    expect(await headers({ url: 'https://abc.supabase.co/functions/v1/compose', authenticated: true })).toEqual({ apikey: 'publishable-key' })
  })
})
