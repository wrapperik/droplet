import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      {/* The landing page is not built yet, so the root goes to Home for now. */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
