import { Link } from 'react-router-dom'
import './Wordmark.css'

export default function Wordmark() {
  return (
    <Link className="wordmark" to="/home" aria-label="Droplet home">
      droplet
    </Link>
  )
}
