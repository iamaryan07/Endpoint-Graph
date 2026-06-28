'use client'
import { useState } from 'react'
import { triggerAnalysis } from '@/lib/api'

export default function RepoInput({ onAnalysisComplete }) {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleAnalyze() {
    if (!repoUrl.trim() || loading) return
    setLoading(true)
    setFailed(false)
    try {
      await triggerAnalysis(repoUrl)
      onAnalysisComplete()
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <input
        type="text"
        value={repoUrl}
        onChange={(e) => { setRepoUrl(e.target.value); setFailed(false) }}
        onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
        placeholder="github.com/owner/repo"
        className={`flex-1 min-w-0 bg-black border text-alabaster placeholder-alabaster-200 text-sm font-mono px-3 py-1.5 rounded focus:outline-none transition-colors ${
          failed
            ? 'border-red-600 focus:border-red-500'
            : 'border-prussian-600 focus:border-orange'
        }`}
      />
      <button
        onClick={handleAnalyze}
        disabled={loading || !repoUrl.trim()}
        className="shrink-0 px-4 py-1.5 bg-orange text-black text-sm font-bold font-mono rounded hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Running…' : 'Analyze'}
      </button>
    </div>
  )
}
