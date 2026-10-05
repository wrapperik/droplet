import { useCallback, useRef, useState } from 'react'
import type { Grounding } from '../compose/grounding.ts'
import './WebSources.css'

// What a reply that searched the web drew on: the pages, and Google's search suggestions.
//
// Google's terms require the suggestions to be shown exactly as given, as wide as the answer, whenever the answer is shown. They come as
// HTML and CSS, so they are drawn in a sandboxed frame that may not run scripts: nothing in them can touch the app. The frame is same-origin
// only so its height can be read; with scripts off that gives it no power. Links open in a new tab (the base target), since Google cannot
// be shown inside a frame. The pages are listed by the titles Google gives, as plain links, never as markup.
export default function WebSources({ grounding }: { grounding: Grounding }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(0)
  const measure = useCallback(() => {
    const document = frame.current?.contentDocument
    if (document) setHeight(Math.ceil(document.documentElement.scrollHeight))
  }, [])

  return (
    <div className="websources">
      {grounding.sources.length > 0 && (
        <div className="websources__sources">
          <p className="websources__label">Sources from Google Search</p>
          <ul>
            {grounding.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {grounding.suggestions && (
        <iframe
          ref={frame}
          className="websources__suggestions"
          title="Google Search suggestions"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;background:transparent}</style></head><body>${grounding.suggestions}</body></html>`}
          onLoad={measure}
          style={{ height: height > 0 ? `${height}px` : undefined }}
        />
      )}
    </div>
  )
}
