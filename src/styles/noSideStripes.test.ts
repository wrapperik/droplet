import { describe, expect, it } from 'vitest'
// The stylesheets are read as text, since the tests render without them.
// @ts-expect-error node:fs has no types in the app's config
const { readFileSync, readdirSync, statSync } = (await import('node:fs')) as {
  readFileSync: (path: string, encoding: string) => string
  readdirSync: (path: string) => string[]
  statSync: (path: string) => { isDirectory: () => boolean }
}

const sheets = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = `${dir}/${name}`
  return statSync(path).isDirectory() ? sheets(path) : path.endsWith('.css') ? [path] : []
})

describe('the design has no side stripes', () => {
  it('draws no coloured bar down one edge of a box (an inset shadow or a border on one side)', () => {
    const found = sheets('src').flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, index) => ({ line: line.trim(), at: `${path}:${index + 1}` }))
        .filter(({ line }) => /inset\s+-?[1-9][\d.]*(px|rem)\s+0\s+0/.test(line) || /border-(left|right|inline-start|inline-end)\s*:/.test(line))
        .map(({ at }) => at),
    )
    expect(found).toEqual([])
  })
})
