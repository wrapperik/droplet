import { cleanProjectName } from './projectNames.ts'

// The introduction a founder sees once, after making an account (src/pages/Welcome.tsx). Few words, and every claim in it is one the app
// keeps: the copy is data so that a test can hold it to a short length, and so that what it promises is in one place to check.

// What the first project is called until the founder names their business.
export const FIRST_PROJECT_NAME = 'My first project'

export type IntroSlide = {
  id: 'what' | 'different' | 'does' | 'control'
  // Names the step: the small line above the title, and the name of its dot.
  label: string
  title: string
  lead?: string
  // Short lines, each with the picture that goes with it on the left of the screen.
  points?: string[]
}

export const INTRO_SLIDES: IntroSlide[] = [
  {
    id: 'what',
    label: 'What it is',
    title: 'Say what you need. Droplet builds the workspace.',
    lead: 'No fixed screens. The right tools appear, ready to use.',
  },
  {
    id: 'different',
    label: 'How it differs',
    title: 'Not a chat. A workspace.',
    lead: 'Other AI describes a palette. Droplet gives you one to adjust.',
  },
  {
    id: 'does',
    label: 'What it does',
    title: 'Professional decisions, without the professional.',
    lead: 'Shape the idea, build the brand, make the invoice. Logos and client emails are next.',
  },
  {
    id: 'control',
    label: 'Your say',
    title: 'You decide. Droplet proposes.',
    points: [
      'Nothing is saved until you confirm.',
      'Totals, VAT and contrast are worked out in code, never guessed.',
      'Addresses, contacts and bank details never reach the AI.',
    ],
  },
]

export const NAME_STEP = {
  label: 'Your first project',
  title: 'What are you working on?',
  lead: 'Usually your business. Everything you make is kept inside it.',
}

type Named = { id: string; name: string }

// What naming the first project should do, given the projects the founder has and what they typed. A name they already have is left
// alone, the first project that was made for them is renamed (so they do not end up with an empty "My first project" beside it), and
// otherwise a project is made. Nothing is touched when they typed nothing.
export type FirstProjectPlan = { kind: 'keep' } | { kind: 'create'; name: string } | { kind: 'rename'; id: string; name: string }

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function planFirstProject(projects: Named[], typed: string): FirstProjectPlan {
  const name = cleanProjectName(typed)
  if (name === '') return { kind: 'keep' }
  if (projects.some((project) => sameName(project.name, name))) return { kind: 'keep' }
  const [only] = projects
  if (projects.length === 1 && only.name === FIRST_PROJECT_NAME) return { kind: 'rename', id: only.id, name }
  return { kind: 'create', name }
}
