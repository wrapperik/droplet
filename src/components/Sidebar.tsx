import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Icon } from '@solar-icons/react/lib/types'
import {
  AltArrowRightIcon,
  ExportIcon,
  FolderWithFilesIcon,
  HomeIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from '@solar-icons/react/linear'
import { mockAssets, type ProjectSummary } from '../lib/mockProjects.ts'
import { tasks, type TaskId } from '../lib/tasks.ts'
import ProjectSwitcher from './ProjectSwitcher.tsx'
import StatusMark from './StatusMark.tsx'
import ThemeSwitcher from './ThemeSwitcher.tsx'
import './Sidebar.css'

type Props = {
  projects: ProjectSummary[]
  currentProjectId: string
  onSelectProject: (id: string) => void
  activeId: string
  onNavigate: (id: string) => void
  onChooseTask?: (id: TaskId) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
}

type ItemProps = {
  id: string
  label: string
  icon: Icon
  activeId: string
  collapsed: boolean
  badge?: number
  onSelect: (id: string) => void
}

function NavItem({ id, label, icon: ItemIcon, activeId, collapsed, badge, onSelect }: ItemProps) {
  const active = activeId === id
  return (
    <li>
      <button
        type="button"
        className="nav__item"
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        onClick={() => onSelect(id)}
      >
        <ItemIcon size={22} aria-hidden="true" />
        <span className="nav__label">{label}</span>
        {badge ? (
          <span className="nav__badge">
            {badge}
            <span className="visually-hidden"> outstanding</span>
          </span>
        ) : null}
      </button>
    </li>
  )
}

export default function Sidebar({
  projects,
  currentProjectId,
  onSelectProject,
  activeId,
  onNavigate,
  onChooseTask,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
}: Props) {
  const [assetsOpen, setAssetsOpen] = useState(true)
  const assetsId = useId()
  const outstanding = mockAssets.filter((asset) => asset.status === 'outstanding').length
  const assetActive = mockAssets.some((asset) => asset.id === activeId)

  return (
    <aside className="sidebar" data-collapsed={collapsed} data-open={mobileOpen} aria-label="Sidebar">
      <ProjectSwitcher
        projects={projects}
        currentId={currentProjectId}
        collapsed={collapsed}
        onSelect={onSelectProject}
      />

      <hr className="sidebar__divider" />

      <nav className="nav" aria-label="Project">
        <ul className="nav__list">
          <NavItem id="home" label="Home" icon={HomeIcon} activeId={activeId} collapsed={collapsed} onSelect={onNavigate} />
        </ul>

        <hr className="sidebar__divider" />

        <ul className="nav__list">
          {tasks.map((task) => (
            <NavItem
              key={task.id}
              id={task.id}
              label={task.label}
              icon={task.icon}
              activeId={activeId}
              collapsed={collapsed}
              onSelect={(id) => {
                onNavigate(id)
                onChooseTask?.(id as TaskId)
              }}
            />
          ))}
        </ul>

        <hr className="sidebar__divider" />

        <ul className="nav__list">
          <li>
            <button
              type="button"
              className="nav__item nav__item--group"
              aria-expanded={assetsOpen}
              aria-controls={assetsId}
              aria-label={collapsed ? 'Assets' : undefined}
              title={collapsed ? 'Assets' : undefined}
              data-contains-active={assetActive || undefined}
              onClick={() => {
                // In the icon-only sidebar there is no room for the list, so open the sidebar instead.
                if (collapsed) {
                  setAssetsOpen(true)
                  onToggleCollapsed()
                } else {
                  setAssetsOpen((value) => !value)
                }
              }}
            >
              <FolderWithFilesIcon size={22} aria-hidden="true" />
              <span className="nav__label">Assets</span>
              <AltArrowRightIcon className="nav__chevron" size={16} aria-hidden="true" />
            </button>

            <AnimatePresence initial={false}>
              {assetsOpen && (
                <motion.ul
                  id={assetsId}
                  className="subnav"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {mockAssets.map((asset) => (
                    <li key={asset.id}>
                      <button
                        type="button"
                        className="subnav__item"
                        aria-current={activeId === asset.id ? 'page' : undefined}
                        onClick={() => onNavigate(asset.id)}
                      >
                        <span className="subnav__label">{asset.label}</span>
                        <StatusMark status={asset.status} />
                      </button>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </li>
          <NavItem
            id="review"
            label="Review and export"
            icon={ExportIcon}
            activeId={activeId}
            collapsed={collapsed}
            badge={outstanding}
            onSelect={onNavigate}
          />
        </ul>
      </nav>

      <ThemeSwitcher />

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
    </aside>
  )
}
