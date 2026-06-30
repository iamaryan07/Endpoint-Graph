'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { triggerAnalysis, fetchUserRepos, deleteService } from '@/lib/api'

// repos: array of repo objects from GET /repos
// onUpdate: (newRepos: array) => void — replaces the repos state in the parent
export default function RepoList({ repos, onUpdate }) {
  const router = useRouter()
  const [rowLoading, setRowLoading] = useState({})
  const [rowError, setRowError] = useState({})

  const setLoading = (fullName, action) =>
    setRowLoading((prev) => ({ ...prev, [fullName]: action }))
  const clearLoading = (fullName) =>
    setRowLoading((prev) => ({ ...prev, [fullName]: null }))
  const setError = (fullName, msg) =>
    setRowError((prev) => ({ ...prev, [fullName]: msg || null }))

  async function handleTrack(repo) {
    setLoading(repo.full_name, 'track')
    setError(repo.full_name, null)
    try {
      await triggerAnalysis(`https://github.com/${repo.full_name}`)
      router.push(`/graph?repo=${repo.full_name}`)
    } catch (err) {
      setError(repo.full_name, err.message)
      clearLoading(repo.full_name)
    }
  }

  async function handleReanalyze(repo) {
    setLoading(repo.full_name, 'reanalyze')
    setError(repo.full_name, null)
    try {
      await triggerAnalysis(`https://github.com/${repo.full_name}`)
      const updated = await fetchUserRepos()
      onUpdate(updated)
    } catch (err) {
      setError(repo.full_name, err.message)
    } finally {
      clearLoading(repo.full_name)
    }
  }

  async function handleUntrack(repo) {
    setLoading(repo.full_name, 'untrack')
    setError(repo.full_name, null)
    try {
      await deleteService(repo.service_id)
      onUpdate(repos.filter((r) => r.full_name !== repo.full_name))
    } catch (err) {
      setError(repo.full_name, err.message)
      clearLoading(repo.full_name)
    }
  }

  if (repos.length === 0) {
    return <p className="text-gray-400 text-sm">No repositories found.</p>
  }

  return (
    <ul className="space-y-3">
      {repos.map((repo) => {
        const activeAction = rowLoading[repo.full_name]
        const err = rowError[repo.full_name]
        const isLoading = Boolean(activeAction)

        return (
          <li key={repo.full_name} className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white truncate">{repo.name}</span>
                  <span
                    className={
                      repo.private
                        ? 'text-xs px-2 py-0.5 rounded-full bg-amber-900 text-amber-300'
                        : 'text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300'
                    }
                  >
                    {repo.private ? 'Private' : 'Public'}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mt-0.5">{repo.full_name}</p>
                <p className="text-gray-500 text-xs mt-1">
                  Last analyzed:{' '}
                  {repo.last_analyzed_at
                    ? new Date(repo.last_analyzed_at).toLocaleString()
                    : 'Never'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {repo.tracked ? (
                  <>
                    <button
                      disabled={isLoading}
                      onClick={() => handleReanalyze(repo)}
                      className="text-sm px-3 py-1.5 rounded bg-gray-700 text-white disabled:opacity-50"
                    >
                      {activeAction === 'reanalyze' ? 'Analyzing…' : 'Re-analyze'}
                    </button>
                    <button
                      disabled={isLoading}
                      onClick={() => handleUntrack(repo)}
                      className="text-sm px-3 py-1.5 rounded bg-red-900 text-red-300 disabled:opacity-50"
                    >
                      {activeAction === 'untrack' ? 'Untracking…' : 'Untrack'}
                    </button>
                  </>
                ) : (
                  <button
                    disabled={isLoading}
                    onClick={() => handleTrack(repo)}
                    className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
                  >
                    {activeAction === 'track' ? 'Tracking…' : 'Track'}
                  </button>
                )}
              </div>
            </div>
            {err && (
              <p className="text-red-400 text-xs mt-1">{err}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
