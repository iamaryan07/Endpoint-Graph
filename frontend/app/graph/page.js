'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import AuthGuard from '@/components/AuthGuard'
import RepoInput from '@/components/RepoInput'
import ImpactPanel from '@/components/ImpactPanel'
import { fetchGraph } from '@/lib/api'

const DependencyGraph = dynamic(
  () => import('@/components/DependencyGraph'),
  { ssr: false }
)

export default function GraphPage() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState(null)
  const [selectedEndpoint, setSelectedEndpoint] = useState(null)

  async function handleAnalysisComplete() {
    setSelectedEndpoint(null)
    setGraphLoading(true)
    setGraphError(null)
    try {
      const graphData = await fetchGraph()
      const rfNodes = graphData.nodes.map((node) => {
        const isEndpoint = node.id.startsWith('endpoint-')
        return {
          id: node.id,
          data: { label: node.name },
          position: { x: 0, y: 0 },
          ...(isEndpoint
            ? { style: { background: '#e0f2fe', borderColor: '#0284c7', borderWidth: 2 } }
            : {}),
        }
      })
      const rfEdges = graphData.edges.map((edge) => ({
        id: `${edge.source}-${edge.target}-${edge.endpoint_method}-${edge.endpoint_path}`,
        source: edge.source,
        target: edge.target,
        label: `×${edge.call_count}`,
      }))
      setNodes(rfNodes)
      setEdges(rfEdges)
    } catch (err) {
      setGraphError(err.message)
    } finally {
      setGraphLoading(false)
    }
  }

  function handleNodeClick(event, node) {
    if (!node.id.startsWith('endpoint-')) return
    const endpointId = parseInt(node.id.replace('endpoint-', ''), 10)
    setSelectedEndpoint({ id: endpointId, label: node.data.label })
  }

  return (
    <AuthGuard>
      <div>
        <RepoInput onAnalysisComplete={handleAnalysisComplete} />
        {graphError && <p>{graphError}</p>}
        {graphLoading && <p>Loading graph…</p>}
        {!graphLoading && nodes.length > 0 && (
          <DependencyGraph
            nodes={nodes}
            edges={edges}
            onNodeClick={handleNodeClick}
          />
        )}
        {selectedEndpoint && (
          <ImpactPanel
            endpointId={selectedEndpoint.id}
            endpointLabel={selectedEndpoint.label}
            onClose={() => setSelectedEndpoint(null)}
          />
        )}
      </div>
    </AuthGuard>
  )
}
