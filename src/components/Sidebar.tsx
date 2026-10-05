import { useState } from 'react'
import { ChatRoundAddIcon, ClockCircleIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from '@solar-icons/react/linear'
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
  // The project's conversations, the open one first and then the rest, most recent first.
  chats: ChatEntry[]
  onNewChat: () => void
  onOpenChat: (id: string) => void
  onDeleteChat: (id: string) => void
  // Droplet is working on a reply, so the conversation cannot be changed under it.
  busy?: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  // Who is signed in, shown in the account section at the bottom.
  userName: string
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
  chats,
  onNewChat,
  onOpenChat,
  onDeleteChat,
  busy = false,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  userName,
  onSignOut,
}: Props) {
  const [allOpen, setAllOpen] = useState(false)
  const recent = chats.slice(0, RECENT_CHATS)

  return (
    <aside className="sidebar" data-collapsed={collapsed} data-open={mobileOpen} aria-label="Sidebar">
      <ProjectSwitcher projects={projects} currentId={currentProjectId} collapsed={collapsed} onSelect={onSelectProject} />

      <hr className="sidebar__divider" />

      <nav className="chats" aria-label="Chats">
        <button type="button" className="nav__item" disabled={busy} aria-label={collapsed ? 'New chat' : undefined} title={collapsed ? 'New chat' : undefined} onClick={onNewChat}>
          <ChatRoundAddIcon size={22} aria-hidden="true" />
          <span className="nav__label">New chat</span>
        </button>

        {collapsed ? (
          chats.length > 0 && (
            <button type="button" className="nav__item" aria-label="Chat history" title="Chat history" onClick={() => setAllOpen(true)}>
              <ClockCircleIcon size={22} aria-hidden="true" />
              <span className="nav__label">Chat history</span>
            </button>
          )
        ) : (
          <div className="chats__recent">
            <h2 className="chats__heading">Recent</h2>
            {recent.length === 0 ? (
              <p className="chats__empty">Your conversations are kept here once you have said something.</p>
            ) : (
              <ChatList chats={recent} busy={busy} onOpen={onOpenChat} onDelete={onDeleteChat} />
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

      <AccountMenu name={userName} collapsed={collapsed} onSignOut={onSignOut} />

      <button
        type="button"
        className="sidebar__collapse"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : undefined}
        onClick={onToggleCollapsed}
      >
        {collapsed ? <PanelLeftOpenIcon size={22} aria-hidden="true" /> : <PanelLeftCloseIcon size={22} aria-hidden="true" />}
        <span className="nav__label">Collapse</span>
      </button>

      <ChatHistoryDialog open={allOpen} onClose={() => setAllOpen(false)} chats={chats} busy={busy} onOpen={onOpenChat} onDelete={onDeleteChat} />
    </aside>
  )
}
