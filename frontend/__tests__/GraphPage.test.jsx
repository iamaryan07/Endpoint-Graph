import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GraphPage from '@/app/graph/page'

jest.mock('@/components/AuthGuard', () => ({
  __esModule: true,
  default: function MockAuthGuard({ children }) {
    return children
  },
}))

jest.mock('@/components/DependencyGraph', () => ({
  __esModule: true,
  default: function MockDependencyGraph({ nodes, edges, onNodeClick }) {
    return (
      <div data-testid="dependency-graph">
        {nodes.map((n) => (
          <div
            key={n.id}
            data-testid="graph-node"
            data-node-id={n.id}
            data-label={n.data.label}
            onClick={(e) => onNodeClick && onNodeClick(e, n)}
          >
            {n.data.label}
          </div>
        ))}
        {edges.map((e) => (
          <div key={e.id} data-testid="graph-edge" data-edge-id={e.id} />
        ))}
      </div>
    )
  },
}))

jest.mock('@/components/ImpactPanel', () => ({
  __esModule: true,
  default: function MockImpactPanel({ endpointId, endpointLabel, onClose }) {
    return (
      <div
        data-testid="impact-panel"
        data-endpoint-id={String(endpointId)}
        data-endpoint-label={endpointLabel}
      >
        <button onClick={onClose}>Close</button>
      </div>
    )
  },
}))

jest.mock('next/dynamic', () => (_fn) => {
  return require('@/components/DependencyGraph').default
})

jest.mock('@/components/RepoInput', () => ({
  __esModule: true,
  default: function MockRepoInput({ onAnalysisComplete }) {
    return <button onClick={onAnalysisComplete}>Analyze</button>
  },
}))

jest.mock('@/lib/api', () => ({
  triggerAnalysis: jest.fn(),
  fetchGraph: jest.fn(),
}))

const { triggerAnalysis, fetchGraph } = require('@/lib/api')

beforeEach(() => {
  jest.clearAllMocks()
  triggerAnalysis.mockResolvedValue({ status: 'ok' })
})

test('test_graph_page_transforms_fetchGraph_response', async () => {
  fetchGraph.mockResolvedValue({
    nodes: [
      { id: '1', name: 'order-service' },
      { id: 'endpoint-5', name: 'GET /users/{id}' },
    ],
    edges: [
      {
        source: '1',
        target: 'endpoint-5',
        endpoint_method: 'GET',
        endpoint_path: '/users/{id}',
        call_count: 5,
        last_seen_at: '2024-01-01T00:00:00',
      },
    ],
  })

  render(<GraphPage />)

  fireEvent.click(screen.getByText('Analyze'))

  await waitFor(() => {
    expect(screen.getByText('order-service')).toBeInTheDocument()
  })

  const edge = screen.getByTestId('graph-edge')
  expect(edge).toHaveAttribute('data-edge-id', '1-endpoint-5-GET-/users/{id}')
})

test('test_graph_page_shows_error_when_fetchGraph_fails', async () => {
  fetchGraph.mockRejectedValue(new Error('graph fetch failed'))

  render(<GraphPage />)

  fireEvent.click(screen.getByText('Analyze'))

  await waitFor(() => {
    expect(screen.getByText('graph fetch failed')).toBeInTheDocument()
  })

  expect(screen.queryByText('Loading graph…')).not.toBeInTheDocument()
  expect(screen.queryByTestId('dependency-graph')).not.toBeInTheDocument()
})

test('test_handleNodeClick_ignores_service_nodes', async () => {
  fetchGraph.mockResolvedValue({
    nodes: [{ id: '1', name: 'order-service' }],
    edges: [],
  })

  render(<GraphPage />)
  fireEvent.click(screen.getByText('Analyze'))

  await waitFor(() => {
    expect(screen.getByText('order-service')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('order-service'))

  expect(screen.queryByTestId('impact-panel')).not.toBeInTheDocument()
})

test('test_handleNodeClick_sets_state_for_endpoint_nodes', async () => {
  fetchGraph.mockResolvedValue({
    nodes: [
      { id: '1', name: 'order-service' },
      { id: 'endpoint-5', name: 'GET /users/{id}' },
    ],
    edges: [],
  })

  render(<GraphPage />)
  fireEvent.click(screen.getByText('Analyze'))

  await waitFor(() => {
    expect(screen.getByText('GET /users/{id}')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByText('GET /users/{id}'))

  await waitFor(() => {
    expect(screen.getByTestId('impact-panel')).toBeInTheDocument()
  })

  expect(screen.getByTestId('impact-panel')).toHaveAttribute('data-endpoint-id', '5')
  expect(screen.getByTestId('impact-panel')).toHaveAttribute(
    'data-endpoint-label',
    'GET /users/{id}'
  )
})
