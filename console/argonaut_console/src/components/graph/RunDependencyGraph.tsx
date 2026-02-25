"use client";

import React, { useCallback, useMemo, useState } from "react";
import ReactFlow, {
    Node,
    Edge,
    Background,
    Controls,
    useNodesState,
    useEdgesState,
    MarkerType,
    NodeMouseHandler,
    useReactFlow,
    ReactFlowProvider,
    ControlButton,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { Package, Home, Activity, Target, Layers, LayoutPanelLeft, AlertTriangle } from "lucide-react";

interface GraphNode {
    id: string;
    type: string;
    label: string;
    data: any;
}

interface GraphEdge {
    id: string;
    source: string;
    target: string;
    type: string;
}

interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    stats: any;
}

interface RunDependencyGraphProps {
    data: GraphData;
    onNodeClick?: (nodeId: string) => void;
}

const nodeWidth = 220;
const nodeHeight = 80;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: "TB" });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };
        return node;
    });

    return { nodes: layoutedNodes, edges };
};

function RunDependencyGraphInner({ data, onNodeClick }: RunDependencyGraphProps) {
    const { nodes: graphNodes, edges: graphEdges, stats } = data;
    const { fitView } = useReactFlow();

    // Convert Data Contract -> ReactFlow Schema
    const initialNodes: Node[] = useMemo(() => graphNodes.map((node) => {
        const isFinding = node.type === 'finding';
        const isApp = node.type === 'application';

        return {
            id: node.id,
            type: "default",
            data: {
                label: (
                    <div className="flex flex-col items-center gap-1.5 group relative pt-1" title={node.label}>
                        {isFinding && (
                            <div className="absolute -top-3 px-2 py-0.5 bg-red-500 text-white text-[8px] font-black rounded-full shadow-sm uppercase tracking-wider animate-pulse">
                                Finding
                            </div>
                        )}
                        <div className={`p-1.5 rounded-lg border transition-colors shadow-sm mb-0.5
                            ${isFinding
                                ? 'bg-red-100 border-red-200 dark:bg-red-900/40 dark:border-red-800'
                                : isApp
                                    ? 'bg-emerald-100 border-emerald-200 dark:bg-emerald-900/40 dark:border-emerald-800'
                                    : 'bg-white/50 dark:bg-black/20 border-gray-100 dark:border-white/5 group-hover:border-primary-300'}`}>
                            {isApp ? (
                                <Home className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : isFinding ? (
                                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            ) : (
                                <Package className={`h-4 w-4 text-gray-400 group-hover:text-primary-500`} />
                            )}
                        </div>
                        <div className={`font-bold text-[11px] truncate px-2 max-w-full text-center
                            ${isFinding ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                            {node.label}
                        </div>
                        <div className="text-[9px] opacity-60 truncate px-2 font-mono">
                            {node.data?.version || ''}
                        </div>
                    </div>
                )
            },
            position: { x: 0, y: 0 },
            className: `
                w-[180px] rounded-2xl border text-xs shadow-md transition-all duration-300 hover:scale-105 active:scale-95
                ${isFinding
                    ? 'border-red-400 dark:border-red-700 bg-red-50/90 dark:bg-red-900/30 ring-4 ring-red-500/10'
                    : isApp
                        ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20'
                        : 'border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/90'}
            `,
            style: { width: 180, borderRadius: '16px' },
        };
    }), [graphNodes]);

    const initialEdges: Edge[] = useMemo(() => graphEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "step",
        animated: edge.type === 'impact',
        style: {
            stroke: edge.type === 'impact' ? '#ef4444' : '#94a3b8',
            strokeWidth: edge.type === 'impact' ? 2 : 1,
            opacity: 1
        },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edge.type === 'impact' ? '#ef4444' : '#94a3b8'
        },
    })), [graphEdges]);

    const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
        () => getLayoutedElements(initialNodes, initialEdges),
        [initialNodes, initialEdges]
    );

    const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
    const [edges, , onEdgesChange] = useEdgesState(layoutedEdges);

    React.useEffect(() => {
        if (nodes.length > 0) {
            fitView({ padding: 0.2, duration: 800 });
        }
    }, [nodes, fitView]);

    return (
        <div className="relative w-full h-full bg-neutral-950/20 rounded-xl overflow-hidden border border-white/5">
            <div className="absolute top-4 left-4 z-10 flex gap-4 text-[10px] font-mono text-neutral-500 bg-black/50 px-3 py-1.5 rounded-lg border border-white/10 backdrop-blur-sm">
                <div className="flex gap-1.5">
                    <span className="opacity-50">NODES:</span>
                    <span className="font-bold text-neutral-300">{stats?.totalNodes || graphNodes.length}</span>
                </div>
                <div className="flex gap-1.5">
                    <span className="opacity-50">EDGES:</span>
                    <span className="font-bold text-neutral-300">{stats?.totalEdges || graphEdges.length}</span>
                </div>
                {stats?.cappedNodes && (
                    <div className="text-amber-500 font-bold ml-2">CAPPED</div>
                )}
            </div>

            <ReactFlow
                nodes={layoutedNodes}
                edges={layoutedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(e, node) => onNodeClick?.(node.id)}
                fitView
                minZoom={0.2}
            >
                <Background gap={16} size={1} className="[&>circle]:fill-white/5" />
                <Controls className="!bg-neutral-900 !border-white/10 !fill-white">
                </Controls>
            </ReactFlow>
        </div>
    );
}

export default function RunDependencyGraph(props: RunDependencyGraphProps) {
    return (
        <ReactFlowProvider>
            <RunDependencyGraphInner {...props} />
        </ReactFlowProvider>
    );
}
