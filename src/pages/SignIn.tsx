import { useEffect, useId, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { DangerCircleIcon, InfoCircleIcon } from '@solar-icons/react/linear'
import { MIN_PASSWORD } from '../lib/auth.ts'
import { useAuth } from '../store/auth.ts'
import Wordmark from '../components/Wordmark.tsx'
import './SignIn.css'

type Mode = 'sign-in' | 'sign-up'

// Signing in and making an account, on one standard screen on purpose: email and password, or Google. Nothing here is clever. A person who
// is already signed in is sent on to the app.
export default function SignIn() {
  const status = useAuth((state) => state.status)
  const start = useAuth((state) => state.start)
  // The session is looked for here too, since this is where a founder can arrive straight from Google or from the link in an email.
  useEffect(() => start(), [start])
  const { busy, error, notice, signIn, signUp, signInWithGoogle, clearMessages } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const ids = { name: useId(), email: useId(), password: useId(), note: useId() }

  if (status === 'signedIn') return <Navigate to="/home" replace />

  const choose = (next: Mode) => {
    setMode(next)
    clearMessages()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (mode === 'sign-up') void signUp({ name, email, password })
    else void signIn({ email, password })
  }

  const making = mode === 'sign-up'

  return (
    <main className="signin">
      <div className="signin__card glass glass--strong">
        <div className="signin__brand">
          <Wordmark />
        </div>
        <h1 className="signin__title">{making ? 'Make your account' : 'Welcome back'}</h1>
        <p className="signin__lead">{making ? 'Your projects and what you decide are kept in your account, and only you can see them.' : 'Sign in to pick up where you left off.'}</p>

        <div className="signin__modes" role="group" aria-label="Sign in or make an account">
          <button type="button" aria-pressed={!making} onClick={() => choose('sign-in')}>
            Sign in
          </button>
          <button type="button" aria-pressed={making} onClick={() => choose('sign-up')}>
            Make an account
          </button>
        </div>

        <form className="signin__form" onSubmit={submit} noValidate>
          {making && (
            <div className="signin__field">
              <label htmlFor={ids.name}>What should we call you?</label>
              <input id={ids.name} type="text" autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          )}
          <div className="signin__field">
            <label htmlFor={ids.email}>Email</label>
            <input id={ids.email} type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="signin__field">
            <label htmlFor={ids.password}>Password</label>
            <input
              id={ids.password}
              type="password"
              autoComplete={making ? 'new-password' : 'current-password'}
              aria-describedby={making ? ids.note : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {making && (
              <span className="signin__hint" id={ids.note}>
                At least {MIN_PASSWORD} characters.
              </span>
            )}
          </div>

          <p className="signin__message" role="alert" data-kind="error" hidden={error === ''}>
            <DangerCircleIcon className="signin__message-icon" size={18} aria-hidden="true" />
            <span>{error}</span>
          </p>
          <p className="signin__message" role="status" data-kind="notice" hidden={notice === ''}>
            <InfoCircleIcon className="signin__message-icon" size={18} aria-hidden="true" />
            <span>{notice}</span>
          </p>

          <button type="submit" className="signin__primary" disabled={busy} aria-busy={busy}>
            {busy ? 'One moment' : making ? 'Make my account' : 'Sign in to Droplet'}
          </button>
        </form>

        <div className="signin__or" aria-hidden="true">
          <span>or</span>
        </div>

        <button type="button" className="signin__google" disabled={busy} onClick={() => void signInWithGoogle()}>
          Continue with Google
        </button>
      </div>
    </main>
  )
}
