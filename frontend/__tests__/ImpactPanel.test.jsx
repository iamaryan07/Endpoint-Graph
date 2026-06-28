import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImpactPanel from '@/components/ImpactPanel'

jest.mock('@/lib/api', () => ({
  fetchImpactAnalysis: jest.fn(),
}))

const { fetchImpactAnalysis } = require('@/lib/api')

const defaultProps = {
  endpointId: 1,
  endpointLabel: 'GET /users/{id}',
  onClose: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('test_impact_panel_shows_loading_state', () => {
  fetchImpactAnalysis.mockReturnValue(new Promise(() => {}))
  render(<ImpactPanel {...defaultProps} />)
  expect(screen.getByText('Loading…')).toBeInTheDocument()
})

test('test_impact_panel_shows_consumer_list', async () => {
  fetchImpactAnalysis.mockResolvedValue([
    {
      service_name: 'order-service',
      call_count: 42,
      last_seen_at: new Date().toISOString(),
      source: 'static',
    },
  ])
  render(<ImpactPanel {...defaultProps} />)
  await waitFor(() => {
    expect(screen.getByText('order-service')).toBeInTheDocument()
    expect(screen.getByText(/42 calls/)).toBeInTheDocument()
  })
})

test('test_impact_panel_shows_empty_state', async () => {
  fetchImpactAnalysis.mockResolvedValue([])
  render(<ImpactPanel {...defaultProps} />)
  await waitFor(() => {
    expect(screen.getByText('No consumers found.')).toBeInTheDocument()
  })
})

test('test_impact_panel_shows_error_state', async () => {
  fetchImpactAnalysis.mockRejectedValue(new Error('network error'))
  render(<ImpactPanel {...defaultProps} />)
  await waitFor(() => {
    expect(screen.getByText('Failed to load consumers. Please try again.')).toBeInTheDocument()
  })
})

test('test_impact_panel_calls_onClose_on_button_click', async () => {
  fetchImpactAnalysis.mockResolvedValue([])
  const onClose = jest.fn()
  render(<ImpactPanel {...defaultProps} onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('test_impact_panel_refetches_when_endpointId_changes', async () => {
  fetchImpactAnalysis.mockResolvedValue([])

  const { rerender } = render(<ImpactPanel {...defaultProps} endpointId={1} />)
  await waitFor(() => expect(fetchImpactAnalysis).toHaveBeenCalledWith(1))

  rerender(<ImpactPanel {...defaultProps} endpointId={2} />)
  await waitFor(() => expect(fetchImpactAnalysis).toHaveBeenCalledWith(2))

  expect(fetchImpactAnalysis).toHaveBeenCalledTimes(2)
})

test('test_static_source_badge_is_gray', async () => {
  fetchImpactAnalysis.mockResolvedValue([
    {
      service_name: 'order-service',
      call_count: 5,
      last_seen_at: new Date().toISOString(),
      source: 'static',
    },
  ])
  render(<ImpactPanel {...defaultProps} />)
  await waitFor(() => {
    const badge = screen.getByText('static')
    expect(badge.className).toContain('bg-gray-100')
  })
})

test('test_logs_source_badge_is_green', async () => {
  fetchImpactAnalysis.mockResolvedValue([
    {
      service_name: 'order-service',
      call_count: 5,
      last_seen_at: new Date().toISOString(),
      source: 'logs',
    },
  ])
  render(<ImpactPanel {...defaultProps} />)
  await waitFor(() => {
    const badge = screen.getByText('logs')
    expect(badge.className).toContain('bg-green-100')
  })
})
