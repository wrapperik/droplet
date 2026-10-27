import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MobileNotice, { MOBILE_QUERY } from './MobileNotice.tsx'

// A screen of the given kind: narrow (a phone) or wide.
const screenIs = (narrow: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: narrow && query === MOBILE_QUERY, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as MediaQueryList)

beforeEach(() => window.sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the mobile notice', () => {
  it('says on a phone that the site is not yet optimised for mobile', () => {
    screenIs(true)
    render(<MobileNotice />)
    expect(screen.getByRole('alertdialog', { name: 'Best on a desktop for now' })).toHaveTextContent('This site is not yet optimised for mobile devices. We are working on it! For now, try it on desktop.')
    expect(screen.getByRole('button', { name: 'Continue anyway' })).toHaveFocus()
  })

  it('shows nothing on a desktop', () => {
    screenIs(false)
    render(<MobileNotice />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('goes on Continue anyway, and stays away for the rest of the visit', async () => {
    screenIs(true)
    const user = userEvent.setup()
    const { unmount } = render(<MobileNotice />)
    await user.click(screen.getByRole('button', { name: 'Continue anyway' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    unmount()
    render(<MobileNotice />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('goes on Escape', async () => {
    screenIs(true)
    const user = userEvent.setup()
    render(<MobileNotice />)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
