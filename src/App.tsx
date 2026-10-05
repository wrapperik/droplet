import { Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.tsx'
import Account from './pages/Account.tsx'
import HomeRoute from './pages/HomeRoute.tsx'
import SignIn from './pages/SignIn.tsx'
import Welcome from './pages/Welcome.tsx'

export default function App() {
  return (
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
      {/* The landing page is not built yet, so the root goes to Home for now (and Home sends anyone not signed in to sign in). */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
