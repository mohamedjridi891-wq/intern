import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  HardDrive, Files, Trash2, ListChecks, Copy, Clock, ArrowRight, RefreshCw, Folder,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { KpiCard, SectionCard, EmptyState } from '../components/Shared'
import StatusBadge from '../components/StatusBadge'
import WhyExplain from '../components/WhyExplain'
import { formatSize, timeAgo } from '../lib/format'
import { useFolderContext } from '../components/FolderContext.jsx'
import {
  fetchFiles, fetchReviewQueue, fetchDuplicates, uploadFolder,
  computeKPIs, computeStatusBreakdown, getBiggestWasters,
  STATUS_META,
} from '../lib/api'

export default function Overview() {
  const { selectedFolder, setSelectedFolder } = useFolderContext()
  const [scanning, setScanning] = useState(false)
  const [scanStatus, setScanStatus] = useState('')
  const [selectedFiles, setSelectedFiles] = useState([])
  const folderInputRef = useRef(null)

  // Real data from backend
  const [files, setFiles] = useState([])
  const [reviewQueue, setReviewQueue] = useState([])
  const [duplicates, setDuplicates] = useState([])
  const [loaded, setLoaded] = useState(false)

  // Load data after component mounts or after scan
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [filesData, reviewData, duplicatesData] = await Promise.all([
        fetchFiles(5000),
        fetchReviewQueue(500),
        fetchDuplicates(500),
      ])
      setFiles(filesData || [])
      setReviewQueue(reviewData || [])
      setDuplicates(duplicatesData || [])
      setLoaded(true)
    } catch (err) {
      console.error('Failed to load data:', err)
      setLoaded(true)
    }
  }

  async function handleFolderSelected(event) {
    const filesList = event.target.files
    if (!filesList || filesList.length === 0) return

    const filesArray = Array.from(filesList)
    setSelectedFiles(filesArray)

    let folderPath = filesArray[0].webkitRelativePath || filesArray[0].name
    if (folderPath) {
      const pathParts = folderPath.split(/[\\/]/)
      folderPath = pathParts.slice(0, -1).join('\\')
      setSelectedFolder(folderPath || filesArray[0].name)
      setScanStatus(`Selected: ${folderPath || filesArray[0].name} (${filesArray.length} files)`)
    }
  }

  async function handleScan(event) {
    event.preventDefault()
    if (!selectedFiles.length) {
      setScanStatus('Please select a folder before scanning.')
      return
    }

    setScanning(true)
    setScanStatus('Uploading folder and starting scan...')

    try {
      const data = await uploadFolder(selectedFiles)

      if (data.skipped_pipeline) {
        setScanStatus(
          `⚠ Files uploaded to ${data.root_folder} but the pipeline was skipped. ` +
          `Run the pipeline manually (python run_pipeline.py) to index the new files.`
        )
        setSelectedFiles([])
        setSelectedFolder('')
        // Do NOT call loadData() — the DB hasn't changed, showing stale data with no warning is misleading
        return
      }

      setScanStatus(`✓ Scan complete on ${data.root_folder}`)
      setSelectedFiles([])
      setSelectedFolder('')
      await new Promise(resolve => setTimeout(resolve, 1000))
      await loadData()
    } catch (error) {
      setScanStatus(`✗ Scan failed: ${error.message}`)
    } finally {
      setScanning(false)
    }
  }

  // Compute derived data from real backend data only — no fabricated values.
  const kpis = loaded
    ? computeKPIs(files, reviewQueue, duplicates)
    : {
      totalFiles: 0,
      storageUsedGb: 0,
      storageReclaimableGb: 0,
      pendingReview: 0,
      duplicatesFound: 0,
      lastScan: null,
    }

  const statusBreakdown = loaded
    ? computeStatusBreakdown(reviewQueue)
    : []

  const biggestWasters = loaded
    ? getBiggestWasters(files, 5)
    : []

  const reviewItems = reviewQueue.slice(0, 5)
  const hasAnyData = loaded && files.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Overview</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Last scan {timeAgo(kpis.lastScan)} · everything below is a recommendation — nothing is changed without you.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={scanning}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Refresh data'}
        </button>
      </div>

      {/* Folder selector card */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-navy-950/40">
        <div className="mb-4">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Select a folder to analyze</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Click the button below to choose a folder from your computer.
          </p>
        </div>

        {/* Native file picker input (hidden) */}
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory="true"
          mozdirectory="true"
          onChange={handleFolderSelected}
          className="hidden"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <button
            onClick={() => folderInputRef.current?.click()}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Folder className="h-4 w-4" />
            Choose Folder
          </button>

          <button
            onClick={handleScan}
            disabled={scanning || !selectedFolder}
            className="focus-ring inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {scanning ? 'Scanning…' : 'Scan folder'}
          </button>
        </div>

        {selectedFolder && (
          <div className="mt-3 rounded bg-blue-50 p-3 dark:bg-blue-900/20">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
              📁 {selectedFolder}
            </p>
          </div>
        )}

        {scanStatus && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{scanStatus}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={Files} label="Files scanned" value={kpis.totalFiles.toLocaleString()} />
        <KpiCard icon={HardDrive} label="Storage used" value={`${kpis.storageUsedGb} GB`} />
        <KpiCard icon={Trash2} label="Reclaimable" value={`${kpis.storageReclaimableGb} GB`} tone="good" />
        <KpiCard icon={ListChecks} label="Pending review" value={kpis.pendingReview} tone="warn" />
        <KpiCard icon={Copy} label="Duplicates found" value={kpis.duplicatesFound} tone="warn" />
        <KpiCard icon={Clock} label="Last scan" value={timeAgo(kpis.lastScan)} />
      </div>

      {!hasAnyData && (
        <EmptyState
          icon={Folder}
          title="No folder scanned yet"
          description="Choose a folder above and click Scan folder to analyze your files. Everything on this page is computed live from your scan — nothing here is a placeholder."
        />
      )}

      {hasAnyData && statusBreakdown.some(s => s.value > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title="Files by status" className="lg:col-span-1">
            <div className="flex items-center gap-4">
              <div className="h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusBreakdown} dataKey="value" nameKey="label" innerRadius={48} outerRadius={70} paddingAngle={2}>
                      {statusBreakdown.map(s => (
                        <Cell key={s.label} fill={STATUS_META[s.label]?.color || '#6B7280'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {statusBreakdown.map(s => (
                  <div key={s.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[s.label]?.color }} />
                      <span className="text-slate-600 dark:text-slate-300">{STATUS_META[s.label]?.label}</span>
                    </div>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Biggest space wasters" className="lg:col-span-2">
            {biggestWasters.length > 0 ? (
              <ul className="space-y-3">
                {biggestWasters.map(w => (
                  <li key={w.name} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{w.name}</p>
                      <p className="text-xs text-slate-400">{w.type}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-600 dark:text-slate-300">{formatSize(w.sizeMb)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-slate-400">No file size data available.</p>
            )}
          </SectionCard>
        </div>
      )}

      {reviewItems.length > 0 && (
        <SectionCard
          title="Needs your attention"
          action={
            <Link to="/review" className="focus-ring inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {reviewItems.map(f => (
              <li key={f.file_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{f.name}</p>
                  <p className="truncate font-mono text-xs text-slate-400">{f.folder}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge label={f.label} />
                  <WhyExplain file={f} align="right" />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}
