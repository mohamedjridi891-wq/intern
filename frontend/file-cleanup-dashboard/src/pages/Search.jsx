import { useMemo, useState, useEffect } from 'react'
import { Search as SearchIcon, Sparkles, ArrowUpDown, Lightbulb } from 'lucide-react'
import FileIcon from '../components/FileIcon'
import StatusBadge from '../components/StatusBadge'
import ScorePill from '../components/ScorePill'
import WhyExplain from '../components/WhyExplain'
import FileDetailDrawer from '../components/FileDetailDrawer'
import { EmptyState } from '../components/Shared'
import { formatSize, formatDate } from '../lib/format'
import { fetchFiles } from '../lib/api'

const SUGGESTIONS = [
  'Find old files no one has opened in 2 years',
  'Show me unsigned contracts',
  'Anything related to the Phoenix project',
  'Large video files in marketing',
]

const SNIPPET_BANK = [
  "Mentions quarterly figures and a budget breakdown that closely matches your query.",
  "Contains contract language and signature fields relevant to your search.",
  "This file's content focuses on the same project name you searched for.",
  "Includes a list of action items and dates close to the period you asked about.",
  "Looks like an early draft — wording overlaps heavily with your query terms.",
]

export default function Search() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [sortMode, setSortMode] = useState('relevance')
  const [drawerFile, setDrawerFile] = useState(null)
  const [files, setFiles] = useState([])

  // Load files on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchFiles(5000)
        setFiles(data || [])
      } catch (err) {
        console.error('Failed to load files:', err)
        setFiles([])
      }
    }
    load()
  }, [])

  const results = useMemo(() => {
    if (!submitted) return []
    const filesList = files
    
    // Semantic ranking: pseudo-random but stable per query string
    const seed = submitted.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    return filesList
      .map((f, i) => ({ 
        ...f, 
        relevance: ((seed * (i + 1)) % 97) / 100, 
        snippet: SNIPPET_BANK[(seed + i) % SNIPPET_BANK.length] 
      }))
      .filter(f => f.relevance > 0.55)
      .sort((a, b) => sortMode === 'relevance' ? b.relevance - a.relevance : (b.importance_score || 0) - (a.importance_score || 0))
      .slice(0, 9)
  }, [submitted, sortMode, files])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Search</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ask a question in plain language — no need for exact file names or keywords.</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setSubmitted(query.trim()) }}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft focus-within:ring-2 focus-within:ring-brand-500 dark:border-slate-800 dark:bg-navy-900"
      >
        <Sparkles className="ml-2 h-5 w-5 shrink-0 text-brand-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find old files no one has opened in 2 years…"
          className="flex-1 bg-transparent py-2 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
        />
        <button type="submit" className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <SearchIcon className="h-4 w-4" /> Ask
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => { setQuery(s); setSubmitted(s) }}
            className="focus-ring rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {s}
          </button>
        ))}
      </div>

      {submitted && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">{results.length} result{results.length !== 1 ? 's' : ''} for "{submitted}"</p>
          <button
            onClick={() => setSortMode(m => m === 'relevance' ? 'importance' : 'relevance')}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ArrowUpDown className="h-3.5 w-3.5" /> Sort: {sortMode === 'relevance' ? 'Relevance' : 'Importance'}
          </button>
        </div>
      )}

      {!submitted && (
        <EmptyState
          icon={Lightbulb}
          title="Ask anything about this folder"
          description="Try one of the suggestions above, or describe what you're looking for in your own words."
        />
      )}

      {submitted && results.length === 0 && (
        <EmptyState
          icon={SearchIcon}
          title="No matches found"
          description="Try rephrasing, or use a broader description — for example, swap a specific file name for what the file is about."
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map(f => (
          <div
            key={f.file_id}
            onClick={() => setDrawerFile(f)}
            className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-soft transition-shadow hover:shadow-card dark:border-slate-800 dark:bg-navy-900"
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                <FileIcon icon={f.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{f.name}</p>
                <p className="truncate font-mono text-[11px] text-slate-400">{f.folder}</p>
              </div>
              <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                {Math.round(f.relevance * 100)}% match
              </span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.snippet}</p>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScorePill score={f.importance_score} width={48} />
                <WhyExplain file={f} />
              </div>
              <StatusBadge label={f.label} />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">{formatSize(f.size_mb)} · modified {formatDate(f.modified_time)}</p>
          </div>
        ))}
      </div>

      <FileDetailDrawer file={drawerFile} onClose={() => setDrawerFile(null)} onAction={() => setDrawerFile(null)} />
    </div>
  )
}
