import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FolderTree, Search, Copy, ListChecks, MessageCircle, BarChart3,
  ChevronsLeft, ChevronsRight, Sparkles,
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/explorer', label: 'File Explorer', icon: FolderTree },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/duplicates', label: 'Duplicates & Redundancy', icon: Copy },
  { to: '/review', label: 'Review Queue', icon: ListChecks, badgeKey: 'pendingReview' },
  { to: '/assistant', label: 'Assistant', icon: MessageCircle },
  { to: '/reports', label: 'Reports & Trends', icon: BarChart3 },
]

export default function Sidebar({ collapsed, setCollapsed, pendingCount }) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-navy-900 transition-all duration-200 ${
        collapsed ? 'w-[72px]' : 'w-64'
      } hidden md:flex`}
    >
      <div className="flex h-16 items-center gap-2 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Sparkles className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Tidy</p>
            <p className="text-[11px] text-slate-400">File Cleanup</p>
          </div>
        )}
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, badgeKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `focus-ring group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{label}</span>}
            {!collapsed && badgeKey === 'pendingReview' && pendingCount > 0 && (
              <span className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(c => !c)}
        className="focus-ring m-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
      </button>
    </aside>
  )
}
