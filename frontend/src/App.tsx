import { Route, Routes } from 'react-router'
import { RequireAuth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import Login from '@/pages/Login'

function Placeholder() {
  return <div className="p-10 text-ink-muted">Folgt.</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="*" element={<Placeholder />} />
      </Route>
    </Routes>
  )
}
