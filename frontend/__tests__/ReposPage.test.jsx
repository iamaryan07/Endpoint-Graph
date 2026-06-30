import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReposPage from '@/app/repos/page'

jest.mock('@/components/AuthGuard', () => ({
  __esModule: true,
  default: function MockAuthGuard({ children }) {
    return children
  },
}))

jest.mock('@/components/RepoList', () => ({
  __esModule: true,
  default: function MockRepoList({ repos, onUpdate }) {
    return (
      <div data-testid="repo-list">
        <span>{repos.length} repos</span>
        <button onClick={() => onUpdate([])}>clear-repos</button>
      </div>
    )
  },
}))

jest.mock('@/lib/api', () => ({
  fetchUserRepos: jest.fn(),
}))

const { fetchUserRepos } = require('@/lib/api')

beforeEach(() => {
  jest.clearAllMocks()
})

test('shows loading spinner on mount before fetchUserRepos resolves', () => {
  fetchUserRepos.mockReturnValue(new Promise(() => {}))
  render(<ReposPage />)
  expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
})

test('does not render RepoList while loading is in progress', () => {
  fetchUserRepos.mockReturnValue(new Promise(() => {}))
  render(<ReposPage />)
  expect(screen.queryByTestId('repo-list')).not.toBeInTheDocument()
})

test('hides loading spinner after fetchUserRepos resolves successfully', async () => {
  fetchUserRepos.mockResolvedValue([])
  render(<ReposPage />)
  await waitFor(() => {
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()
  })
})

test('renders RepoList after fetchUserRepos resolves successfully', async () => {
  fetchUserRepos.mockResolvedValue([])
  render(<ReposPage />)
  await waitFor(() => {
    expect(screen.getByTestId('repo-list')).toBeInTheDocument()
  })
})

test('RepoList receives the repos returned by fetchUserRepos as its repos prop', async () => {
  const repos = [
    {
      name: 'r1',
      full_name: 'owner/r1',
      private: false,
      updated_at: '2024-01-01T00:00:00Z',
      tracked: false,
      last_analyzed_at: null,
      service_id: null,
    },
    {
      name: 'r2',
      full_name: 'owner/r2',
      private: false,
      updated_at: '2024-01-01T00:00:00Z',
      tracked: true,
      last_analyzed_at: null,
      service_id: 5,
    },
  ]
  fetchUserRepos.mockResolvedValue(repos)
  render(<ReposPage />)
  await waitFor(() => {
    expect(screen.getByText('2 repos')).toBeInTheDocument()
  })
})

test('onUpdate prop passed to RepoList is setRepos — calling it updates the page state', async () => {
  fetchUserRepos.mockResolvedValue([
    {
      name: 'r1',
      full_name: 'owner/r1',
      private: false,
      updated_at: '2024-01-01T00:00:00Z',
      tracked: false,
      last_analyzed_at: null,
      service_id: null,
    },
  ])
  render(<ReposPage />)
  await waitFor(() => {
    expect(screen.getByText('1 repos')).toBeInTheDocument()
  })
  fireEvent.click(screen.getByRole('button', { name: 'clear-repos' }))
  await waitFor(() => {
    expect(screen.getByText('0 repos')).toBeInTheDocument()
  })
})

test('shows top-level error message if fetchUserRepos rejects', async () => {
  fetchUserRepos.mockRejectedValue(new Error('network error'))
  render(<ReposPage />)
  await waitFor(() => {
    expect(screen.getByText('network error')).toBeInTheDocument()
  })
})

test('hides loading spinner after fetchUserRepos rejects (finally block runs)', async () => {
  fetchUserRepos.mockRejectedValue(new Error('network error'))
  render(<ReposPage />)
  await waitFor(() => {
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument()
  })
})

test('does not show an error message on successful fetch', async () => {
  fetchUserRepos.mockResolvedValue([])
  render(<ReposPage />)
  await waitFor(() => {
    expect(screen.getByTestId('repo-list')).toBeInTheDocument()
  })
  expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
})

test('AuthGuard wraps the page and renders page content through to the DOM', async () => {
  fetchUserRepos.mockResolvedValue([])
  render(<ReposPage />)
  expect(screen.getByText('Your Repositories')).toBeInTheDocument()
})
