import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImageSource from './ImageSource.tsx'

const reader = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('../lib/imageColours.ts', () => ({ readImageColours: reader.read }))

const file = (name = 'logo.png', type = 'image/png') => new File(['x'], name, { type })
const input = () => screen.getByLabelText('Choose a picture to take colours from') as HTMLInputElement

beforeEach(() => reader.read.mockReset())

describe('taking a palette from a picture', () => {
  it('has a drop area with an upload button, a drag and drop line and the rule for files', () => {
    render(<ImageSource onUse={() => {}} />)
    expect(screen.getByRole('button', { name: 'Upload your image' })).toBeInTheDocument()
    expect(screen.getByText('Or drag and drop here')).toBeInTheDocument()
    expect(screen.getByText('File must be JPEG, PNG or WebP and up to 10 MB')).toBeInTheDocument()
    expect(input()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  })

  it('says the picture is read on this device and not uploaded', () => {
    render(<ImageSource onUse={() => {}} />)
    expect(screen.getByText(/not uploaded or kept/)).toBeInTheDocument()
  })

  it('shows the colours taken from a chosen picture, up to five, and only changes the palette when Use this palette is pressed', async () => {
    const onUse = vi.fn()
    reader.read.mockResolvedValue({ ok: true, colours: ['#112233', '#445566', '#778899'] })
    render(<ImageSource onUse={onUse} />)
    await userEvent.upload(input(), file())
    expect(reader.read).toHaveBeenCalledWith(expect.any(File), 5)
    const swatches = await screen.findByRole('list', { name: 'Colours taken from the picture' })
    expect(swatches).toHaveTextContent('#112233#445566#778899')
    expect(screen.getByText('Colours taken from logo.png')).toBeInTheDocument()
    expect(onUse).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Use this palette' }))
    expect(onUse).toHaveBeenCalledWith(['#112233', '#445566', '#778899'])
  })

  it('says why a picture was refused, as an alert', async () => {
    reader.read.mockResolvedValue({ ok: false, reason: 'That picture is over 10 MB. Choose a smaller one, or make it smaller first.' })
    render(<ImageSource onUse={() => {}} />)
    await userEvent.upload(input(), file('big.png'))
    expect(await screen.findByRole('alert')).toHaveTextContent('over 10 MB')
    expect(screen.queryByRole('button', { name: 'Use this palette' })).not.toBeInTheDocument()
  })

  it('says a picture with one colour is not enough for a palette', async () => {
    reader.read.mockResolvedValue({ ok: true, colours: ['#112233'] })
    render(<ImageSource onUse={() => {}} />)
    await userEvent.upload(input(), file())
    expect(await screen.findByRole('alert')).toHaveTextContent('needs at least two')
  })

  it('takes a picture dropped on the area', async () => {
    reader.read.mockResolvedValue({ ok: true, colours: ['#112233', '#445566'] })
    render(<ImageSource onUse={() => {}} />)
    const area = screen.getByText('Or drag and drop here').closest('.isource__drop')!
    const dropped = file('photo.jpg', 'image/jpeg')
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [dropped] } })
    area.dispatchEvent(drop)
    expect(await screen.findByText('Colours taken from photo.jpg')).toBeInTheDocument()
    expect(reader.read).toHaveBeenCalledWith(dropped, 5)
  })

  it('lets another picture be chosen after the result', async () => {
    reader.read.mockResolvedValueOnce({ ok: true, colours: ['#112233', '#445566'] }).mockResolvedValueOnce({ ok: true, colours: ['#AA0000', '#00AA00'] })
    render(<ImageSource onUse={() => {}} />)
    await userEvent.upload(input(), file('one.png'))
    await screen.findByText('Colours taken from one.png')
    await userEvent.upload(input(), file('two.png'))
    expect(await screen.findByText('Colours taken from two.png')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Colours taken from the picture' })).toHaveTextContent('#AA0000#00AA00')
  })

  it('does not send the picture anywhere: it only calls the reader in the browser', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    reader.read.mockResolvedValue({ ok: true, colours: ['#112233', '#445566'] })
    render(<ImageSource onUse={() => {}} />)
    await userEvent.upload(input(), file())
    await screen.findByText('Colours taken from logo.png')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
