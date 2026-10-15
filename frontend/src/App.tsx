import { Route, Routes } from 'react-router'
import { RequireAuth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import Login from '@/pages/Login'
import PageView from '@/pages/Page'
import Revisions from '@/pages/Revisions'
import NotFoundPage from '@/pages/NotFound'

function Placeholder() {
  return <div className="p-10 text-ink-muted">Folgt.</div>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/p/:pageId" element={<PageView />} />
        <Route path="/p/:pageId/history" element={<Revisions />} />
        <Route path="/" element={<Placeholder />} />
        <Route path="/s/*" element={<Placeholder />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
