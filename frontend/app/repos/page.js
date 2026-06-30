'use client'
import { useEffect, useState } from 'react'
import AuthGuard from '@/components/AuthGuard'
import RepoList from '@/components/RepoList'
import { fetchUserRepos } from '@/lib/api'

export default function ReposPage() {
  const [loading, setLoading] = useState(true)
  const [repos, setRepos] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchUserRepos()
        setRepos(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <AuthGuard>
      <main className="min-h-screen bg-black text-white p-8">
        <h1 className="text-2xl font-bold mb-6">Your Repositories</h1>
        {loading && (
          <div data-testid="loading-spinner" className="flex justify-center mt-16">
            <div className="w-8 h-8 rounded-full border-t-2 border-white animate-spin" />
          </div>
        )}
        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}
        {!loading && <RepoList repos={repos} onUpdate={setRepos} />}
      </main>
    </AuthGuard>
  )
}
