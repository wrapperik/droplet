import type { ProjectSummary } from '../lib/mockProjects.ts'
import './ProjectRail.css'

type Props = {
  projects: ProjectSummary[]
  currentId: string | null
  onSelect: (id: string) => void
}

export default function ProjectRail({ projects, currentId, onSelect }: Props) {
  return (
    <nav className="rail" aria-labelledby="rail-heading">
      <h2 className="rail__heading" id="rail-heading">
        Projects
      </h2>
      <ul className="rail__list">
        {projects.map((project) => {
          const current = project.id === currentId
          return (
            <li key={project.id}>
              <button
                type="button"
                className="rail__item"
                aria-current={current ? 'true' : undefined}
                onClick={() => onSelect(project.id)}
              >
                {project.name}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
