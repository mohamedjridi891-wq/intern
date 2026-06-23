import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import MobileNav from './components/MobileNav'
import Overview from './pages/Overview'
import FileExplorer from './pages/FileExplorer'
import Search from './pages/Search'
import Duplicates from './pages/Duplicates'
import ReviewQueue from './pages/ReviewQueue'
import Assistant from './pages/Assistant'
import Reports from './pages/Reports'
import { fetchReviewQueue } from './lib/api'

export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    async function loadPending() {
      try {
        const queue = await fetchReviewQueue(500)
        setPendingCount(queue?.length ?? 0)
      } catch (err) {
        console.error('Failed to load pending review count:', err)
      }
    }
    loadPending()
  }, [])

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} pendingCount={pendingCount} />
      <div className={`transition-all duration-200 ${collapsed ? 'md:pl-[72px]' : 'md:pl-64'}`}>
        <Topbar dark={dark} setDark={setDark} collapsed={collapsed} pendingCount={pendingCount} />
        <main className="px-4 py-6 pb-20 md:px-6 md:pb-6">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/explorer" element={<FileExplorer />} />
            <Route path="/search" element={<Search />} />
            <Route path="/duplicates" element={<Duplicates />} />
            <Route path="/review" element={<ReviewQueue />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/reports" element={<Reports />} />
          </Routes>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
