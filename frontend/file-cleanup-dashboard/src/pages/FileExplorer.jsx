import { useMemo, useState, useEffect } from 'react'
import { Folder, ChevronRight, ChevronDown, ArrowUpDown, Copy, Archive, Flag, Download, FolderTree } from 'lucide-react'

import FileIcon from '../components/FileIcon'
import StatusBadge from '../components/StatusBadge'
import ScorePill from '../components/ScorePill'
import WhyExplain from '../components/WhyExplain'
import FileDetailDrawer from '../components/FileDetailDrawer'
import ConfirmModal from '../components/ConfirmModal'
import { EmptyState } from '../components/Shared'
import { formatSize, formatDate } from '../lib/format'
import { fetchFiles } from '../lib/api'

function buildTree(files) {
  const root = {}
  files.forEach(f => {
    const parts = f.folder.replace(/^\/root\//, '').split('/')
    let node = root
    parts.forEach(p => {
      node[p] = node[p] || { __count: 0, __children: {} }
      node[p].__count += 1
      node = node[p].__children
    })
  })
  return root
}

function TreeNode({ name, node, depth, activeFolder, setActiveFolder, pathPrefix }) {
  const [open, setOpen] = useState(depth < 1)
  const fullPath = `${pathPrefix}/${name}`
  const hasChildren = Object.keys(node.__children).length > 0
  const isActive = activeFolder === fullPath

  return (
    <div>
      <button
        onClick={() => { setActiveFolder(fullPath); if (hasChildren) setOpen(o => !o) }}
        className={`focus-ring flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm ${
          isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {hasChildren ? (open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />) : <span className="w-3.5" />}
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">{name}</span>
        <span className="text-xs text-slate-400">{node.__count}</span>
      </button>
      {open && hasChildren && (
        <div>
          {Object.entries(node.__children).map(([childName, childNode]) => (
            <TreeNode
              key={childName}
              name={childName}
              node={childNode}
              depth={depth + 1}
              activeFolder={activeFolder}
              setActiveFolder={setActiveFolder}
              pathPrefix={fullPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const FILTERS = ['All', 'Document', 'Spreadsheet', 'Presentation', 'Image', 'Archive', 'Code', 'Video', 'Log']

export default function FileExplorer() {
  const [files, setFiles] = useState([])
  const [activeFolder, setActiveFolder] = useState(null)
  const [typeFilter, setTypeFilter] = useState('All')
  const [sortKey, setSortKey] = useState('importance_score')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState(new Set())
  const [drawerFile, setDrawerFile] = useState(null)
  const [confirm, setConfirm] = useState(null)

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

  const filesList = files
  const tree = useMemo(() => buildTree(filesList), [filesList])

  const filtered = useMemo(() => {
    let list = filesList
    if (activeFolder) list = list.filter(f => f.folder.includes(activeFolder))
    if (typeFilter !== 'All') list = list.filter(f => f.category === typeFilter)
    list = [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av || 0) - (bv || 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [filesList, activeFolder, typeFilter, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(f => f.file_id)))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">File Explorer</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{filtered.length.toLocaleString()} files{activeFolder ? ` in ${activeFolder}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-navy-900 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
          <button
            onClick={() => setActiveFolder(null)}
            className={`focus-ring mb-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium ${
              !activeFolder ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <FolderTree className="h-3.5 w-3.5" /> All files
          </button>
          {Object.entries(tree).map(([name, node]) => (
            <TreeNode key={name} name={name} node={node} depth={0} activeFolder={activeFolder} setActiveFolder={setActiveFolder} pathPrefix="" />
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-navy-900">
          {selected.size > 0 && (
            <div className="flex items-center gap-3 border-b border-slate-100 bg-brand-50 px-4 py-2.5 text-sm dark:border-slate-800 dark:bg-brand-900/20">
              <span className="font-medium text-brand-800 dark:text-brand-300">{selected.size} selected</span>
              <button onClick={() => setConfirm({ action: 'archive', count: selected.size })} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-brand-700 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-900/40">
                <Archive className="h-3.5 w-3.5" /> Archive selected
              </button>
              <button onClick={() => setConfirm({ action: 'flag', count: selected.size })} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-brand-700 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-900/40">
                <Flag className="h-3.5 w-3.5" /> Flag for review
              </button>
              <button className="focus-ring ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-brand-700 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-900/40">
                <Download className="h-3.5 w-3.5" /> Export list
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 dark:border-slate-800">
                  <th className="w-9 px-4 py-2.5">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded border-slate-300" />
                  </th>
                  <Th label="Name" sortKey="name" toggleSort={toggleSort} />
                  <Th label="Size" sortKey="size_mb" toggleSort={toggleSort} />
                  <Th label="Modified" sortKey="modified_time" toggleSort={toggleSort} />
                  <Th label="Importance" sortKey="importance_score" toggleSort={toggleSort} />
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Duplicate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 60).map(f => (
                  <tr
                    key={f.file_id}
                    onClick={() => setDrawerFile(f)}
                    className="cursor-pointer border-b border-slate-50 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(f.file_id)} onChange={() => toggleSelect(f.file_id)} className="rounded border-slate-300" />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileIcon icon={f.icon} className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate font-medium text-slate-700 dark:text-slate-200">{f.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{formatSize(f.size_mb)}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{formatDate(f.modified_time)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ScorePill score={f.importance_score} />
                        <WhyExplain file={f} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge label={f.label} /></td>
                    <td className="px-4 py-2.5">
                      {f.is_duplicate ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <Copy className="h-3.5 w-3.5" /> {f.duplicate_similarity}%
                        </span>
                      ) : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-6">
                <EmptyState title="No files match these filters" description="Try a different folder or clear the type filter." />
              </div>
            )}
          </div>
        </div>
      </div>

      <FileDetailDrawer file={drawerFile} onClose={() => setDrawerFile(null)} onAction={() => setDrawerFile(null)} />

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.action === 'archive' ? 'Archive selected files?' : 'Flag files for review?'}
        description={`This will affect ${confirm?.count} file(s). ${confirm?.action === 'archive' ? 'Archived files are moved out of active storage but never deleted.' : 'They\'ll be added to your Review Queue for a final decision.'}`}
        confirmLabel={confirm?.action === 'archive' ? 'Archive files' : 'Flag for review'}
        tone={confirm?.action === 'archive' ? 'default' : 'default'}
        onConfirm={() => setSelected(new Set())}
      />
    </div>
  )
}

function Th({ label, sortKey: key, toggleSort }) {
  return (
    <th className="cursor-pointer select-none px-4 py-2.5" onClick={() => toggleSort(key)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </span>
    </th>
  )
}
