import { describe, expect, it } from 'vitest'
import { composeWorkspace, type ModelCaller } from './compose.ts'
import { chatTurn } from './fixtures.ts'
import { stageSchema, stageText, stageWords, type ComposeStage } from './progress.ts'

const good = JSON.stringify(chatTurn)

describe('the stages of a composition', () => {
  it('are told as the loop moves: reading, then checking', async () => {
    const stages: ComposeStage[] = []
    await composeWorkspace({ intent: 'how do I price?' }, async () => good, (stage) => stages.push(stage))
    expect(stages).toEqual([{ stage: 'reading' }, { stage: 'checking' }])
  })

  it('say that Advanced may look things up, and what it searched for, from the API\'s own metadata', async () => {
    const stages: ComposeStage[] = []
    const call: ModelCaller = async () => ({ text: good, grounding: { queries: ['CIPC registration fee'], sources: [] } })
    await composeWorkspace({ intent: 'what does CIPC cost?', mode: 'advanced' }, call, (stage) => stages.push(stage))
    expect(stages).toEqual([{ stage: 'reading', search: true }, { stage: 'checking', searched: ['CIPC registration fee'] }])
  })

  it('say when the first reply was not usable and the model is asked again', async () => {
    const stages: ComposeStage[] = []
    let calls = 0
    const call: ModelCaller = async () => (++calls === 1 ? 'not json' : good)
    await composeWorkspace({ intent: 'hi' }, call, (stage) => stages.push(stage))
    expect(stages.map((stage) => stage.stage)).toEqual(['reading', 'checking', 'retrying', 'checking'])
  })

  it('never carry what the founder wrote or what the model answered', async () => {
    const stages: ComposeStage[] = []
    await composeWorkspace({ intent: 'secret client Ayesha Khan owes me money' }, async () => good, (stage) => stages.push(stage))
    expect(JSON.stringify(stages)).not.toMatch(/Ayesha|owes|secret/)
    expect(JSON.stringify(stages)).not.toContain(chatTurn.message.slice(0, 20))
  })

  it('do not stop the loop when the listener fails', async () => {
    const result = await composeWorkspace({ intent: 'hi' }, async () => good, () => {
      throw new Error('listener')
    })
    expect(result.outcome).toBe('valid')
  })

  it('are checked on arrival: an unknown stage is not one', () => {
    expect(stageSchema.safeParse({ stage: 'reading' }).success).toBe(true)
    expect(stageSchema.safeParse({ stage: 'daydreaming' }).success).toBe(false)
    expect(stageSchema.safeParse({ stage: 'checking', searched: Array(6).fill('x') }).success).toBe(false)
  })
})

describe('a stage in words', () => {
  it('says what is happening, and adds the seconds after five', () => {
    expect(stageText({ stage: 'reading' }, 0)).toBe('Reading your message')
    expect(stageText({ stage: 'reading' }, 4.9)).toBe('Reading your message')
    expect(stageText({ stage: 'reading', search: true }, 6.2)).toBe('Reading your message, and looking things up if needed · 6s')
    expect(stageText({ stage: 'checking', searched: ['VAT registration'] }, 7)).toBe('Searched the web for “VAT registration”. Checking the reply · 7s')
    expect(stageText({ stage: 'checking' })).toBe('Checking the reply')
    expect(stageText({ stage: 'retrying' })).toBe('The first reply did not fit, so I am asking again with what was wrong')
    expect(stageText({ stage: 'opening', workspace: 'the invoice workspace' })).toBe('Opening the invoice workspace')
  })

  it('says what the reply is made from and which workspace it is about, when the app knows', () => {
    const context = { from: 'the board on screen, this chat and 2 earlier chats', where: 'your board' }
    expect(stageWords({ stage: 'gathering' })).toBe('Looking at what is saved in this project')
    expect(stageWords({ stage: 'reading' }, context)).toBe('Reading your message alongside the board on screen, this chat and 2 earlier chats')
    expect(stageWords({ stage: 'checking' }, context)).toBe('Checking the reply fits your board')
    expect(stageWords({ stage: 'applying', where: 'the invoice' })).toBe('Making the changes on the invoice')
  })
})
