'use client'
import { supabase } from '@/lib/supabase'

function NetworkLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="3" r="2.5" fill="#fca311" />
      <circle cx="2.5" cy="17" r="2.5" fill="#fca311" />
      <circle cx="19.5" cy="17" r="2.5" fill="#fca311" />
      <line x1="11" y1="5.5" x2="3.8" y2="14.8" stroke="#fca311" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="5.5" x2="18.2" y2="14.8" stroke="#fca311" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="17" x2="17" y2="17" stroke="#fca311" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
    </svg>
  )
}

const steps = [
  'Paste a GitHub repo URL — public or private',
  'Static analysis via OpenAPI specs + tree-sitter',
  'Interactive graph: click any endpoint to see every service that calls it',
]

export default function LoginPage() {
  const login = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: 'repo',
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="flex min-h-screen bg-black">
      {/* Left column — branding */}
      <div className="hidden lg:flex flex-col justify-between w-96 shrink-0 border-r border-prussian-600 p-10">
        <div className="flex items-center gap-2.5">
          <NetworkLogo />
          <span className="font-mono font-bold text-white text-base tracking-tight">EndpointGraph</span>
        </div>

        <div>
          <p className="text-alabaster-300 text-xs font-mono uppercase tracking-widest mb-6">
            How it works
          </p>
          <ol className="space-y-5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-mono text-orange text-xs mt-0.5 shrink-0">0{i + 1}</span>
                <span className="text-alabaster-400 text-sm leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-alabaster-200 text-xs font-mono">
          No instrumentation. No opt-in from consumers.
        </p>
      </div>

      {/* Right column — login form */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2.5 mb-12">
          <NetworkLogo />
          <span className="font-mono font-bold text-white text-lg tracking-tight">EndpointGraph</span>
        </div>

        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
            Sign in
          </h1>
          <p className="text-alabaster-300 text-sm mb-8">
            Connect your GitHub account to analyze repositories and visualize API dependencies.
          </p>

          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-2.5 py-3 bg-orange text-black font-bold text-sm rounded hover:bg-orange-600 transition-colors"
          >
            <GitHubIcon />
            Continue with GitHub
          </button>

          <p className="mt-5 text-alabaster-200 text-xs text-center leading-relaxed">
            Requests{' '}
            <code className="text-orange font-mono bg-prussian-300 px-1 py-0.5 rounded text-xs">repo</code>
            {' '}scope to clone private repositories.
            <br />
            No data is stored beyond what you analyze.
          </p>
        </div>
      </div>
    </div>
  )
}
