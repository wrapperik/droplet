import { describe, expect, it } from 'vitest'
// The stylesheet is read as text, since the tests render without it. See boardCss.test.ts.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
const css = readFileSync('src/components/TaskBar.css', 'utf8')
const home = readFileSync('src/pages/Home.css', 'utf8')
const shell = readFileSync('src/components/WorkspaceShell.css', 'utf8')
const rules = (text: string) => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body }))
const rule = (selector: string, text = css) => rules(text).filter((r) => r.selector === selector)

// Every task bar, in every workspace and every one to come, is the one bar drawn by TaskBar. These keep it one look.
describe('the task bar every workspace shares', () => {
  it('is a slim pill that is only as wide as its items and never wider than the room it is given', () => {
    const body = rule('.taskbar')[0].body
    expect(body).toMatch(/width:\s*fit-content/)
    expect(body).toMatch(/max-width:\s*100%/)
    expect(body).toMatch(/border-radius:\s*2rem/)
  })

  it('is positioned, so the glass drawn behind it hugs the bar and does not fill the row it sits in', () => {
    expect(rule('.taskbar::before')[0].body).toMatch(/position:\s*absolute/)
    expect(rule('.taskbar')[0].body).toMatch(/position:\s*relative/)
  })

  it('has the same padding on both sides and above and below, which does not differ by workspace', () => {
    expect(rule('.taskbar')[0].body).toMatch(/padding:\s*0\.375rem 0\.625rem;/)
    for (const selector of ['.taskbar', '.taskbar::before']) expect(home).not.toContain(`${selector} {`)
  })

  it('is translucent glass with a hairline edge and a blur, not a nearly solid white slab', () => {
    const blur = rules(css).find((r) => r.selector === '.taskbar::before' && /backdrop-filter/.test(r.body))!
    expect(blur.body).toMatch(/background:\s*var\(--glass-fill\)/)
    expect(blur.body).not.toContain('glass-fill-strong')
    expect(blur.body).toMatch(/backdrop-filter:\s*blur\(var\(--glass-blur\)\)/)
    expect(rule('.taskbar::before')[0].body).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--glass-border\)/)
  })

  it('gives every item one height, so a bar is the same height in every workspace', () => {
    expect(rule('.taskbar__item')[0].body).toMatch(/min-height:\s*2\.5rem/)
  })

  it('leaves room on both sides of the screen, so it never touches the edges', () => {
    expect(rule('.home__shelf', home)[0].body).toMatch(/padding:\s*0\.75rem 1\.5rem 0;/)
  })

  it('shows the tooltip on hover and on keyboard focus, not on a press, and never takes a press', () => {
    const shown = rules(css).find((r) => r.selector.includes('.taskbar__button:focus-visible + .taskbar__tip'))!
    expect(shown.selector).toContain('.taskbar__item:hover > .taskbar__tip')
    expect(shown.body).toMatch(/opacity:\s*1/)
    expect(rule('.taskbar__tip')[0].body).toMatch(/pointer-events:\s*none/)
  })

  it('has no way to be dragged: no grab cursor, no touch handling for a drag', () => {
    expect(css).not.toMatch(/grab|touch-action/)
  })

  it('uses no hard-coded colour', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe('the frame every task shares', () => {
  it('puts the thing three fifths and the panel two fifths, each scrolling on its own', () => {
    expect(rule('.frame__stage', shell)[0].body).toMatch(/grid-template-columns:\s*minmax\(0, 3fr\) minmax\(20rem, 2fr\)/)
    expect(rule('.frame__pane', shell)[0].body).toMatch(/overflow-y:\s*auto/)
    expect(rule('.frame__stage', shell)[0].body).toMatch(/min-height:\s*0/)
  })

  it('does not scroll as a whole, and fills the screen', () => {
    // It stretches to the canvas: a percentage height would undo the stretch and let it grow past the screen.
    const frame = rule('.frame', shell)[0].body
    expect(frame).toMatch(/align-self:\s*stretch/)
    expect(frame).toMatch(/min-height:\s*0/)
    expect(frame).not.toMatch(/height:\s*100%/)
  })

  it('becomes one column under 42rem, the panel (and its footer) first', () => {
    expect(shell).toMatch(/@container \(max-width: 42rem\)/)
    expect(shell).toMatch(/\.frame__side\s*\{[^}]*order:\s*-1/)
  })

  it('has no review proportion of its own: the panes are the same for every part', () => {
    expect(shell).not.toMatch(/review/)
  })

  it('keeps Back and Continue below the panel, never stuck over anything', () => {
    const invoice = readFileSync('src/components/invoice/InvoiceWorkspace.css', 'utf8')
    expect(invoice).not.toMatch(/position:\s*sticky/)
  })
})
