import { useCallback, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AltArrowLeftIcon, DangerCircleIcon, InfoCircleIcon, Logout2Icon, RestartIcon, TrashBinMinimalisticIcon } from '@solar-icons/react/linear'
import { authBackend, useAuth } from '../store/auth.ts'
import './Account.css'

// The word to type on this device alone, where there is no email address to type.
export const DELETE_WORD = 'DELETE'

// Who is signed in, where their work is kept, the introduction again, signing out, and deleting the account with everything in it. Standard on
// purpose, like sign-in: nothing here is clever. Deleting is always visible and complete (manifesto principle 6): one visible action, an
// honest list of what goes, and a typed confirmation, since it cannot be undone.
export default function Account() {
  const user = useAuth((state) => state.user)
  const signOut = useAuth((state) => state.signOut)
  const deleteAccount = useAuth((state) => state.deleteAccount)
  const busy = useAuth((state) => state.busy)
  const error = useAuth((state) => state.error)
  const clearMessages = useAuth((state) => state.clearMessages)
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  // On this device alone there is no sign-in screen to say it was done, so it is said here.
  const [clearedHere, setClearedHere] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const ids = { panel: useId(), input: useId(), list: useId() }

  const leave = useCallback(async () => {
    await signOut()
    navigate('/sign-in', { replace: true })
  }, [navigate, signOut])

  const open = () => {
    if (confirming) return
    clearMessages()
    setClearedHere(false)
    setTyped('')
    setConfirming(true)
  }

  const cancel = () => {
    if (busy) return
    clearMessages()
    setConfirming(false)
    setTyped('')
    // The panel that had focus is going, so focus goes back to the button that opened it.
    openRef.current?.focus()
  }

  if (!user) return null
  // On this device alone there is no account: what is kept is kept in this browser, and there is no one to sign out.
  const onDevice = authBackend().kind === 'local'
  // A guest has no email address, so there is none to type, and no way back in once they sign out.
  const guest = !onDevice && user.email === ''
  const typeWord = onDevice || guest
  const phrase = typeWord ? DELETE_WORD : user.email
  const matches = typed.trim().toLowerCase() === phrase.toLowerCase() && phrase !== ''

  const confirmDelete = async () => {
    if (busy || !matches) return
    const done = await deleteAccount()
    if (!done) return
    if (onDevice) {
      setConfirming(false)
      setTyped('')
      setClearedHere(true)
      openRef.current?.focus()
    } else {
      // The sign-in screen says that it is done.
      navigate('/sign-in', { replace: true })
    }
  }

  return (
    <div className="account-shell">
      <main className="account-page">
        <div className="account-page__inner">
          <Link className="account-page__back" to="/home">
            <AltArrowLeftIcon size={16} aria-hidden="true" />
            Back to Droplet
          </Link>

          <h1 className="account-page__title">Account</h1>

          <section className="account-card account-card--profile" aria-label="Profile">
            <span className="account-card__avatar" aria-hidden="true">
              {user.name.charAt(0)}
            </span>
            <div className="account-card__who">
              <p className="account-card__name">{user.name}</p>
              <p className="account-card__detail">{onDevice ? 'This device only' : guest ? 'Guest account for this visit' : user.email}</p>
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
                <RestartIcon size={16} aria-hidden="true" />
                Restart introduction
              </button>
            </section>
          </div>

          {!onDevice && (
            <div className="account-card account-card--group">
              <section className="account-row" aria-labelledby="account-out">
                <div className="account-row__text">
                  <h2 id="account-out">Sign out</h2>
                  <p>{guest ? 'A guest account cannot be signed back in to. Export what you want to keep first.' : 'You can sign back in with the same email at any time.'}</p>
                </div>
                <button type="button" className="account-row__button" onClick={() => void leave()}>
                  <Logout2Icon size={16} aria-hidden="true" />
                  Sign out
                </button>
              </section>
            </div>
          )}

          <div className="account-card account-card--group account-card--danger">
            <section className="account-row" aria-labelledby="account-delete">
              <div className="account-row__text">
                <h2 id="account-delete">{onDevice ? 'Delete everything on this device' : 'Delete account and data'}</h2>
                <p>
                  {onDevice
                    ? 'Remove every project and everything saved in this browser. This cannot be undone.'
                    : 'Remove your account and everything in it, for good. This cannot be undone.'}
                </p>
              </div>
              <button
                ref={openRef}
                type="button"
                className="account-row__button account-row__button--danger"
                aria-expanded={confirming}
                aria-controls={ids.panel}
                onClick={open}
              >
                <TrashBinMinimalisticIcon size={16} aria-hidden="true" />
                {onDevice ? 'Delete everything on this device' : 'Delete account and data'}
              </button>
            </section>

            <p className="account-delete__done" role="status" hidden={!clearedHere}>
              <InfoCircleIcon size={18} aria-hidden="true" />
              <span>Everything saved on this device has been deleted.</span>
            </p>

            {confirming && (
              <form
                id={ids.panel}
                className="account-delete"
                aria-labelledby="account-delete-title"
                onSubmit={(event) => {
                  event.preventDefault()
                  void confirmDelete()
                }}
              >
                <h3 id="account-delete-title">This will delete, for good:</h3>
                <ul id={ids.list}>
                  {onDevice ? (
                    <>
                      <li>Every project in this browser</li>
                      <li>Every palette, board, invoice, client and chat saved in them</li>
                      <li>Droplet&rsquo;s notes on your projects</li>
                    </>
                  ) : (
                    <>
                      <li>Every project, and every palette, board, invoice, client and chat saved in them</li>
                      <li>Droplet&rsquo;s notes on your projects</li>
                      <li>The log of your requests to the AI (never your words, only how each went)</li>
                      <li>Your account, so you will not be able to sign in again with it</li>
                    </>
                  )}
                </ul>
                <p className="account-delete__warning">There is no way to get any of it back. Export what you want to keep first.</p>

                <div className="account-delete__field">
                  <label htmlFor={ids.input}>
                    {typeWord ? (
                      <>
                        Type <strong>{DELETE_WORD}</strong> to confirm
                      </>
                    ) : (
                      <>
                        Type your email address, <strong>{user.email}</strong>, to confirm
                      </>
                    )}
                  </label>
                  <input
                    id={ids.input}
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoFocus
                    aria-describedby={ids.list}
                    value={typed}
                    readOnly={busy}
                    onChange={(event) => setTyped(event.target.value)}
                  />
                </div>

                <p className="account-delete__error" role="alert" hidden={error === ''}>
                  <DangerCircleIcon size={18} aria-hidden="true" />
                  <span>{error}</span>
                </p>

                <div className="account-delete__actions">
                  <button type="button" className="account-row__button" onClick={cancel} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="account-row__button account-row__button--danger-solid" disabled={!matches || busy} aria-busy={busy}>
                    {busy ? 'Deleting' : 'Delete everything'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
