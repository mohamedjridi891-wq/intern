import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { SectionCard, EmptyState } from '../components/Shared'
import { fetchFiles, fetchReviewQueue, exportToCsv } from '../lib/api'
import { formatDate } from '../lib/format'

export default function Reports() {
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
  const hasData = !loading && files.length > 0

  function handleExportFilesCsv() {
    exportToCsv('files_report.csv', files, [
      { key: 'name', label: 'Name' },
      { key: 'path', label: 'Path' },
      { key: 'category', label: 'Type' },
      { key: 'label', label: 'Status' },
      { key: 'importance_score', label: 'Importance score' },
      { value: (f) => Math.round(((f.size_bytes || 0) / (1024 * 1024)) * 10) / 10, label: 'Size (MB)' },
      { key: 'modified_time', label: 'Modified' },
    ])
  }

  function handleExportReviewCsv() {
    exportToCsv('review_queue.csv', reviewQueue, [
      { key: 'name', label: 'Name' },
      { key: 'path', label: 'Path' },
      { key: 'label', label: 'Status' },
      { value: (f) => Math.round(((f.size_bytes || 0) / (1024 * 1024)) * 10) / 10, label: 'Size (MB)' },
      { key: 'modified_time', label: 'Modified' },
    ])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Reports &amp; Trends</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A snapshot of your most recent scan.</p>
        </div>
        <button
          onClick={handleExportFilesCsv}
          disabled={!hasData}
          className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <FileSpreadsheet className="h-4 w-4" /> Export all files (CSV)
        </button>
      </div>

      {!hasData ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No scan data yet"
          description="Scan a folder from the Overview page first — these charts are generated live from your actual files."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Label distribution">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusCounts} margin={{ left: -20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
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
                    <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} />
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
              <button
                onClick={handleExportReviewCsv}
                disabled={recentReviewItems.length === 0}
                className="focus-ring inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" /> Export
              </button>
            }
          >
            {recentReviewItems.length === 0 ? (
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
        </>
      )}
    </div>
  )
}
