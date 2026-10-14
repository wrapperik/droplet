import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLogo } from '../lib/logoStore.ts'
import { saveMemory } from '../lib/memoryStore.ts'
import { emptyMemory, withFact, withIdea } from '../lib/projectMemory.ts'
import { savePalette } from '../lib/projectStore.ts'
import LogoHandoff from './LogoHandoff.tsx'

const PROJECT = 'kindred'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const NOW = '2026-10-15T09:00:00.000Z'

const withBrand = async () => {
  await savePalette(PROJECT, { blocks: [{ id: 1, hex: '#0E1A2B', role: 'text' }, { id: 2, hex: '#F4F8FB', role: 'background' }, { id: 3, hex: '#0B4F8A', role: 'primary' }], layout: [] })
  await saveMemory(PROJECT, withIdea(emptyMemory(), 'name', 'Kindred Gifting', NOW))
}

const setup = (over: Partial<React.ComponentProps<typeof LogoHandoff>> = {}) => {
  const props = { projectId: PROJECT, onClose: vi.fn(), onChanged: vi.fn(), onOpenBrand: vi.fn(), ...over }
  render(<LogoHandoff {...props} />)
  return props
}

const choose = async (file: File) => {
  // The input is visually hidden; the founder reaches it through the button, and the test sets the file on it directly.
  await userEvent.upload(screen.getByLabelText('Logo file', { selector: 'input' }), file, { applyAccept: false })
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('the logo handoff card', () => {
  it('says plainly that Droplet does not make logos, and that the logo is outstanding', async () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Get a logo' })
    expect(dialog).toHaveTextContent('Droplet does not make logos or images')
    expect(dialog).toHaveTextContent('Outstanding: made outside Droplet')
  })

  it('gives the saved palette\'s hex codes and the files to ask for, each with a copy button', async () => {
    await withBrand()
    setup()
    expect(await screen.findByText('Text #0E1A2B')).toBeInTheDocument()
    expect(screen.getByText('Background #F4F8FB')).toBeInTheDocument()
    expect(screen.getByText('Primary #0B4F8A')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy colours' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy transparent png' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy a square version' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy the whole spec' })).toBeInTheDocument()
  })

  it('says when there is no palette and offers to build the brand first', async () => {
    const props = setup()
    expect(await screen.findByText(/No palette is saved, so there are no colours/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Build the brand first' }))
    expect(props.onOpenBrand).toHaveBeenCalled()
  })

  it('labels the fonts as a suggestion until the founder has chosen some', async () => {
    await saveMemory(PROJECT, withFact(emptyMemory(), 'brand.fonts', 'Poppins and Inter', NOW))
    setup()
    expect(await screen.findByText('Fonts')).toBeInTheDocument()
    expect(screen.getByText('Poppins and Inter')).toBeInTheDocument()
    expect(screen.queryByText(/Droplet has no font tool yet/)).not.toBeInTheDocument()
  })

  it('links to Canva and Adobe Express in a new tab', async () => {
    setup()
    for (const name of [/Canva/, /Adobe Express/]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link.getAttribute('rel')).toMatch(/noopener/)
      expect(link.getAttribute('href')).toMatch(/^https:\/\//)
    }
  })

  it('rejects a wrong kind of file with the reason, and stays outstanding', async () => {
    const props = setup()
    await choose(new File(['x'], 'logo.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a PNG or an SVG/)
    expect(await loadLogo(PROJECT)).toBeNull()
    expect(props.onChanged).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('Outstanding')
  })

  it('rejects a file that is too big, with the sizes', async () => {
    setup()
    const big = new Uint8Array(1_200_000)
    big.set(PNG)
    await choose(new File([big], 'big.png', { type: 'image/png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/limit is 1 MB/)
  })

  it('accepts a PNG, shows it, marks the logo resolved and tells the app', async () => {
    const props = setup()
    await choose(new File([PNG], 'kindred.png', { type: 'image/png' }))
    expect(await screen.findByRole('img', { name: 'Your logo, kindred.png' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Resolved: your logo is added')
    expect((await loadLogo(PROJECT))?.name).toBe('kindred.png')
    expect(props.onChanged).toHaveBeenCalledTimes(1)
  })

  it('shows a logo that is already added, and removes it only after a second press', async () => {
    const props = setup()
    await choose(new File([PNG], 'kindred.png', { type: 'image/png' }))
    await screen.findByRole('img', { name: /Your logo/ })
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await loadLogo(PROJECT)).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove the logo' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Outstanding'))
    expect(await loadLogo(PROJECT)).toBeNull()
    expect(props.onChanged).toHaveBeenCalledTimes(2)
  })

  it('keeps the logo when the second press is Keep it', async () => {
    setup()
    await choose(new File([PNG], 'kindred.png', { type: 'image/png' }))
    await screen.findByRole('img', { name: /Your logo/ })
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(within(screen.getByRole('dialog')).getByRole('img', { name: /Your logo/ })).toBeInTheDocument()
    expect(await loadLogo(PROJECT)).not.toBeNull()
  })

  it('closes on the close button and on Escape', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.keyboard('{Escape}')
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})
