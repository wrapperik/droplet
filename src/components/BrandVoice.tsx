import { CheckIcon } from '@solar-icons/react/linear'
import { MAX_VOICE, VOICE_WORDS, voiceSentence } from '../lib/brandType.ts'
import './BrandSteps.css'

type Props = {
  value: string[]
  onChange: (words: string[]) => void
}

// Step three of the brand guide: up to three words for how the business sounds. A chosen word can be pressed again to take it off; the others are held back once
// three are chosen, and the line says so.
export default function BrandVoice({ value, onChange }: Props) {
  const full = value.length >= MAX_VOICE
  const toggle = (word: string) => onChange(value.includes(word) ? value.filter((entry) => entry !== word) : full ? value : [...value, word])
  return (
    <section className="bstep" data-part="voice" tabIndex={-1} aria-label="Voice">
      <h3 className="bstep__title">Voice</h3>
      <p className="bstep__lead">Pick up to three words for how your business sounds when it writes to a client.</p>
      <div className="bstep__chips" role="group" aria-label="Words for your voice">
        {VOICE_WORDS.map((word) => {
          const chosen = value.includes(word)
          return (
            <button key={word} type="button" className="bchip" aria-pressed={chosen} disabled={!chosen && full} onClick={() => toggle(word)}>
              {chosen && <CheckIcon size={16} strokeWidth={2.5} aria-hidden="true" />}
              {word}
            </button>
          )
        })}
      </div>
      <p className="bstep__said" role="status">
        {value.length > 0 ? voiceSentence(value) : 'None chosen yet.'}
        {full ? ' That is the most you can pick. Press one to swap it.' : ''}
      </p>
    </section>
  )
}
