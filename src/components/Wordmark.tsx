import { Link } from 'react-router-dom'
import wordmarkOnLight from '../assets/brand/wordmark-dark.svg'
import wordmarkOnDark from '../assets/brand/wordmark-light.svg'
import './Wordmark.css'

// Both artworks are rendered and CSS shows the one for the active theme.
// "Dark" artwork is black (for light surfaces); "light" artwork is white (for dark surfaces).
// With `link` off it is only the lettering, for a screen that must not lead anywhere else (the introduction).
export default function Wordmark({ link = true }: { link?: boolean }) {
  const lettering = (
    <>
      <img className="wordmark__img wordmark__img--on-light" src={wordmarkOnLight} alt="" />
      <img className="wordmark__img wordmark__img--on-dark" src={wordmarkOnDark} alt="" />
    </>
  )
  if (!link) {
    return (
      <span className="wordmark" role="img" aria-label="Droplet">
        {lettering}
      </span>
    )
  }
  return (
    <Link className="wordmark" to="/home" aria-label="Droplet home">
      {lettering}
    </Link>
  )
}
