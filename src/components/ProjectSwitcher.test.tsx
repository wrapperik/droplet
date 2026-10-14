import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ProjectSwitcher from './ProjectSwitcher.tsx'

const projects = [
  { id: 'a', name: 'Kindred Gifting' },
  { id: 'b', name: 'Pet sitting' },
]

const setup = (props: Partial<React.ComponentProps<typeof ProjectSwitcher>> = {}) => {
  const user = userEvent.setup()
  const onCreate = vi.fn(async (_name: string): Promise<string | null> => null)
  const onRename = vi.fn(async (_name: string): Promise<string | null> => null)
  const onSelect = vi.fn()
  render(<ProjectSwitcher projects={projects} currentId="a" collapsed={false} onSelect={onSelect} onCreate={onCreate} onRename={onRename} {...props} />)
  return { user, onCreate, onRename, onSelect }
}

const openMenu = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /Kindred Gifting/ }))

describe('ProjectSwitcher', () => {
  it('lists the projects and still switches between them', async () => {
    const { user, onSelect } = setup()
    await openMenu(user)
    await user.click(screen.getByRole('menuitemradio', { name: 'Pet sitting' }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('opens a form from New project, with the field focused', async () => {
    const { user } = setup()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    const field = screen.getByRole('textbox', { name: 'Business or project name' })
    expect(field).toHaveFocus()
    expect(field).toHaveValue('')
  })

  it('creates a project with a tidied name, and closes the menu', async () => {
    const { user, onCreate } = setup()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    await user.type(screen.getByRole('textbox', { name: 'Business or project name' }), '  Plant   nursery ')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Plant nursery'))
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('refuses an empty name, a name that is too long and a name the founder already has, in words, and creates nothing', async () => {
    const { user, onCreate } = setup()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    const field = screen.getByRole('textbox', { name: 'Business or project name' })
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Give the project a name.')
    await user.type(field, 'x'.repeat(81))
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use 80 characters or fewer.')
    await user.clear(field)
    await user.type(field, 'pet SITTING')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByRole('alert')).toHaveTextContent('You already have a project with that name.')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(onCreate).not.toHaveBeenCalled()
    // typing again clears the message
    await user.type(field, '!')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says so and keeps what was typed when the project could not be made', async () => {
    const onCreate = vi.fn(async () => 'We could not make that project.')
    const { user } = setup({ onCreate })
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    await user.type(screen.getByRole('textbox', { name: 'Business or project name' }), 'Plant nursery')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not make that project.')
    expect(screen.getByRole('textbox', { name: 'Business or project name' })).toHaveValue('Plant nursery')
  })

  it('ignores a second press while it is saving, and keeps the form open until it is done', async () => {
    let finish!: (value: string | null) => void
    const onCreate = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)))
    const { user } = setup({ onCreate })
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    await user.type(screen.getByRole('textbox', { name: 'Business or project name' }), 'Plant nursery{Enter}')
    await user.click(screen.getByRole('button', { name: 'Saving' }))
    await user.keyboard('{Enter}')
    expect(onCreate).toHaveBeenCalledTimes(1)
    // a press outside does not take the form away from a request on its way
    await user.click(document.body)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    finish(null)
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
  })

  it('closes on Cancel back to the list, and on Escape, without making anything', async () => {
    const { user, onCreate } = setup()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('menu', { name: 'Projects' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'New project' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
    // opened again, it is the list
    await openMenu(user)
    expect(screen.getByRole('menu', { name: 'Projects' })).toBeInTheDocument()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('renames the current project, starting from its name, and lets it keep its own name', async () => {
    const { user, onRename } = setup()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Rename project' }))
    const field = screen.getByRole('textbox', { name: 'Business or project name' })
    expect(field).toHaveValue('Kindred Gifting')
    await user.clear(field)
    await user.type(field, 'Pet sitting')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    expect(screen.getByRole('alert')).toHaveTextContent('You already have a project with that name.')
    await user.clear(field)
    await user.type(field, 'Kindred Gifts')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Kindred Gifts'))
  })

  it('shows New project and Rename project but cannot use them when the parent gives no way to', async () => {
    const { user } = setup({ onCreate: undefined, onRename: undefined })
    await openMenu(user)
    const item = screen.getByRole('menuitem', { name: 'New project' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    expect(item).toHaveAttribute('title', 'Projects cannot be added here.')
    await user.click(item)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename project' })).toHaveAttribute('aria-disabled', 'true')
  })
})
