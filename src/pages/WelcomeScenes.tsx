import { useMemo } from 'react'
import { ArrowRightIcon, CheckIcon, LockKeyholeIcon, ReplyIcon } from '@solar-icons/react/linear'
import { STARTER_PALETTE } from '../compose/fallback.ts'
import ContrastBadge from '../components/ContrastBadge.tsx'
import Emerge from '../components/Emerge.tsx'
import FolderIcon from '../components/FolderIcon.tsx'
import { contrastLevel, contrastRatio, hexToRgb, readableTextColour } from '../lib/colour.ts'
import { computeTotals, type Line } from '../lib/invoice.ts'
import { formatRand } from '../lib/money.ts'
import { tasks, type TaskId } from '../lib/tasks.ts'
import './WelcomeScenes.css'

// The pictures beside the words of the introduction. Each is drawn from the app's own parts (its tasks, its palette, its sums and its
// colours), never from a screenshot, so what they show is what the app does. They are decoration: the words say it all, so the whole
// stage is hidden from a screen reader (see Welcome.tsx).

const roleColour = (role: string) => STARTER_PALETTE.find((colour) => colour.role === role)!.hex

// ---- 1. Say what you need ----

const SAMPLE_LINES: Line[] = [{ id: 1, description: 'Gift box', quantity: 12, unitCents: 45_000 }]

function SayWhatYouNeed() {
  // The sums on the sample invoice are the app's own, worked out in code: 12 at R450, and 15 percent VAT.
  const totals = useMemo(() => computeTotals(SAMPLE_LINES, true), [])
  const paper = { background: roleColour('background'), color: roleColour('text') }
  const accent = { color: roleColour('accent') }
  return (
    <div className="scene scene--what">
      <Emerge distance={0.15}>
        <div className="scene-bar">
          <span className="scene-bar__text">Invoice Pretoria Print Works for 12 boxes at R450</span>
          <span className="scene-bar__send">
            <ReplyIcon size={16} />
          </span>
        </div>
      </Emerge>

      <Emerge delay={0.55} distance={0.5}>
        <div className="scene-steps glass">
          {['Your business', 'Client', 'Details'].map((step, index) => (
            <span className="scene-steps__step" key={step}>
              <span className="scene-steps__mark" data-done={index < 2 || undefined}>
                {index < 2 && <CheckIcon size={11} strokeWidth={2.5} />}
              </span>
              {step}
            </span>
          ))}
        </div>
      </Emerge>

      <Emerge delay={0.85} distance={0.9}>
        <div className="scene-doc" style={paper}>
          <div className="scene-doc__head">
            <strong style={accent}>Tax invoice</strong>
            <span>INV-0007</span>
          </div>
          <p className="scene-doc__to">Pretoria Print Works</p>
          <div className="scene-doc__row">
            <span>12 × Gift box</span>
            <span>{formatRand(totals.subtotalCents)}</span>
          </div>
          <div className="scene-doc__row scene-doc__row--quiet">
            <span>VAT 15%</span>
            <span>{formatRand(totals.vatCents ?? 0)}</span>
          </div>
          <div className="scene-doc__row scene-doc__row--total">
            <span>Total</span>
            <span style={accent}>{formatRand(totals.totalCents)}</span>
          </div>
        </div>
      </Emerge>
    </div>
  )
}

// ---- 2. Not a chat, a workspace ----

function ChatVersusWorkspace() {
  const ratio = contrastRatio(hexToRgb(roleColour('text')), hexToRgb(roleColour('background')))
  return (
    <div className="scene scene--versus">
      <Emerge distance={0.15}>
        <figure className="versus-chat glass">
          <figcaption>A reply to read</figcaption>
          <p>A calm blue such as #0B4F8A pairs well with a soft #CFE9FB. Try near-black for the text.</p>
        </figure>
      </Emerge>

      <Emerge delay={0.5} distance={0.7}>
        <figure className="versus-droplet glass glass--strong">
          <figcaption>A tool to use</figcaption>
          <div className="versus-droplet__swatches">
            {STARTER_PALETTE.map((colour, index) => (
              <span className="versus-droplet__swatch" key={colour.hex} data-first={index === 0 || undefined} style={{ background: colour.hex, color: readableTextColour(colour.hex) }}>
                {colour.hex.toUpperCase()}
              </span>
            ))}
          </div>
          <div className="versus-droplet__foot">
            <span>Text on background</span>
            <ContrastBadge ratio={ratio} level={contrastLevel(ratio)} />
          </div>
        </figure>
      </Emerge>
    </div>
  )
}

