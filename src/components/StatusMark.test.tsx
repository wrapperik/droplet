import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatusMark from './StatusMark.tsx'

const tip = () => document.body.querySelector('.status__tip')

describe('StatusMark', () => {
  it('shows an icon and no word, and keeps the word for a screen reader', () => {
    const { container } = render(<StatusMark status="resolved" />)
    expect(container.querySelector('.status__dot svg')).not.toBeNull()
    // the word is hidden from sight, not from assistive technology
    expect(screen.getByText(', Resolved', { selector: '.visually-hidden' })).toBeInTheDocument()
    expect(container.querySelector('.status__dot')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows no tooltip until the icon is hovered, then says what the status means, and goes when the pointer leaves', async () => {
    const user = userEvent.setup()
    const { container } = render(<StatusMark status="outstanding" />)
    expect(tip()).toBeNull()
    await user.hover(container.querySelector('.status')!)
    expect(tip()).toHaveTextContent('Outstanding')
    expect(tip()).toHaveTextContent('This asset is still to do.')
    await user.unhover(container.querySelector('.status')!)
    expect(tip()).toBeNull()
  })

  it('says what resolved means', async () => {
    const user = userEvent.setup()
    const { container } = render(<StatusMark status="resolved" />)
    await user.hover(container.querySelector('.status')!)
    expect(tip()).toHaveTextContent('This asset is finished and ready to use.')
  })

  it('draws the tooltip on the page itself, so no list that scrolls or clips can cut it off, and does not repeat it to a screen reader', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <div style={{ overflow: 'auto' }}>
        <StatusMark status="resolved" />
      </div>,
    )
    await user.hover(container.querySelector('.status')!)
    expect(tip()!.parentElement).toBe(document.body)
    expect(container.contains(tip())).toBe(false)
    expect(tip()).toHaveAttribute('aria-hidden', 'true')
  })

  it('puts the tooltip to the right of the icon, level with its middle', async () => {
    const user = userEvent.setup()
    const { container } = render(<StatusMark status="resolved" />)
    const mark = container.querySelector('.status') as HTMLElement
    mark.getBoundingClientRect = () => ({ left: 200, top: 100, width: 18, height: 18, right: 218, bottom: 118, x: 200, y: 100, toJSON: () => ({}) })
    await user.hover(mark)
    expect((tip() as HTMLElement).style.left).toBe('230px')
    expect((tip() as HTMLElement).style.top).toBe('109px')
  })

  it('goes on Escape', async () => {
    const user = userEvent.setup()
    const { container } = render(<StatusMark status="resolved" />)
    await user.hover(container.querySelector('.status')!)
    expect(tip()).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(tip()).toBeNull()
  })

  it('goes when something scrolls, since the icon has moved from under it', async () => {
    const user = userEvent.setup()
    const { container } = render(<StatusMark status="resolved" />)
    await user.hover(container.querySelector('.status')!)
    expect(tip()).not.toBeNull()
    fireEvent.scroll(window)
    expect(tip()).toBeNull()
  })

  it('shows when the button it sits in is focused with the keyboard, and goes when it is left', async () => {
    const user = userEvent.setup()
    render(
      <button type="button">
        Logo
        <StatusMark status="outstanding" />
      </button>,
    )
    await user.tab()
    expect(tip()).toHaveTextContent('Outstanding')
    await user.tab()
    expect(tip()).toBeNull()
  })

  it('marks the two statuses differently by shape, not only by colour', () => {
    const resolved = render(<StatusMark status="resolved" />).container.querySelector('.status__dot svg')!.innerHTML
    const outstanding = render(<StatusMark status="outstanding" />).container.querySelector('.status__dot svg')!.innerHTML
    expect(resolved).not.toBe(outstanding)
  })

  it('reads out as the word alone when it is in a button with a label', () => {
    render(
      <button type="button">
        Logo
        <StatusMark status="outstanding" />
      </button>,
    )
    // the tooltip is hidden from the name, so it is "Logo, Outstanding", not the sentence as well
    expect(screen.getByRole('button')).toHaveAccessibleName('Logo, Outstanding')
  })
})
