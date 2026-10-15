import { useId } from 'react'
import { TEMPLATES, type TemplateId } from '../../lib/boardTemplates.ts'
import { Preview } from './BoardTools.tsx'
import './EmptyBoard.css'

// The templates offered on an empty board: the ones that suit the first thing a founder does, which is to get ideas out and then narrow them.
// The rest are in the Templates menu in the bar.
const STARTER_TEMPLATES: TemplateId[] = ['brain_dump', 'customer_problem', 'name_ideas', 'offer_comparison']

type Props = {
  // Puts a template on the board, exactly as the Templates menu does.
  onTemplate: (id: string) => void
}

// What an empty board says: what it is for, in a line, and a few ways to start. It sits in the middle of the view, over nothing (the board is empty),
// takes no presses outside itself, and is not a dialog. The board draws it only while there is nothing on the board.
export default function EmptyBoard({ onTemplate }: Props) {
  const titleId = useId()
  const starters = TEMPLATES.filter((template) => STARTER_TEMPLATES.includes(template.id))
  return (
    <section className="emptyboard glass glass--strong" aria-labelledby={titleId}>
      <h2 className="emptyboard__title" id={titleId}>
        Start your board
      </h2>
      <p className="emptyboard__lead">A place to lay out your thinking with notes, shapes, frames and arrows. Start from a template, and change any part of it.</p>
      <ul className="emptyboard__cards">
        {starters.map((template) => (
          <li key={template.id}>
            <button type="button" className="emptyboard__card" onClick={() => onTemplate(template.id)}>
              <Preview template={template} />
              <span className="templates__text">
                <span className="templates__name">{template.name}</span>
                <span className="templates__summary">{template.summary}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="emptyboard__or">Or choose Note in the bar, then click on the board to add a sticky note.</p>
    </section>
  )
}
