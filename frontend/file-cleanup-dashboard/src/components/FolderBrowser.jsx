import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Home, HardDrive } from 'lucide-react'

export default function FolderBrowser({ onSelectFolder, currentPath = '' }) {
  const [roots, setRoots] = useState([])
  const [currentItems, setCurrentItems] = useState([])
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState([])

  const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8013'

  // Load root folders on mount
  useEffect(() => {
    loadRoots()
    if (currentPath) {
      loadFolder(currentPath)
    }
  }, [])

  async function loadRoots() {
    try {
      setLoading(true)
      const resp = await fetch(`${API_BASE}/folders/roots`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setRoots(data.items || [])
    } catch (err) {
      setError(`Failed to load roots: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadFolder(path) {
    try {
      setLoading(true)
      setError('')
      const resp = await fetch(`${API_BASE}/folders/browse?path=${encodeURIComponent(path)}`)
      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(errText || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      setCurrentItems(data.items || [])
      updateBreadcrumbs(data.current_path)
    } catch (err) {
      setError(`Failed to load folder: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  function updateBreadcrumbs(path) {
    const parts = path.split(/[\\/]/).filter(p => p)
    const crumbs = [
      { name: 'Home', path: '' },
      ...parts.map((part, idx) => {
        const fullPath = parts.slice(0, idx + 1).join('/')
        return { name: part, path: fullPath }
      })
    ]
    setBreadcrumbs(crumbs)
  }

  function handleSelectFolder(path) {
    onSelectFolder(path)
    loadFolder(path)
  }

  function handleRootClick(root) {
    handleSelectFolder(root.path)
  }

  function handleNavigateUp() {
    const currentPath = breadcrumbs[breadcrumbs.length - 1]?.path || ''
    if (currentPath) {
      const parent = currentPath.substring(0, currentPath.lastIndexOf('/'))
      handleSelectFolder(parent || '')
    }
  }

  const folders = currentItems.filter(i => i.is_dir)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Choose Folder
        </h3>
        
        {error && (
          <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Breadcrumb navigation */}
        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
          {breadcrumbs.map((crumb, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectFolder(crumb.path)}
              className="hover:text-slate-900 dark:hover:text-slate-100"
            >
              {crumb.name || '/'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto rounded border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
        {loading ? (
          <div className="p-4 text-center text-sm text-slate-500">Loading...</div>
        ) : currentItems.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">
            {breadcrumbs.length > 1 ? 'No folders found' : 'Select a root folder'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {/* Root folders (if no current path) */}
            {breadcrumbs.length === 1 && (
              <>
                {roots.map(root => (
                  <li
                    key={root.path}
                    onClick={() => handleRootClick(root)}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    {root.name.includes('C') || root.name.includes('D') ? (
                      <HardDrive className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    ) : (
                      <Home className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    )}
                    <span className="text-sm text-slate-700 dark:text-slate-300">{root.name}</span>
                  </li>
                ))}
              </>
            )}

            {/* Folders in current directory */}
            {folders.map(folder => (
              <li
                key={folder.path}
                onClick={() => handleSelectFolder(folder.path)}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
                <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                  {folder.name}
                </span>
              </li>
            ))}

            {/* Non-folder items */}
            {currentItems
              .filter(i => !i.is_dir)
              .slice(0, 3)
              .map(file => (
                <li
                  key={file.path}
                  className="flex items-center gap-2 px-3 py-2 text-slate-500 dark:text-slate-400"
                >
                  <div className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate text-xs">{file.name}</span>
                </li>
              ))}

            {currentItems.filter(i => !i.is_dir).length > 3 && (
              <li className="px-3 py-2 text-xs text-slate-500">
                +{currentItems.filter(i => !i.is_dir).length - 3} more files
              </li>
            )}
          </ul>
        )}
      </div>

      {/* Current selection display */}
      {breadcrumbs.length > 1 && (
        <div className="mt-3 rounded bg-blue-50 p-2 dark:bg-blue-900/20">
          <p className="truncate text-xs font-semibold text-blue-700 dark:text-blue-300">
            Selected: {breadcrumbs[breadcrumbs.length - 1].path}
          </p>
        </div>
      )}
    </div>
  )
}
