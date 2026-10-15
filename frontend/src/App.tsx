import { Route, Routes } from 'react-router'
import { RequireAuth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import SpacePage from '@/pages/Space'
import NewPage from '@/pages/NewPage'
import NewSpace from '@/pages/NewSpace'
import Trash from '@/pages/Trash'
import PageView from '@/pages/Page'
import Revisions from '@/pages/Revisions'
import Search from '@/pages/Search'
import NotFoundPage from '@/pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/spaces/new" element={<NewSpace />} />
        <Route path="/s/:slug" element={<SpacePage />} />
        <Route path="/s/:slug/new" element={<NewPage />} />
        <Route path="/s/:slug/trash" element={<Trash />} />
        <Route path="/p/:pageId" element={<PageView />} />
        <Route path="/p/:pageId/history" element={<Revisions />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
