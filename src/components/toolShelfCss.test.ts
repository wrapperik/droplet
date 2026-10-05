import { describe, expect, it } from 'vitest'
// The stylesheet is read as text, since the tests render without it. See boardCss.test.ts.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
const css = readFileSync('src/components/ToolShelf.css', 'utf8')
const home = readFileSync('src/pages/Home.css', 'utf8')
const rules = (text: string) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body }))
const rule = (selector: string, text = css) => rules(text).filter((r) => r.selector === selector)

// Every toolbar, in every workspace and every one to come, is the one bar drawn by ToolShelf. These keep it one look.
describe('the toolbar every workspace shares', () => {
  it('is a slim pill that is only as wide as its tools and never wider than the room it is given', () => {
    const body = rule('.shelf')[0].body
    expect(body).toMatch(/width:\s*fit-content/)
    expect(body).toMatch(/max-width:\s*100%/)
    expect(body).toMatch(/border-radius:\s*2rem/)
  })

  it('is positioned, so the glass drawn behind it hugs the bar and does not fill the row it sits in', () => {
    // the glass is an absolutely placed layer with inset 0, which is placed against the nearest positioned ancestor
    expect(rule('.shelf::before')[0].body).toMatch(/position:\s*absolute/)
    expect(rule('.shelf')[0].body).toMatch(/position:\s*relative/)
  })

  it('has the same padding on both sides and above and below, which does not differ by workspace', () => {
    const body = rule('.shelf')[0].body
    expect(body).toMatch(/padding:\s*0\.375rem 0\.625rem;/)
    // no workspace restyles the bar
    for (const selector of ['.shelf', '.shelf::before']) expect(home).not.toContain(`${selector} {`)
  })

  it('is translucent glass with a hairline edge and a blur, not a nearly solid white slab', () => {
    const blur = rules(css).find((r) => r.selector === '.shelf::before' && /backdrop-filter/.test(r.body))!
    expect(blur.body).toMatch(/background:\s*var\(--glass-fill\)/)
    expect(blur.body).not.toContain('glass-fill-strong')
    expect(blur.body).toMatch(/backdrop-filter:\s*blur\(var\(--glass-blur\)\)/)
    expect(rule('.shelf::before')[0].body).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--glass-border\)/)
  })

  it('gives every tool one height, so a bar is the same height in every workspace', () => {
    expect(rule('.shelf__tool')[0].body).toMatch(/min-height:\s*2\.5rem/)
  })

  it('leaves room on both sides of the screen, so it never touches the edges', () => {
    expect(rule('.home__shelf', home)[0].body).toMatch(/padding:\s*0\.75rem 1\.5rem 0;/)
  })

  it('uses no hard-coded colour', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
