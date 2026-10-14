import { useState } from 'react'
import { ChatRoundAddIcon, ClockCircleIcon, FolderWithFilesIcon, NotebookIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from '@solar-icons/react/linear'
import type { ProjectSummary } from '../lib/mockProjects.ts'
import AccountMenu from './AccountMenu.tsx'
import ChatHistoryDialog from './ChatHistoryDialog.tsx'
import ChatList, { type ChatEntry } from './ChatList.tsx'
import ProjectSwitcher from './ProjectSwitcher.tsx'
import ThemeSwitcher from './ThemeSwitcher.tsx'
import './Sidebar.css'

// How many chats the sidebar lists. The rest are behind "See all chats".
export const RECENT_CHATS = 8

type Props = {
  projects: ProjectSummary[]
  currentProjectId: string
  onSelectProject: (id: string) => void
  // Make a project, or rename the current one, from the project menu. Each says null if it worked, otherwise what to tell the founder.
  onCreateProject?: (name: string) => Promise<string | null>
  onRenameProject?: (name: string) => Promise<string | null>
  // Opens the project brief.
  onOpenBrief?: () => void
  // Opens the library, everything made for the project. `libraryOpen` marks it while it is on screen.
  onOpenLibrary?: () => void
  libraryOpen?: boolean
  // The project's conversations, the open one first and then the rest, most recent first.
  chats: ChatEntry[]
  onNewChat: () => void
  onOpenChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onPinChat?: (id: string, pinned: boolean) => void
  // Droplet is working on a reply, so the conversation cannot be changed under it.
  busy?: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  // Who is signed in, shown in the account section at the bottom.
  userName: string
  // Opens the account page.
  onAccount?: () => void
  // Ends the session.
  onSignOut?: () => void
}

// The sidebar has no menu of places to go. What to work on is decided in the conversation, with Droplet (the task menu is still one press
// away in the message bar). So the sidebar holds the project, the conversations (the most recent few, and all of them behind a button),
// the theme and the account.
export default function Sidebar({
  projects,
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onOpenBrief,
  onOpenLibrary,
  libraryOpen = false,
  chats,
  onNewChat,
  onOpenChat,
  onDeleteChat,
  onPinChat,
  busy = false,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  userName,
  onAccount,
  onSignOut,
}: Props) {
  const [allOpen, setAllOpen] = useState(false)
  const recent = chats.slice(0, RECENT_CHATS)

  return (
    <aside className="sidebar on-shell" data-collapsed={collapsed} data-open={mobileOpen} aria-label="Sidebar">
      <ProjectSwitcher projects={projects} currentId={currentProjectId} collapsed={collapsed} onSelect={onSelectProject} onCreate={onCreateProject} onRename={onRenameProject} />

      {/* What belongs to the selected project sits right under its name: its brief and its library. */}
      <div className="sidebar__project" role="group" aria-label="This project">
        <button type="button" className="nav__item" aria-haspopup="dialog" aria-label={collapsed ? 'Project brief' : undefined} title={collapsed ? 'Project brief' : undefined} onClick={onOpenBrief}>
          <NotebookIcon size={18} aria-hidden="true" />
          <span className="nav__label">Project brief</span>
        </button>
        <button
          type="button"
          className="nav__item"
          aria-current={libraryOpen ? 'page' : undefined}
          aria-label={collapsed ? 'Library' : undefined}
          title={collapsed ? 'Library' : undefined}
          onClick={onOpenLibrary}
        >
          <FolderWithFilesIcon size={18} aria-hidden="true" />
          <span className="nav__label">Library</span>
        </button>
      </div>

      <hr className="sidebar__divider" />

      <nav className="chats" aria-label="Chats">
        <button type="button" className="nav__item" disabled={busy} aria-label={collapsed ? 'New chat' : undefined} title={collapsed ? 'New chat' : undefined} onClick={onNewChat}>
          <ChatRoundAddIcon size={18} aria-hidden="true" />
          <span className="nav__label">New chat</span>
        </button>

        {collapsed ? (
          chats.length > 0 && (
            <button type="button" className="nav__item" aria-label="Chat history" title="Chat history" onClick={() => setAllOpen(true)}>
              <ClockCircleIcon size={18} aria-hidden="true" />
              <span className="nav__label">Chat history</span>
            </button>
          )
        ) : (
          <div className="chats__recent">
            <h2 className="chats__heading">Recent</h2>
            {recent.length === 0 ? (
              <p className="chats__empty">Your conversations are kept here once you have said something.</p>
            ) : (
              <ChatList chats={recent} busy={busy} onOpen={onOpenChat} onDelete={onDeleteChat} onPin={onPinChat} onShell />
            )}
            {chats.length > RECENT_CHATS && (
              <button type="button" className="chats__all" onClick={() => setAllOpen(true)}>
                See all chats
              </button>
            )}
          </div>
        )}
      </nav>

      <ThemeSwitcher />

      <AccountMenu name={userName} collapsed={collapsed} onAccount={onAccount} onSignOut={onSignOut} />

      <button
        type="button"
        className="sidebar__collapse"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : undefined}
        onClick={onToggleCollapsed}
      >
        {collapsed ? <PanelLeftOpenIcon size={18} aria-hidden="true" /> : <PanelLeftCloseIcon size={18} aria-hidden="true" />}
        <span className="nav__label">Collapse</span>
      </button>

      <ChatHistoryDialog open={allOpen} onClose={() => setAllOpen(false)} chats={chats} busy={busy} onOpen={onOpenChat} onDelete={onDeleteChat} onPin={onPinChat} />
    </aside>
  )
}
