import { describe, expect, it } from 'vitest'
// The deployment files are read as text from the project folder (the tests run from it). The app's config has no Node types, so the one line that
// needs them says so.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync, existsSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string; existsSync: (path: string) => boolean }

// A deploy that is a little wrong fails in a way that is hard to see, on someone else's screen. These read what it is made of.
describe('the deployment files', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { buildCommand: string; outputDirectory: string; rewrites: { source: string; destination: string }[] }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }

  it('has Vercel build the app and send every path to index.html, since the app has its own routes', () => {
    expect(vercel.buildCommand).toBe('npm run build')
    expect(vercel.outputDirectory).toBe('dist')
    expect(vercel.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' })
    expect(pkg.scripts.build).toMatch(/vite build/)
  })

  it('builds the Edge Function before it deploys it', () => {
    expect(pkg.scripts['build:edge']).toBe('node scripts/build-edge.mjs')
    expect(pkg.scripts['deploy:compose']).toMatch(/^npm run build:edge && .*functions deploy compose/)
    expect(pkg.scripts['deploy:delete-account']).toMatch(/^npm run build:edge( -- delete-account)? && .*functions deploy delete-account/)
    expect(existsSync('scripts/build-edge.mjs')).toBe(true)
  })

  it('switches the platform\'s token check off for the function only because the function checks the token itself', () => {
    const config = readFileSync('supabase/config.toml', 'utf8')
    expect(config).toMatch(/\[functions\.compose\][^[]*verify_jwt = false/)
    expect(readFileSync('server/edge/edgeHttp.ts', 'utf8')).toMatch(/\/auth\/v1\/user/)
    expect(config).toMatch(/\[functions\.delete-account\][^[]*verify_jwt = false/)
  })

  it('does not keep the generated function in the repo, and does not let a key in', () => {
    const ignore = readFileSync('.gitignore', 'utf8')
    expect(ignore).toMatch(/^supabase\/functions\/compose\/index\.ts$/m)
    expect(ignore).toMatch(/^supabase\/functions\/delete-account\/index\.ts$/m)
    expect(ignore).toMatch(/^\.env$/m)
  })

  it('lists the variables that are public (VITE_) and says the Gemini key is not one of them', () => {
    const example = readFileSync('.env.example', 'utf8')
    expect(example).toMatch(/^VITE_SUPABASE_URL=/m)
    expect(example).toMatch(/^VITE_SUPABASE_ANON_KEY=/m)
    expect(example).toMatch(/^GEMINI_API_KEY=/m)
    expect(example).not.toMatch(/^VITE_GEMINI/m)
  })

  it('tells whoever deploys to set the secret and never to put the Gemini key in Vercel', () => {
    const guide = readFileSync('docs/deploy.md', 'utf8')
    expect(guide).toMatch(/supabase secrets set GEMINI_API_KEY/)
    expect(guide).toMatch(/Do \*\*not\*\* add the Gemini key/)
  })
})
