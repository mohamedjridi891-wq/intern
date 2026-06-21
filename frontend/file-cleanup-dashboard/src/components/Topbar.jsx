import { useState } from 'react'
import { Search, Bell, Moon, Sun, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Topbar({ dark, setDark, collapsed }) {
  const [notifOpen, setNotifOpen] = useState(false)
  const navigate = useNavigate()

  const notifications = [
    { id: 1, text: 'Scan complete — 4,512 files analyzed', time: '2m ago' },
    { id: 2, text: '18 items need review', time: '1h ago' },
    { id: 3, text: '3 new duplicate clusters found', time: 'Yesterday' },
  ]

  return (
    <header
      className={`sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur transition-all md:px-6 dark:border-slate-800 dark:bg-navy-950/90 ${
        collapsed ? 'md:pl-[88px]' : 'md:pl-[280px]'
      }`}
    >
      <div className="flex items-center gap-2 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Tidy</span>
      </div>

      <button
        onClick={() => navigate('/search')}
        className="focus-ring ml-auto flex w-full max-w-sm items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 hover:border-slate-300 md:ml-0 dark:border-slate-700 dark:bg-navy-900 dark:text-slate-500"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Ask anything about your files…</span>
        <span className="sm:hidden">Search…</span>
        <kbd className="ml-auto hidden rounded border border-slate-300 bg-white px-1.5 text-[11px] text-slate-400 sm:inline dark:border-slate-600 dark:bg-navy-800">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5 md:ml-3">
        <div className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="focus-ring relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white dark:ring-navy-950" />
          </button>
          {notifOpen && (
            <div className="animate-fadein absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-card dark:border-slate-700 dark:bg-navy-900">
              <p className="px-2 py-1 text-xs font-semibold text-slate-400">Notifications</p>
              {notifications.map(n => (
                <div key={n.id} className="rounded-xl px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                  <p className="text-slate-700 dark:text-slate-200">{n.text}</p>
                  <p className="text-xs text-slate-400">{n.time}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setDark(d => !d)}
          className="focus-ring rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
          Y
        </div>
      </div>
    </header>
  )
}
