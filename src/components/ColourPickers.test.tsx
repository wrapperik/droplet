import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ColourWheel from './ColourWheel.tsx'
import { ColourFields, RoleChoice } from './ColourFields.tsx'
import SpectrumPicker from './SpectrumPicker.tsx'

const blocks = [
  { id: 1, hex: '#FF0000' },
  { id: 2, hex: '#00FF00' },
]

describe('the colour wheel', () => {
  it('has a marker for every colour and a brightness slider, and no fields: those are under it', () => {
    const { container } = render(<ColourWheel blocks={blocks} selectedId={1} onSelect={() => {}} onChange={() => {}} />)
    expect(container.querySelectorAll('.wheel__marker')).toHaveLength(2)
    expect(container.querySelectorAll('.wheel__marker[data-selected]')).toHaveLength(1)
    expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
    expect(screen.queryByLabelText('Hex')).not.toBeInTheDocument()
  })

  it('draws a line to each colour only when a harmony is chosen', () => {
    const { container, rerender } = render(<ColourWheel blocks={blocks} selectedId={1} onSelect={() => {}} onChange={() => {}} />)
    expect(container.querySelector('.wheel__rays')).toBeNull()
    rerender(<ColourWheel blocks={blocks} selectedId={1} onSelect={() => {}} onChange={() => {}} showRule />)
    expect(container.querySelectorAll('.wheel__rays line')).toHaveLength(2)
  })

  it('nudges the selected colour with the arrow keys, and changes its brightness from the slider', async () => {
    const onChange = vi.fn()
    render(<ColourWheel blocks={blocks} selectedId={1} onSelect={() => {}} onChange={onChange} />)
    screen.getByRole('application').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith(1, expect.stringMatching(/^#[0-9A-F]{6}$/))
    expect(onChange.mock.calls[0][1]).not.toBe('#FF0000')
    await userEvent.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

describe('the spectrum picker', () => {
  function Harness() {
    const [hex, setHex] = useState('#FF0000')
    return (
      <>
        <SpectrumPicker hex={hex} label="colour 1" onChange={setHex} />
        <output data-testid="hex">{hex}</output>
      </>
    )
  }

  it('moves with the arrow keys: saturation across, brightness up and down', async () => {
    render(<Harness />)
    screen.getByRole('application', { name: /^Spectrum for colour 1/ }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByTestId('hex')).not.toHaveTextContent('#FF0000')
    const darker = screen.getByTestId('hex').textContent
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByTestId('hex').textContent).not.toBe(darker)
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByTestId('hex').textContent).toMatch(/^#FF/)
  })

  it('turns the hue from its slider and keeps the saturation and brightness', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Hue'), { target: { value: '120' } })
    expect(screen.getByTestId('hex')).toHaveTextContent('#00FF00')
  })
})

describe('the fields for one colour', () => {
  it('applies a complete hex at once, a short one on Enter, and says when it is not a colour', async () => {
    const onChange = vi.fn()
    render(<ColourFields hex="#1F8FE0" number={2} onChange={onChange} />)
    const hex = screen.getByLabelText('Hex')
    await userEvent.clear(hex)
    await userEvent.type(hex, '#1F8')
    expect(onChange).not.toHaveBeenCalled()
    expect(hex).toHaveAttribute('aria-invalid', 'false')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('#11FF88')
    await userEvent.clear(hex)
    await userEvent.type(hex, 'zz')
    await userEvent.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(hex).toHaveValue('#1F8FE0')
  })

  it('names the red, green and blue of the colour it is for', () => {
    render(<ColourFields hex="#1F8FE0" number={2} onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Red, green and blue of colour 2' })).toBeInTheDocument()
    expect(screen.getByLabelText('Red')).toHaveValue('31')
    expect(screen.getByLabelText('Green')).toHaveValue('143')
    expect(screen.getByLabelText('Blue')).toHaveValue('224')
  })
})

describe('the role choice', () => {
  it('says what the colours suggest when none is chosen, and what was chosen otherwise', () => {
    const { rerender } = render(<RoleChoice number={3} role={undefined} suggested="background" onChange={() => {}} />)
    expect(screen.getByText('Suggested from the colours: Background.')).toBeInTheDocument()
    rerender(<RoleChoice number={3} role="text" suggested={null} onChange={() => {}} />)
    expect(screen.getByText(/You chose Text/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role of colour 3' })).toHaveValue('text')
  })
})
