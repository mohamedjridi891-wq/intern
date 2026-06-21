import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FolderTree, Search, ListChecks, MessageCircle } from 'lucide-react'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/explorer', label: 'Files', icon: FolderTree },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/review', label: 'Review', icon: ListChecks },
  { to: '/assistant', label: 'Assistant', icon: MessageCircle },
]

export default function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-slate-800 dark:bg-navy-900/95">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
