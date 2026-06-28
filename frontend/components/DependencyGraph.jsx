'use client'
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: '#29447e', strokeWidth: 1.5 },
  labelStyle: { fill: '#8a8a8a', fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, monospace' },
  labelBgStyle: { fill: '#000000', fillOpacity: 0.85 },
  labelBgPadding: [5, 3],
}

export default function DependencyGraph({ nodes, edges, onNodeClick }) {
  return (
    <div style={{ width: '100%', height: '100%', background: '#000000' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background color="#29447e" gap={28} size={1} variant="dots" />
        <Controls />
        <MiniMap
          nodeColor={(node) =>
            node.style?.borderColor === '#fca311' ? '#fca311' : '#29447e'
          }
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  )
}
