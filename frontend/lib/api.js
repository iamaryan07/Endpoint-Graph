import { supabase } from './supabase'

async function getGitHubToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.provider_token) throw new Error('No GitHub token — please log in again')
  return session.provider_token
}

export async function triggerAnalysis(repoUrl) {
  const token = await getGitHubToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Token': token,
    },
    body: JSON.stringify({ repo_url: repoUrl }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchGraph() {
  const token = await getGitHubToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/graph`, {
    headers: { 'X-GitHub-Token': token },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchServices() {
  const token = await getGitHubToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/services`, {
    headers: { 'X-GitHub-Token': token },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchImpactAnalysis(endpointId) {
  const token = await getGitHubToken()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/endpoints/${endpointId}/impact-analysis`,
    { headers: { 'X-GitHub-Token': token } }
  )
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
