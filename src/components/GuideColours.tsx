import { useId, useMemo, useState } from 'react'
import { AddCircleIcon, CloseCircleIcon, MagicWand3Icon, RefreshIcon } from '@solar-icons/react/linear'
import { normaliseHex } from '../lib/colour.ts'
import type { GuidePicks } from '../lib/brandGuide.ts'
import { COLOUR_ROLES, resolveRoles, type PaletteBlock } from '../lib/palette.ts'
import { MAX_FAVOURITES, OPTIONS_PER_ROUND, cleanFavourites, isOption, paletteOptions, type PaletteOption } from '../lib/paletteOptions.ts'
import { ColourFields } from './ColourFields.tsx'
import ColourWheel from './ColourWheel.tsx'
import ContrastBadge from './ContrastBadge.tsx'
import './GuideColours.css'

const START_COLOUR = '#1F8FE0'
const ROLE_LABEL = Object.fromEntries(COLOUR_ROLES.map((role) => [role.id, role.label]))

type Props = {
  picks: GuidePicks
  onPicks: (next: GuidePicks) => void
  // The palette the workspace has now, to mark the option that is chosen.
  blocks: PaletteBlock[]
  // The project already has a saved palette, and it is the one on the page. The step says it can be carried on with.
  showsSaved: boolean
  // The founder chose an option: the workspace takes its colours, as one undo step.
  onChoose: (option: PaletteOption) => void
}

// The Colours step of Guide mode: up to three colours the founder likes, as chips, then three palettes built in code from the harmonies (no model is asked), each
// shown with its swatches, their roles and how the text reads on the background. "Show 3 more" gives three different ones. Choosing one sets the palette.
export default function GuideColours({ picks, onPicks, blocks, showsSaved, onChoose }: Props) {
  const id = useId()
  const [draft, setDraft] = useState(START_COLOUR)
  const [note, setNote] = useState('')
  const favourites = cleanFavourites(picks.favourites)
  const full = favourites.length >= MAX_FAVOURITES
  const favouritesKey = favourites.join()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => (picks.shown ? paletteOptions(favourites, picks.round) : []), [picks.shown, picks.round, favouritesKey])

  const changeFavourites = (next: string[], said: string) => {
    // The palettes were built from the old colours, so they go until they are asked for again.
    onPicks({ favourites: next, shown: false, round: 0 })
    setNote(said)
  }

  const add = () => {
    const hex = normaliseHex(draft)
    if (!hex || full) return
    if (favourites.includes(hex)) return setNote(`${hex} is already one of your colours.`)
    changeFavourites([...favourites, hex], `Added ${hex}.`)
  }

  return (
    <div className="gcolours">
      {showsSaved && !picks.shown && <p className="gcolours__saved">This project already has a saved palette, shown on the page. You can carry on with it, or pick colours here to make a new one.</p>}

      <div className="gcolours__block">
        <h3 className="gcolours__heading" id={`${id}-picks`}>
          {`Your colours (${favourites.length} of ${MAX_FAVOURITES})`}
        </h3>
        {favourites.length === 0 ? (
          <p className="gcolours__empty">None yet. Choose a colour below and add it.</p>
        ) : (
          <ul className="gcolours__chips" aria-labelledby={`${id}-picks`}>
            {favourites.map((hex) => (
              <li key={hex} className="gcolours__chip">
                <span className="gcolours__dot" style={{ background: hex }} aria-hidden="true" />
                <span className="gcolours__hex">{hex}</span>
                <button type="button" className="gcolours__remove" aria-label={`Remove ${hex}`} onClick={() => changeFavourites(favourites.filter((other) => other !== hex), `Removed ${hex}.`)}>
                  <CloseCircleIcon size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {full ? (
        <p className="gcolours__empty">That is three. Remove one to add a different colour.</p>
      ) : (
        <div className="gcolours__block">
          <ColourWheel blocks={[{ id: 1, hex: draft }]} selectedId={1} onSelect={() => {}} onChange={(_, hex) => setDraft(hex)} />
          <ColourFields hex={draft} number={1} onChange={setDraft} />
          <button type="button" className="gcolours__button" onClick={add}>
            <AddCircleIcon size={18} aria-hidden="true" />
            {`Add ${normaliseHex(draft) ?? 'this colour'}`}
          </button>
        </div>
      )}

      <p className="visually-hidden" role="status">
        {note}
      </p>

      {!picks.shown ? (
        <button type="button" className="gcolours__button gcolours__button--primary" disabled={favourites.length === 0} onClick={() => onPicks({ ...picks, favourites, shown: true, round: 0 })}>
          <MagicWand3Icon size={18} aria-hidden="true" />
          Show palettes
        </button>
      ) : (
        <div className="gcolours__block">
          <h3 className="gcolours__heading" id={`${id}-options`}>
            Pick a palette
          </h3>
          <div className="gcolours__options" role="radiogroup" aria-labelledby={`${id}-options`}>
            {options.map((option, index) => {
              const roles = resolveRoles(option.blocks)
              const chosen = isOption(option, blocks)
              const words = option.textOnBackground.level === 'fail' ? 'Fails AA' : `Passes ${option.textOnBackground.level}`
              const describe = `${option.title}. ${COLOUR_ROLES.map((role) => `${role.label} ${roles[role.id].hex}`).join(', ')}. Text on background ${option.textOnBackground.ratio.toFixed(1)} to 1, ${words}.`
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-label={`Palette ${picks.round * OPTIONS_PER_ROUND + index + 1}: ${describe}`}
                  className="gcolours__card"
                  onClick={() => {
                    if (chosen) return
                    onChoose(option)
                    setNote(`${option.title} chosen. The page now shows it.`)
                  }}
                >
                  <span className="gcolours__name">
                    {option.title}
                    {chosen && <span className="gcolours__chosen"> (chosen)</span>}
                  </span>
                  <span className="gcolours__note">{option.note}</span>
                  <span className="gcolours__swatches" aria-hidden="true">
                    {option.blocks.map((block) => (
                      <span key={block.id} className="gcolours__swatch">
                        <span className="gcolours__fill" style={{ background: block.hex }} />
                        <span className="gcolours__role">{block.role ? ROLE_LABEL[block.role] : 'Extra'}</span>
                      </span>
                    ))}
                  </span>
                  <span className="gcolours__readable" aria-hidden="true">
                    <span>Text on background</span>
                    <ContrastBadge ratio={option.textOnBackground.ratio} level={option.textOnBackground.level} />
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="gcolours__button"
            onClick={() => {
              onPicks({ ...picks, round: picks.round + 1 })
              setNote('Showing three more palettes.')
            }}
          >
            <RefreshIcon size={18} aria-hidden="true" />
            Show 3 more
          </button>
        </div>
      )}
    </div>
  )
}
