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
 * Compute KPIs from files data
 */
export function computeKPIs(files, reviewQueue) {
  const now = new Date()
  
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
  
  // Find duplicates (if file_redundancy data available)
  const duplicatesFound = 0 // Would need separate endpoint for this
  
  // Last scan time
  const lastScan = files.length > 0 ? now : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  
  return {
    totalFiles,
    storageUsedGb,
    storageReclaimableGb,
    pendingReview,
    duplicatesFound,
    lastScan,
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
  return files
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
  KEEP: { label: 'Keep', color: '#16A34A' },
  ARCHIVE: { label: 'Archive', color: '#D97706' },
  REVIEW: { label: 'Review', color: '#CA8A04' },
  DELETE_CANDIDATE: { label: 'Delete candidate', color: '#DC2626' },
}

/**
 * Generate mock storage trend (real backend doesn't track historical data yet)
 */
export function generateStorageTrend(storageUsedGb) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return days.map((day, i) => ({
    day,
    reclaimedGb: Math.max(0, Math.floor(storageUsedGb * 0.3 * (i / 7))),
  }))
}
