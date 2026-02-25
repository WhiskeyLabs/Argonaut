'use client';

import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Position,
    ConnectionLineType,
    useNodesState,
    useEdgesState,
    MarkerType,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import { ReachabilityResult, ReachabilityNode, ReachabilityEdge } from '@/lib/types/reachability';

interface DependencyGraphProps {
    data: Pick<ReachabilityResult, 'graph'>;
    direction?: 'TB' | 'LR';
}

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 180;
const nodeHeight = 50;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = direction === 'LR' ? Position.Left : Position.Top;
        node.sourcePosition = direction === 'LR' ? Position.Right : Position.Bottom;

        // We are shifting the dagre node position (anchor=center center) to the top left
        // so it matches the React Flow node anchor point (top left).
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };

        return node;
    });

    return { nodes, edges };
};

export function DependencyGraph({ data, direction = 'LR' }: DependencyGraphProps) {
    // Transform ReachabilityResult to ReactFlow Elements
    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
        if (!data || !data.graph) return { nodes: [], edges: [] };

        const rfNodes: Node[] = data.graph.nodes.filter(n => n.type !== 'ENTRY_SURFACE_PLACEHOLDER').map((n) => ({
            id: n.id,
            type: n.type === 'VULNERABLE_PACKAGE' ? 'output' : 'default', // simple mapping for shape
            data: { label: n.label + (n.subLabel ? `\n${n.subLabel}` : '') },
            position: { x: 0, y: 0 }, // layout will fix this
            style: {
                background: n.type === 'VULNERABLE_PACKAGE' ? '#FEE2E2' : n.type === 'PROJECT_ROOT' ? '#D1FAE5' : '#fff',
                border: n.type === 'VULNERABLE_PACKAGE' ? '1px solid #EF4444' : n.type === 'PROJECT_ROOT' ? '1px solid #10B981' : '1px solid #E5E7EB',
                borderRadius: '8px',
                color: '#374151',
                fontSize: '12px',
                fontWeight: n.type === 'PROJECT_ROOT' || n.type === 'VULNERABLE_PACKAGE' ? '600' : '400',
                width: nodeWidth,
                padding: '10px',
                textAlign: 'center',
            }
        }));

        const rfEdges: Edge[] = data.graph.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'smoothstep',
            animated: true,
            markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
                color: '#9CA3AF',
            },
            style: {
                stroke: '#9CA3AF',
            },
        }));

        return getLayoutedElements(rfNodes, rfEdges, direction);
    }, [data, direction]);

    // ReactFlow hooks manage internal state, but we compute initial layout memoized above
    // Ideally we should use useEffect to update nodes when data changes, but for simplicity:
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // If data changes, update layout
    React.useEffect(() => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            initialNodes,
            initialEdges,
            direction
        );
        setNodes([...layoutedNodes]);
        setEdges([...layoutedEdges]);
    }, [initialNodes, initialEdges, direction, setNodes, setEdges]);

    if (!data.graph.nodes.length) {
        return (
            <div className="flex h-full w-full items-center justify-center bg-gray-50/50 dark:bg-white/5 rounded-xl border border-dashed border-gray-200 dark:border-white/10 p-8 text-sm text-gray-500">
                No graph data available.
            </div>
        );
    }

    return (
        <div style={{ height: 300, width: '100%' }} className="rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-gray-900/50 overflow-hidden">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                attributionPosition="bottom-right"
            // proOptions={{ hideAttribution: true }} // If using Pro
            >
                {/* Controls and Background can be added here if needed */}
            </ReactFlow>
        </div>
    );
}
