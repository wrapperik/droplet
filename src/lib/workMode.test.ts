import { DEFAULT_WORK_MODE, WORK_MODE_STORAGE_KEY, isWorkMode, readStoredWorkMode, storeWorkMode } from './workMode.ts'

describe('work mode', () => {
  afterEach(() => window.localStorage.removeItem(WORK_MODE_STORAGE_KEY))

  it('starts in Guide mode', () => {
    expect(DEFAULT_WORK_MODE).toBe('guide')
    expect(readStoredWorkMode()).toBe('guide')
  })

  it('keeps the choice on this device', () => {
    storeWorkMode('workspace')
    expect(readStoredWorkMode()).toBe('workspace')
    storeWorkMode('guide')
    expect(readStoredWorkMode()).toBe('guide')
  })

  it('ignores anything else that is stored', () => {
    window.localStorage.setItem(WORK_MODE_STORAGE_KEY, 'advanced')
    expect(readStoredWorkMode()).toBe('guide')
  })

  it('knows only the two modes', () => {
    expect(isWorkMode('guide')).toBe(true)
    expect(isWorkMode('workspace')).toBe(true)
    expect(isWorkMode('base')).toBe(false)
    expect(isWorkMode(undefined)).toBe(false)
  })
})