// ---- 3. What it does ----

const LIVE: TaskId[] = ['ideation', 'brand', 'invoice']
const NEXT: TaskId[] = ['logo', 'correspondence']

function WhatItDoes() {
  const byId = (id: TaskId) => tasks.find((task) => task.id === id)!
  return (
    <div className="scene scene--does">
      <div className="scene-tasks">
        {LIVE.map((id, index) => {
          const { label, hint, icon: TaskIcon } = byId(id)
          return (
            <Emerge key={id} delay={index * 0.14} distance={0.3 + index * 0.25}>
              <div className="scene-task glass glass--strong">
                <span className="scene-task__icon">
                  <TaskIcon size={22} />
                </span>
                <span className="scene-task__text">
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </span>
              </div>
            </Emerge>
          )
        })}
      </div>
      <Emerge delay={0.6} distance={0.8}>
        <div className="scene-next">
          {NEXT.map((id) => {
            const { label, icon: TaskIcon } = byId(id)
            return (
              <span className="scene-next__item" key={id}>
                <TaskIcon size={18} />
                {label}
                <em>Next</em>
              </span>
            )
          })}
        </div>
      </Emerge>
    </div>
  )
}

// ---- 4. You decide ----

function YouDecide() {
  return (
    <div className="scene scene--decide">
      <Emerge distance={0.2}>
        <span className="scene-chip scene-chip--proposes">
          <span className="scene-chip__dot" />
          Droplet proposes
        </span>
      </Emerge>

      <Emerge delay={0.35} distance={0.6}>
        <div className="scene-confirm glass glass--strong">
          <p className="scene-confirm__title">Save to Kindred Gifting</p>
          {[
            ['Your business details', 'New'],
            ['The client', 'New'],
            ['This invoice', 'New'],
          ].map(([what, status]) => (
            <div className="scene-confirm__row" key={what}>
              <span className="scene-confirm__tick">
                <CheckIcon size={11} strokeWidth={2.5} />
              </span>
              <span>{what}</span>
              <em>{status}</em>
            </div>
          ))}
          <div className="scene-confirm__buttons">
            <span className="scene-confirm__cancel">Cancel</span>
            <span className="scene-confirm__go">Confirm and save</span>
          </div>
        </div>
      </Emerge>

      <Emerge delay={0.75} distance={0.8}>
        <span className="scene-chip scene-chip--confirms">
          <LockKeyholeIcon size={15} />
          You confirm
        </span>
      </Emerge>
    </div>
  )
}

// ---- 5. Name the project ----

function NameTheProject({ name }: { name: string }) {
  const shown = name.trim()
  return (
    <div className="scene scene--name">
      <Emerge distance={0.4}>
        <div className="scene-project glass glass--strong">
          <FolderIcon className="scene-project__folder" />
          <span className="scene-project__name" data-empty={shown === '' || undefined}>
            {shown === '' ? 'Your project' : shown}
          </span>
          <span className="scene-project__note">
            Project
            <ArrowRightIcon size={13} />
            Idea, brand, invoice
          </span>
        </div>
      </Emerge>
    </div>
  )
}

export type SceneId = 'what' | 'different' | 'does' | 'control' | 'name'

export default function Scene({ id, name }: { id: SceneId; name: string }) {
  if (id === 'what') return <SayWhatYouNeed />
  if (id === 'different') return <ChatVersusWorkspace />
  if (id === 'does') return <WhatItDoes />
  if (id === 'control') return <YouDecide />
  return <NameTheProject name={name} />
}
