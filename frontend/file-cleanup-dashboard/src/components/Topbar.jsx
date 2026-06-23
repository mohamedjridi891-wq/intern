import { Search, Bell, Moon, Sun, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Topbar({ dark, setDark, collapsed, pendingCount = 0 }) {
  const navigate = useNavigate()

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
        <button
          onClick={() => navigate('/review')}
          className="focus-ring relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label={pendingCount > 0 ? `${pendingCount} files pending review` : 'No files pending review'}
          title={pendingCount > 0 ? `${pendingCount} file(s) pending review` : 'No files pending review'}
        >
          <Bell className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-navy-950">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setDark(d => !d)}
          className="focus-ring rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>
    </header>
  )
}
