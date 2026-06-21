import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', tone = 'danger' }) {
  if (!open) return null
  const toneClass = tone === 'danger'
    ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500'
    : 'bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 animate-fadein" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card dark:bg-navy-900"
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone === 'danger' ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="focus-ring rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm?.(); onClose() }}
            className={`focus-ring rounded-xl px-4 py-2 text-sm font-medium text-white ${toneClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
