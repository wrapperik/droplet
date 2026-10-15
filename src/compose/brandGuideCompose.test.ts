import { describe, expect, it } from 'vitest'
import { starterBlocks } from './fallback.ts'
import { openWorkspace } from '../lib/workspaceState.ts'
import { SYSTEM_PROMPT, buildUserContent, systemPromptFor } from './prompt.ts'
import { snapshotOfState } from './snapshot.ts'
import { composeRequestSchema } from './spec.ts'
import { usedOf } from './used.ts'

const workspace = snapshotOfState(openWorkspace(starterBlocks()), 'none')

describe('Guide mode on the brand', () => {
  it('tells the composer which step of the brand is on screen, after the palette', () => {
    const guided = buildUserContent({ intent: 'help', view: 'brand', workspace, guide: { step: 'roles', position: 2, of: 3 } })
    expect(guided).toContain('<guide>\nStep 2 of 3: Roles\n</guide>')
    expect(guided.indexOf('<guide>')).toBeGreaterThan(guided.indexOf('</workspace>'))
    expect(buildUserContent({ intent: 'help', view: 'brand', workspace })).not.toContain('<guide>')
  })

  it('accepts a guide with a brand step, and still only a step the guides have', () => {
    expect(composeRequestSchema.safeParse({ intent: 'hi', guide: { step: 'contrast', position: 3, of: 3 } }).success).toBe(true)
    expect(composeRequestSchema.safeParse({ intent: 'hi', guide: { step: 'colours', position: 1, of: 3 } }).success).toBe(true)
    expect(composeRequestSchema.safeParse({ intent: 'hi', guide: { step: 'logo', position: 1, of: 3 } }).success).toBe(false)
  })

  it('says in the prompt that the brand has a Guide mode, that the palettes in Colours are built by the app, and that only the founder moves on or finishes', () => {
    for (const prompt of [SYSTEM_PROMPT, systemPromptFor('brand', 'base'), systemPromptFor('invoice', 'base'), systemPromptFor('board', 'base')]) {
      expect(prompt).toMatch(/The brand has a Guide mode too, with its three parts as three steps/)
      expect(prompt).toMatch(/which the app builds in code from the colour harmonies, not you/)
      expect(prompt).toMatch(/Make it more readable button that moves the text colour, in code/)
      expect(prompt).toMatch(/Export brand sheet and Open/)
    }
    for (const prompt of [SYSTEM_PROMPT, systemPromptFor('brand', 'base')]) {
      expect(prompt).toMatch(/You cannot move them to another step or finish: they press Continue, and Finish on the last step, which saves the palette/)
      expect(prompt).toMatch(/the app shows three palettes it built itself from the colour harmonies/)
    }
  })

  it('lists the guide step among what was used', () => {
    const used = usedOf({ intent: 'hi', view: 'brand', workspace, guide: { step: 'colours', position: 1, of: 3 } })
    expect(used.items[0].detail).toContain('guide step you are on (1 of 3)')
    expect(usedOf({ intent: 'hi', view: 'brand', workspace }).items[0].detail).not.toContain('guide step')
  })
})
