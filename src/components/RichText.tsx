import { Fragment, useMemo } from 'react'
import { parseInline, parseRichText, type Inline } from '../lib/richText.ts'
import './RichText.css'

const renderInline = (content: Inline[]) =>
  content.map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <Fragment key={index}>{part.text}</Fragment>))

// One line of Droplet's words, with its **bold** runs, for the places that are not paragraphs: a table cell, the label of a step.
export function InlineText({ text }: { text: string }) {
  return <>{renderInline(parseInline(text))}</>
}

// Droplet's words laid out: paragraphs, lists and bold, read from the small subset of Markdown the composer writes (see richText.ts).
// It builds elements itself and never sets HTML, so nothing in a message can add markup.
export default function RichText({ source }: { source: string }) {
  const blocks = useMemo(() => parseRichText(source), [source])
  return (
    <div className="rich">
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') return <p key={index}>{renderInline(block.content)}</p>
        if (block.type === 'bullets') {
          return (
            <ul key={index}>
              {block.items.map((item, at) => (
                <li key={at}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }
        // The number is drawn by the stylesheet from a counter, so a list that carries on (4, 5, 6) keeps its numbers.
        return (
          <ol key={index} style={{ counterReset: `rich-step ${block.start - 1}` }}>
            {block.items.map((item, at) => (
              <li key={at}>{renderInline(item)}</li>
            ))}
          </ol>
        )
      })}
    </div>
  )
}
