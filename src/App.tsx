import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.tsx'
import Account from './pages/Account.tsx'
import HomeRoute from './pages/HomeRoute.tsx'
import Landing from './pages/Landing.tsx'
import SignIn from './pages/SignIn.tsx'
import Welcome from './pages/Welcome.tsx'

export default function App() {
  return (
    <Routes>
      {/* The landing page is open to everyone. A founder who is already signed in goes on to Home. */}
      <Route path="/" element={<Landing />} />
      <Route path="/sign-in" element={<SignIn />} />
      {/* The introduction: once after making an account (Home sends a founder here until they have been through it). */}
      <Route
        path="/welcome"
        element={
          <RequireAuth>
            <Welcome />
          </RequireAuth>
        }
      />
      <Route
        path="/account"
        element={
          <RequireAuth>
            <Account />
          </RequireAuth>
        }
      />
      <Route
        path="/home"
        element={
          <RequireAuth>
            <HomeRoute />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
