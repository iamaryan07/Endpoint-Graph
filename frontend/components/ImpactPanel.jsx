'use client'
import { useState, useEffect } from 'react'
import { fetchImpactAnalysis } from '@/lib/api'

function timeAgo(dateString) {
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function SourceBadge({ source }) {
  const cls =
    source === 'logs' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{source}</span>
}

export default function ImpactPanel({ endpointId, endpointLabel, onClose }) {
  const [consumers, setConsumers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setConsumers([])
    fetchImpactAnalysis(endpointId)
      .then(setConsumers)
      .catch((err) => {
        console.error('Impact analysis fetch failed:', err)
        setError('Failed to load consumers. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [endpointId])

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-lg border-l border-gray-200 flex flex-col z-10">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Impact Analysis</p>
          <h2 className="font-mono text-sm font-semibold text-gray-900">{endpointLabel}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!loading && !error && consumers.length === 0 && (
          <p className="text-sm text-gray-500">No consumers found.</p>
        )}
        {!loading && !error && consumers.length > 0 && (
          <ul className="space-y-3">
            {consumers.map((c, i) => (
              <li key={i} className="border border-gray-100 rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{c.service_name}</span>
                  <SourceBadge source={c.source} />
                </div>
                <div className="text-xs text-gray-500">
                  {c.call_count.toLocaleString()} calls · {timeAgo(c.last_seen_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
