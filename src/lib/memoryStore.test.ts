import { beforeEach, describe, expect, it } from 'vitest'
import { emptyBusiness, emptyClient, newContent } from './invoice.ts'
import { clearMemory, loadMemory, saveMemory } from './memoryStore.ts'
import { emptyMemory, withBusiness, withClient, withInvoice } from './projectMemory.ts'

beforeEach(() => window.localStorage.clear())

const remembered = () => {
  let memory = withBusiness(emptyMemory(), { ...emptyBusiness(), name: 'Kindred Gifting' }, '2026-10-04T10:00')
  memory = withClient(memory, { ...emptyClient(), name: 'Pretoria Print Works' }, '2026-10-04T10:00', 'c1')
  return withInvoice(memory, 'i1', newContent('2026-10-04'), '2026-10-04T10:00')
}

describe('memoryStore', () => {
  it('remembers nothing for a project that has never confirmed anything', () => {
    expect(loadMemory('duckstack')).toEqual(emptyMemory())
  })

  it('saves and loads what a project remembers, per project', () => {
    expect(saveMemory('duckstack', remembered())).toBe(true)
    expect(loadMemory('duckstack')).toEqual(remembered())
    expect(loadMemory('typography')).toEqual(emptyMemory())
  })

  it('clears it', () => {
    saveMemory('duckstack', remembered())
    clearMemory('duckstack')
    expect(loadMemory('duckstack')).toEqual(emptyMemory())
  })

  it('remembers nothing, rather than something wrong, when what is stored is not a memory', () => {
    const put = (value: unknown) => window.localStorage.setItem('droplet-project-duckstack-memory', typeof value === 'string' ? value : JSON.stringify(value))
    put('not json')
    expect(loadMemory('duckstack')).toEqual(emptyMemory())
    put({ business: null, clients: [{ id: '', client: emptyClient(), confirmedAt: 'x' }], invoices: [] })
    expect(loadMemory('duckstack')).toEqual(emptyMemory())
    put({ business: null, clients: [], invoices: [{ id: 'i1', content: { ...newContent('2026-10-04'), lines: [] }, revision: 1, updatedAt: 'x' }] })
    expect(loadMemory('duckstack')).toEqual(emptyMemory())
    put({ business: null, clients: [], invoices: [{ id: 'i1', content: newContent('2026-10-04'), revision: 0, updatedAt: 'x' }] })
    expect(loadMemory('duckstack')).toEqual(emptyMemory())
  })
})
