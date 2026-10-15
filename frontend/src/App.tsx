import { Route, Routes } from 'react-router'
import { RequireAuth } from '@/lib/auth'
import Login from '@/pages/Login'

function Placeholder() {
  return <div className="p-10 text-ink-muted">Startseite folgt.</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<RequireAuth><Placeholder /></RequireAuth>} />
    </Routes>
  )
}
