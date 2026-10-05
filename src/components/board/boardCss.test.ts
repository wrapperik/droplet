import { describe, expect, it } from 'vitest'
// The stylesheet is read as text from the project folder (the tests run from it). Vitest hands back nothing for a CSS import, and the app's
// config has no Node types, so the one line that needs them says so.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string, encoding: string) => string }
const css = readFileSync('src/components/board/BoardCanvas.css', 'utf8')

// The tests render without the stylesheet, so a rule that is wrong in the browser cannot be seen from the components. These read the CSS itself
// for the mistakes that have been made before.
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body }))

describe('the board stylesheet', () => {
  it('is read', () => {
    expect(css.length).toBeGreaterThan(1000)
  })

  it('does not fill the box of a diamond, which is an svg that only its polygon should fill', () => {
    // any rule that can match the diamond's svg (it has the classes shape__body and shape__body--diamond) must not set a background on it
    const paints = rules.filter((rule) => /background(?!-)/.test(rule.body) && rule.selector.split(',').some((selector) => /(^|\s)\.shape__body(\[[^\]]*\])*$/.test(selector.trim())))
    for (const rule of paints) {
      // the base rule sets it from the one fill, and the diamond's own rule, which follows it, clears it
      expect(rule.body).toContain('var(--shape-fill)')
    }
    const base = css.indexOf('.shape__body {')
    const diamond = css.indexOf('.shape__body--diamond {')
    expect(base).toBeGreaterThan(-1)
    expect(diamond).toBeGreaterThan(base)
    const diamondRule = rules.find((rule) => rule.selector === '.shape__body--diamond')!
    expect(diamondRule.body).toMatch(/background:\s*none/)
  })

  it('gives every colour a fill for shapes, and the diamond and the box use the same one', () => {
    for (const colour of ['yellow', 'mint', 'sky', 'lilac', 'peach', 'grey']) expect(css).toContain(`.shape[data-colour='${colour}']`)
    expect(css).toMatch(/\.shape__body--diamond polygon\s*\{[^}]*fill:\s*var\(--shape-fill\)/)
    expect(css).toMatch(/\.shape__body\s*\{[^}]*background:\s*var\(--shape-fill\)/)
  })

  it('fills the screen with no box round it: the stage and the board are absolute and inset to the screen', () => {
    for (const selector of ['.board-stage', '.board']) {
      const rule = rules.find((r) => r.selector === selector)!
      expect(rule.body, selector).toMatch(/position:\s*absolute/)
      expect(rule.body, selector).toMatch(/inset:\s*0/)
    }
    expect(css).not.toMatch(/clamp\([^)]*dvh/)
  })

  it('opens its reason upwards from the label in the corner, since there is no room below it', () => {
    const rule = rules.find((r) => r.selector === '.board__label .reason__tip')!
    expect(rule.body).toMatch(/top:\s*auto/)
    expect(rule.body).toMatch(/bottom:/)
  })
})
