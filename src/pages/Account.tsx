import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AltArrowLeftIcon, Logout2Icon, RestartIcon } from '@solar-icons/react/linear'
import { authBackend, useAuth } from '../store/auth.ts'
import './Account.css'

// Who is signed in, where their work is kept, the introduction again, and signing out. Standard on purpose, like sign-in: nothing here is
// clever. Deleting the account and its data is not built yet (it needs a server function), so there is no button for it.
export default function Account() {
  const user = useAuth((state) => state.user)
  const signOut = useAuth((state) => state.signOut)
  const navigate = useNavigate()

  const leave = useCallback(async () => {
    await signOut()
    navigate('/sign-in', { replace: true })
  }, [navigate, signOut])

  if (!user) return null
  // On this device alone there is no account: what is kept is kept in this browser, and there is no one to sign out.
  const onDevice = authBackend().kind === 'local'

  return (
    <main className="account-page">
      <Link className="account-page__back" to="/home">
        <AltArrowLeftIcon size={18} aria-hidden="true" />
        Back to Droplet
      </Link>

      <h1 className="account-page__title">Account</h1>

      <section className="account-card account-card--profile" aria-label="Profile">
        <span className="account-card__avatar" aria-hidden="true">
          {user.name.charAt(0)}
        </span>
        <div className="account-card__who">
          <p className="account-card__name">{user.name}</p>
          <p className="account-card__detail">{onDevice ? 'This device only' : user.email}</p>
        </div>
      </section>

      <div className="account-card account-card--group">
        <section className="account-row" aria-labelledby="account-kept">
          <div className="account-row__text">
            <h2 id="account-kept">Where your work is kept</h2>
            <p>
              {onDevice
                ? 'In this browser, on this device. Nothing is sent to an account.'
                : 'In your Droplet account. Only you can see your projects, and nothing is remembered until you confirm it.'}
            </p>
          </div>
        </section>

        <section className="account-row" aria-labelledby="account-intro">
          <div className="account-row__text">
            <h2 id="account-intro">Introduction</h2>
            <p>Go through what Droplet is and how it works again.</p>
          </div>
          <button type="button" className="account-row__button" onClick={() => navigate('/welcome')}>
            <RestartIcon size={18} aria-hidden="true" />
            Restart introduction
          </button>
        </section>
      </div>

      {!onDevice && (
        <div className="account-card account-card--group">
          <section className="account-row" aria-labelledby="account-out">
            <div className="account-row__text">
              <h2 id="account-out">Sign out</h2>
              <p>You can sign back in with the same email at any time.</p>
            </div>
            <button type="button" className="account-row__button" onClick={() => void leave()}>
              <Logout2Icon size={18} aria-hidden="true" />
              Sign out
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
