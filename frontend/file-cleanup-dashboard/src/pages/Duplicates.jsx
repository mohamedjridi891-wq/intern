import { useEffect, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { EmptyState, SectionCard } from '../components/Shared'
import { formatSize } from '../lib/format'
import { fetchDuplicates } from '../lib/api'

export default function Duplicates() {
  const [duplicates, setDuplicates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDuplicates()
  }, [])

  async function loadDuplicates() {
    setLoading(true)
    try {
      const data = await fetchDuplicates(200)
      setDuplicates(data || [])
    } catch (err) {
      console.error('Failed to load duplicates:', err)
      setDuplicates([])
    } finally {
      setLoading(false)
    }
  }

  const duplicateCount = duplicates.length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Duplicates &amp; Redundancy</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {duplicateCount} duplicate pairs found in the latest scan
          </p>
        </div>
        <button
          onClick={loadDuplicates}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <RefreshCw className="h-4 w-4" /> Refresh duplicates
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-navy-900 dark:text-slate-300">
          Loading duplicate analysis...
        </div>
      ) : duplicateCount === 0 ? (
        <EmptyState icon={Copy} title="No duplicates found" description="We didn't find any duplicate or near-duplicate file pairs in your last scan." />
      ) : (
        <div className="space-y-3">
          {duplicates.map((item, index) => (
            <SectionCard key={`${item.path_1}-${item.path_2}-${index}`}>
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.path_1}</p>
                  <p className="mt-1 text-xs text-slate-400">{item.path_2}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">{Math.round((item.avg_similarity || 0) * 100)}%</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Similarity</p>
                </div>
              </div>
              {item.action && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Recommended action: {item.action}</p>
              )}
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  )
}
