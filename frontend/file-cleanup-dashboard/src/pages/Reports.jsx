import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { SectionCard } from '../components/Shared'
import { fetchFiles, fetchReviewQueue } from '../lib/api'
import { formatDate } from '../lib/format'

const RANGES = ['7 days', '14 days', '30 days', '90 days']

export default function Reports() {
  const [range, setRange] = useState('14 days')
  const [files, setFiles] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [filesData, reviewData] = await Promise.all([
          fetchFiles(1000),
          fetchReviewQueue(200),
        ])
        setFiles(filesData || [])
        setReviewQueue(reviewData || [])
      } catch (err) {
        console.error('Failed to load reports data:', err)
        setFiles([])
        setReviewQueue([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statusCounts = useMemo(() => {
    const labels = ['KEEP', 'ARCHIVE', 'REVIEW', 'DELETE_CANDIDATE']
    return labels.map(label => ({
      label,
      value: files.filter(f => f.label === label).length,
    }))
  }, [files])

  const scoreHistogram = useMemo(() => {
    const buckets = [0, 20, 50, 80, 100]
    return buckets.slice(0, -1).map((min, index) => {
      const max = buckets[index + 1]
      const count = files.filter(f => {
        const score = Number(f.importance_score) || 0
        return score >= min && score < max
      }).length
      return { bucket: `${min}–${max}`, count }
    })
  }, [files])

  const recentReviewItems = reviewQueue.slice(0, 5)

  const storageUsedGb = useMemo(() => {
    const totalSizeMb = files.reduce((sum, f) => sum + (f.size_bytes || 0), 0) / (1024 * 1024)
    return Math.round((totalSizeMb / 1024) * 10) / 10
  }, [files])

  const reclaimableGb = useMemo(() => {
    const reclaimBytes = reviewQueue.reduce((sum, f) => sum + (f.size_bytes || 0), 0)
    return Math.round((reclaimBytes / (1024 ** 3)) * 10) / 10
  }, [reviewQueue])

  const storageTrend = useMemo(() => {
    const steps = 7
    const base = storageUsedGb
    return Array.from({ length: steps }, (_, i) => ({
      day: `Day ${i + 1}`,
      reclaimedGb: Math.round((reclaimableGb / steps) * (i + 1) * 10) / 10,
    }))
  }, [reclaimableGb, storageUsedGb])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Reports &amp; Trends</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A look back at what's changed and what's been cleaned up.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${range === r ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <button className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <FileText className="h-4 w-4" /> PDF
          </button>
          <button className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <FileSpreadsheet className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Label distribution">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusCounts} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Importance score distribution">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreHistogram} margin={{ left: -20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Pending review snapshot"
        action={
          <button className="focus-ring inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        }
      >
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading review data…</div>
        ) : recentReviewItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No items currently pending review.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400 dark:border-slate-800">
                <th className="py-2">File</th>
                <th className="py-2">Status</th>
                <th className="py-2">Size</th>
                <th className="py-2">Modified</th>
              </tr>
            </thead>
            <tbody>
              {recentReviewItems.map(item => (
                <tr key={item.file_id} className="border-b border-slate-50 dark:border-slate-800/60">
                  <td className="py-2.5 font-medium text-slate-700 dark:text-slate-200">{item.name}</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">{item.label}</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">{(item.size_bytes || 0) / (1024 * 1024) > 1 ? `${((item.size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB` : `${item.size_bytes || 0} B`}</td>
                  <td className="py-2.5 text-slate-500 dark:text-slate-400">{formatDate(item.modified_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  )
}
