import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AddCircleIcon, CheckIcon, ChevronsUpDownIcon, NotebookIcon } from '@solar-icons/react/linear'
import { useDismiss } from '../hooks/useDismiss.ts'
import type { ProjectSummary } from '../lib/mockProjects.ts'
import FolderIcon from './FolderIcon.tsx'
import './ProjectSwitcher.css'

type Props = {
  projects: ProjectSummary[]
  currentId: string
  collapsed: boolean
  onSelect: (id: string) => void
  onNewProject?: () => void
  // Opens the project brief: everything Droplet remembers about this business.
  onOpenBrief?: () => void
}

export default function ProjectSwitcher({ projects, currentId, collapsed, onSelect, onNewProject, onOpenBrief }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrapRef)

  const current = projects.find((project) => project.id === currentId) ?? projects[0]

  return (
    <div className="switcher" ref={wrapRef}>
      <button
        type="button"
        className="switcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? `Project: ${current.name}` : undefined}
        title={collapsed ? current.name : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <FolderIcon className="switcher__icon" />
        <span className="switcher__name">{current.name}</span>
        <ChevronsUpDownIcon className="switcher__chevron" size={18} aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="switcher__menu glass glass--strong"
            role="menu"
            aria-label="Projects"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                role="menuitemradio"
                aria-checked={project.id === currentId}
                className="switcher__item"
                onClick={() => {
                  setOpen(false)
                  onSelect(project.id)
                }}
              >
                <FolderIcon className="switcher__item-icon" />
                <span className="switcher__item-name">{project.name}</span>
                {project.id === currentId && <CheckIcon size={18} aria-hidden="true" />}
              </button>
            ))}
            <hr className="switcher__divider" />
            <button
              type="button"
              role="menuitem"
              className="switcher__item"
              onClick={() => {
                setOpen(false)
                onOpenBrief?.()
              }}
            >
              <NotebookIcon size={22} aria-hidden="true" />
              <span className="switcher__item-name">Project brief</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="switcher__item switcher__item--new"
              onClick={() => {
                setOpen(false)
                onNewProject?.()
              }}
            >
              <AddCircleIcon size={22} aria-hidden="true" />
              <span className="switcher__item-name">New project</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
