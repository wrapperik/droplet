import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../store/auth.ts'

// Keeps the app to someone who is signed in. Looks for the session once, shows nothing while it does (so a signed-in founder does not see the
// sign-in screen flash by), and sends everyone else to sign in. On this device alone, with no Supabase, everyone is signed in.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth((state) => state.status)
  const start = useAuth((state) => state.start)
  useEffect(() => start(), [start])

  if (status === 'loading') return <div className="auth-loading" role="status" aria-label="Signing you in" />
  if (status === 'signedOut') return <Navigate to="/sign-in" replace />
  return <>{children}</>
}
