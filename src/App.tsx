import { Navigate, Route, Routes } from 'react-router-dom'
import MobileNotice from './components/MobileNotice.tsx'
import RequireAuth from './components/RequireAuth.tsx'
import Account from './pages/Account.tsx'
import HomeRoute from './pages/HomeRoute.tsx'
import SignIn from './pages/SignIn.tsx'
import Welcome from './pages/Welcome.tsx'

export default function App() {
  return (
    <>
    {/* On a phone, a note that Droplet is built for desktop for now, over whichever screen is open. */}
    <MobileNotice />
    <Routes>
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
      {/* There is no landing page: the root and any unknown address go to Home, which sends anyone not signed in to sign in. */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
    </>
  )
}
