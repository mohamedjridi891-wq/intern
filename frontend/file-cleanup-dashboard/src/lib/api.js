/**
 * API Service - Real backend integration
 * Fetches data from ph10 (FastAPI) backend instead of mock data
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8013'
const OWNER_ID = 'dashboard-user'

/**
 * Fetch list of files
 */
export async function fetchFiles(limit = 500) {
  try {
    const res = await fetch(`${API_BASE}/files?limit=${limit}`, {
      headers: { 'X-Owner-Id': OWNER_ID },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('fetchFiles failed:', err)
    return []
  }
}
/**
 * Real semantic search against the Qdrant-backed /search endpoint
 */
export async function searchFiles(query, limit = 30) {
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
      headers: { 'X-Owner-Id': OWNER_ID },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('searchFiles failed:', err)
    throw err
  }
}

/**
 * Fetch duplicates list
 */
export async function fetchDuplicates(limit = 100) {
  try {
    const res = await fetch(`${API_BASE}/duplicates?limit=${limit}`, {
      headers: { 'X-Owner-Id': OWNER_ID },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('fetchDuplicates failed:', err)
    return []
  }
}

/**
 * Fetch review queue
 */
export async function fetchReviewQueue(limit = 200) {
  try {
    const res = await fetch(`${API_BASE}/review-queue?limit=${limit}`, {
      headers: { 'X-Owner-Id': OWNER_ID },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('fetchReviewQueue failed:', err)
    return []
  }
}

/**
 * Fetch file details
 */
export async function fetchFileDetail(fileId) {
  try {
    const res = await fetch(`${API_BASE}/files/${fileId}`, {
      headers: { 'X-Owner-Id': OWNER_ID },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('fetchFileDetail failed:', err)
    return null
  }
}

/**
 * Send chat message
 */
export async function sendChatMessage(sessionId, message) {
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Owner-Id': OWNER_ID,
      },
      body: JSON.stringify({
        session_id: sessionId,
        message,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('sendChatMessage failed:', err)
    return { error: err.message }
  }
}

/**
 * Perform file action (review/delete/keep)
 */
export async function performFileAction(fileId, action) {
  try {
    const res = await fetch(`${API_BASE}/files/${fileId}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Owner-Id': OWNER_ID,
      },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('performFileAction failed:', err)
    return { error: err.message }
  }
}

/**
 * Compute KPIs from real files/reviewQueue/duplicates data.
 * No fabricated numbers — every field here is derived directly from
 * what the backend returned. If duplicates haven't been fetched yet,
 * duplicatesFound is left at 0 honestly (because it IS zero in that
 * render), not as a permanent stand-in for "we didn't bother wiring this up".
 */
export function computeKPIs(files, reviewQueue, duplicates = []) {
  // Total files
  const totalFiles = files.length

  // Storage metrics
  const totalSizeMb = files.reduce((sum, f) => sum + (f.size_bytes || 0), 0) / (1024 * 1024)
  const storageUsedGb = Math.round(totalSizeMb / 1024 * 10) / 10

  // Reclaimable storage (sum of DELETE_CANDIDATE files)
  const reclaimableBytes = reviewQueue
    .filter(f => f.label === 'DELETE_CANDIDATE')
    .reduce((sum, f) => sum + (f.size_bytes || 0), 0)
  const storageReclaimableGb = Math.round((reclaimableBytes / (1024 ** 3)) * 10) / 10

  // Pending review count
  const pendingReview = reviewQueue.filter(f => ['REVIEW', 'DELETE_CANDIDATE'].includes(f.label)).length

  // Real duplicate pair count from /duplicates (file_redundancy table)
  const duplicatesFound = duplicates.length

  // Last scan time: derive from the most recent modified_time we actually
  // have on hand. This is the freshest real timestamp the backend gives us
  // per file (there is no dedicated "last scan" timestamp exposed yet).
  // If there's no data at all, report it honestly instead of guessing.
  let lastScan = null
  if (files.length > 0) {
    const mostRecent = files.reduce((latest, f) => {
      const t = f.modified_time ? new Date(f.modified_time).getTime() : 0
      return t > latest ? t : latest
    }, 0)
    lastScan = mostRecent > 0 ? new Date(mostRecent) : null
  }

  return {
    totalFiles,
    storageUsedGb,
    storageReclaimableGb,
    pendingReview,
    duplicatesFound,
    lastScan, // null means "no data yet" — render this as "Never scanned"
  }
}

/**
 * Compute status breakdown from files
 */
export function computeStatusBreakdown(reviewQueue) {
  const labels = ['KEEP', 'ARCHIVE', 'REVIEW', 'DELETE_CANDIDATE']
  return labels.map(label => ({
    label,
    value: reviewQueue.filter(f => f.label === label).length,
  }))
}

/**
 * Get biggest space wasters
 */
export function getBiggestWasters(files, limit = 5) {
  return [...files]
    .sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0))
    .slice(0, limit)
    .map(f => ({
      name: f.name || 'Unknown',
      type: f.category || 'File',
      sizeMb: ((f.size_bytes || 0) / (1024 * 1024)),
    }))
}

export function computeScoreHistogram(files, buckets = 10) {
  const histogram = Array.from({ length: buckets }, () => 0)
  const maxScore = 100
  files.forEach(f => {
    const score = Math.max(0, Math.min(maxScore, Number(f.importance_score) || 0))
    const bucket = Math.min(buckets - 1, Math.floor((score / maxScore) * buckets))
    histogram[bucket] += 1
  })
  return histogram.map((count, i) => ({
    bucket: `${Math.round((i * maxScore) / buckets)}-${Math.round(((i + 1) * maxScore) / buckets)}`,
    count,
  }))
}

export async function uploadFolder(files) {
  try {
    const formData = new FormData()
    Array.from(files).forEach(file => {
      const path = file.webkitRelativePath || file.name
      formData.append('files', file, path)
    })

    const res = await fetch(`${API_BASE}/upload-folder`, {
      method: 'POST',
      headers: {
        'X-Owner-Id': OWNER_ID,
      },
      body: formData,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('uploadFolder failed:', err)
    throw err
  }
}

/**
 * Get status metadata
 */
export const STATUS_META = {
  KEEP:             { label: 'Keep',             color: '#16A34A', badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  ARCHIVE:          { label: 'Archive',           color: '#D97706', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  REVIEW:           { label: 'Review',            color: '#CA8A04', badgeClass: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  DELETE_CANDIDATE: { label: 'Delete candidate',  color: '#DC2626', badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
}

/**
 * Export an array of file-like rows to a real downloadable CSV file.
 * No fake data — this serializes whatever real records were passed in.
 */
export function exportToCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) return false

  const escape = (val) => {
    if (val == null) return ''
    const s = String(val)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const header = columns.map(c => escape(c.label)).join(',')
  const lines = rows.map(row =>
    columns.map(c => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(',')
  )
  const csv = [header, ...lines].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  return true
}
