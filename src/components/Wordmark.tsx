import { Link } from 'react-router-dom'
import wordmarkOnLight from '../assets/brand/wordmark-dark.svg'
import wordmarkOnDark from '../assets/brand/wordmark-light.svg'
import './Wordmark.css'

// Both artworks are rendered and CSS shows the one for the active theme.
// "Dark" artwork is black (for light surfaces); "light" artwork is white (for dark surfaces).
export default function Wordmark() {
  return (
    <Link className="wordmark" to="/home" aria-label="Droplet home">
      <img className="wordmark__img wordmark__img--on-light" src={wordmarkOnLight} alt="" />
      <img className="wordmark__img wordmark__img--on-dark" src={wordmarkOnDark} alt="" />
    </Link>
  )
}
