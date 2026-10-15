import { describe, expect, it } from 'vitest'
// The stylesheet is read as text, since the tests render without it. See boardCss.test.ts.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
const css = readFileSync('src/pages/Home.css', 'utf8')
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body }))
const rule = (selector: string) => rules.find((r) => r.selector === selector)

describe('the screen when the board fills it', () => {
  it('draws the board under the header and the toolbar: the canvas is the whole screen, and the header block is above it', () => {
    expect(rule('.home__canvas--board')?.body).toMatch(/position:\s*absolute/)
    expect(rule('.home__canvas--board')?.body).toMatch(/inset:\s*0/)
    expect(rule('.home__canvas--board')?.body).toMatch(/padding:\s*0/)
    const top = Number(/z-index:\s*(\d+)/.exec(rule('.home__top')?.body ?? '')?.[1])
    const canvas = Number(/z-index:\s*(\d+)/.exec(rule('.home__canvas--board')?.body ?? '')?.[1])
    expect(top).toBeGreaterThan(canvas)
  })

  it('blurs gradually under the toolbar: two layers of blur, each faded out by a mask, and only while the board is shown', () => {
    const before = rule(".home__screen[data-immersive] .home__top::before")
    const after = rule(".home__screen[data-immersive] .home__top::after")
    expect(before?.body).toMatch(/backdrop-filter:\s*blur\(/)
    expect(after?.body).toMatch(/backdrop-filter:\s*blur\(/)
    expect(before?.body).toMatch(/mask-image:\s*linear-gradient\([^)]*transparent/)
    expect(after?.body).toMatch(/mask-image:\s*linear-gradient\([^)]*transparent/)
    const blur = (r?: { body: string }) => Number(/backdrop-filter:\s*blur\((\d+)px/.exec(r?.body ?? '')?.[1])
    expect(blur(after)).toBeGreaterThan(blur(before))
    // not applied to the other workspaces
    for (const r of rules.filter((r) => /\.home__top::(before|after)/.test(r.selector))) expect(r.selector).toContain('[data-immersive]')
  })
})

describe('the shell round the working screen', () => {
  const tokens = readFileSync('src/styles/tokens.css', 'utf8')

  it('is the page, with an opaque screen on it', () => {
    expect(rule('.home')?.body).toMatch(/background-color:\s*var\(--shell\)/)
    expect(rule('.home__screen.glass')?.body).toMatch(/background:\s*var\(--screen\)/)
  })

  it('is white on a light screen and near black on a dark one, and what sits on it follows the theme', () => {
    expect(tokens).toMatch(/--shell:\s*var\(--white\)/)
    expect(tokens).toMatch(/:root\[data-theme='dark'\]\s*\{[^}]*--shell:\s*var\(--coal\)/)
    expect(tokens).not.toMatch(/:root\[data-theme='dark'\],\s*\.on-shell/)
    expect(tokens).toMatch(/\.on-shell\s*\{[^}]*--bg:\s*var\(--shell\)/)
  })
})

describe('the screen when a task has a panel', () => {
  it('does not scroll the canvas: the frame fills it and each pane scrolls inside itself', () => {
    expect(rule('.home__canvas--panes')?.body).toMatch(/overflow:\s*clip/)
    // The page and the working screen never scroll, so a focused field cannot push the header away or the panel over the chat.
    expect(rule('.home')?.body).toMatch(/overflow:\s*clip/)
    expect(rule('.home__screen')?.body).toMatch(/overflow:\s*clip/)
    expect(rule('.home__canvas--panes > .home__component')?.body).toMatch(/min-height:\s*0/)
  })

  it('has no separate screen for Guide mode: the brand and the invoice share one canvas class', () => {
    expect(css).not.toContain('home__canvas--guide')
  })
})

describe('the side chat', () => {
  it('has room to read: at least 20rem, growing with the window to 26rem', () => {
    expect(rule('.home__chat')?.body).toMatch(/width:\s*clamp\(20rem, 26vw, 26rem\)/)
  })
})
