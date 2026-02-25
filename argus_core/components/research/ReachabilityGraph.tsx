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
import { DependencyGraphViewModel } from "@/lib/types/reachability";
import { ShieldCheck, HelpCircle, AlertTriangle, Package, Home, Activity, Target, Layers, LayoutPanelLeft } from "lucide-react";

interface ReachabilityGraphProps {
    data: DependencyGraphViewModel;
    onNodeClick?: (nodeId: string) => void;
}

const nodeWidth = 220;
const nodeHeight = 80;

/**
 * Auto-layout Graph using Dagre
 * Direction: TB (Top-Bottom)
 */
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
        // Dagre returns center coords, ReactFlow needs top-left
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };
        return node;
    });

    return { nodes: layoutedNodes, edges };
};

function ReachabilityGraphInner({ data, onNodeClick }: ReachabilityGraphProps) {
    const { nodes: graphNodes, edges: graphEdges, metadata } = data;
    const { fitView, setCenter } = useReactFlow();
    const [showImpactRadius, setShowImpactRadius] = useState(false);

    // Filter nodes/edges based on showImpactRadius
    const filteredNodes = useMemo(() => {
        if (showImpactRadius) return graphNodes;
        return graphNodes.filter(n => n.isOnSelectedPath);
    }, [graphNodes, showImpactRadius]);

    const filteredEdges = useMemo(() => {
        if (showImpactRadius) return graphEdges;
        return graphEdges.filter(e => e.isPath);
    }, [graphEdges, showImpactRadius]);

    // Convert Data Contract -> ReactFlow Schema
    const initialNodes: Node[] = useMemo(() => filteredNodes.map((node) => {
        const isVulnerable = node.type === 'VULNERABLE_PACKAGE';
        const isRoot = node.type === 'PROJECT_ROOT';
        const isEntryPoint = node.type === 'ENTRY_POINT';

        return {
            id: node.id,
            type: "default",
            data: {
                label: (
                    <div className="flex flex-col items-center gap-1.5 group relative pt-1" title={`${node.packageName}@${node.version || '*'}`}>
                        {isVulnerable && (
                            <div className="absolute -top-3 px-2 py-0.5 bg-red-500 text-white text-[8px] font-black rounded-full shadow-sm uppercase tracking-wider animate-pulse">
                                Vulnerable
                            </div>
                        )}
                        <div className={`p-1.5 rounded-lg border transition-colors shadow-sm mb-0.5
                            ${isVulnerable
                                ? 'bg-red-100 border-red-200 dark:bg-red-900/40 dark:border-red-800'
                                : isRoot
                                    ? 'bg-emerald-100 border-emerald-200 dark:bg-emerald-900/40 dark:border-emerald-800'
                                    : isEntryPoint
                                        ? 'bg-sky-100 border-sky-200 dark:bg-sky-900/40 dark:border-sky-800'
                                        : 'bg-white/50 dark:bg-black/20 border-gray-100 dark:border-white/5 group-hover:border-primary-300'}`}>
                            {isRoot ? (
                                <Home className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            ) : isEntryPoint ? (
                                <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                            ) : (
                                <Package className={`h-4 w-4 ${isVulnerable ? 'text-red-500' : 'text-gray-400 group-hover:text-primary-500'}`} />
                            )}
                        </div>
                        <div className={`font-bold text-[11px] truncate px-2 max-w-full text-center
                            ${isVulnerable ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                            {node.label}
                        </div>
                        <div className="text-[9px] opacity-60 truncate px-2 font-mono">
                            {node.version || '*'}
                        </div>
                    </div>
                )
            },
            position: { x: 0, y: 0 },
            className: `
                w-[180px] rounded-2xl border text-xs shadow-md transition-all duration-300 hover:scale-105 active:scale-95
                ${isVulnerable
                    ? 'border-red-400 dark:border-red-700 bg-red-50/90 dark:bg-red-900/30 ring-4 ring-red-500/10 animate-subtle-pulse'
                    : isRoot
                        ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20'
                        : isEntryPoint
                            ? 'border-dashed border-sky-400 dark:border-sky-700 bg-sky-50/40'
                            : 'border-slate-200 dark:border-white/10 bg-white/90 dark:bg-slate-900/90'}
            `,
            style: { width: 180, borderRadius: '16px' },
        };
    }), [filteredNodes]);

    const initialEdges: Edge[] = useMemo(() => filteredEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: (edge.relationship === 'DIRECT' || edge.isPath) ? '' : 'transitive',
        labelStyle: { fill: "#94a3b8", fontSize: 9, fontWeight: 500 },
        type: "step",
        animated: edge.isPath,
        style: {
            stroke: edge.isPath ? (metadata.verifiedBy.startsWith('LOCKFILE') ? '#10b981' : '#3b82f6') : '#94a3b8',
            strokeWidth: edge.isPath ? 2 : 1,
            opacity: edge.isPath ? 1 : 0.6
        },
        markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edge.isPath ? (metadata.verifiedBy.startsWith('LOCKFILE') ? '#10b981' : '#3b82f6') : '#94a3b8'
        },
    })), [filteredEdges, metadata.verifiedBy]);

    // Apply Layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
        () => getLayoutedElements(initialNodes, initialEdges),
        [initialNodes, initialEdges]
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

    // Update state when layout changes (filtering toggled)
    React.useEffect(() => {
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

    const onNodeClickCallback: NodeMouseHandler = useCallback((event, node) => {
        if (onNodeClick) onNodeClick(node.id);
    }, [onNodeClick]);

    const focusVulnerable = useCallback(() => {
        const vulnNode = nodes.find(n => n.id === metadata.vulnerableNodeId);
        if (vulnNode) {
            setCenter(vulnNode.position.x + nodeWidth / 2, vulnNode.position.y + nodeHeight / 2, { zoom: 1.2, duration: 1000 });
        }
    }, [nodes, metadata.vulnerableNodeId, setCenter]);

    // Auto-fit path on mount or data change
    React.useEffect(() => {
        if (nodes.length > 0) {
            const pathNodeIds = metadata.selectedPathNodeIds;
            fitView({
                nodes: nodes.filter(n => pathNodeIds.includes(n.id)),
                padding: 0.2,
                duration: 800
            });
        }
    }, [nodes, metadata.selectedPathNodeIds, fitView, showImpactRadius]);

    // Badge Logic
    const StatusBadge = () => {
        const isVerified = metadata.verifiedBy.startsWith('LOCKFILE');
        return (
            <div className={`absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm backdrop-blur-sm border
                ${isVerified
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}
            >
                {isVerified ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                    <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
                <span className={`text-xs font-bold ${isVerified ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                    {isVerified ? `VERIFIED BY ${metadata.verifiedBy.replace('LOCKFILE_', '')}` : 'INFERRED PATH'}
                </span>
            </div>
        );
    };

    return (
        <div className="relative w-full h-full bg-slate-50 dark:bg-slate-950 transition-colors">
            <StatusBadge />

            {/* Analysis Stats Row */}
            <div className="absolute top-4 left-4 z-10 flex gap-4 text-[10px] font-mono text-slate-500 bg-white/50 dark:bg-black/50 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 backdrop-blur-sm">
                <div className="flex gap-1.5">
                    <span className="opacity-50">PATH:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{metadata.stats.pathLength} nodes</span>
                </div>
                <div className="flex gap-1.5">
                    <span className="opacity-50">CONTEXT:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{metadata.stats.totalNodes} parents</span>
                </div>
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClickCallback}
                fitView
                minZoom={0.2}
            >
                <Background gap={16} size={1} className="[&>circle]:fill-slate-200 dark:[&>circle]:fill-slate-800" />
                <Controls className="!bg-white dark:!bg-slate-800 !border-slate-200 dark:!border-slate-700 [&>button]:!border-slate-200 dark:[&>button]:!border-slate-700 [&>button]:!fill-slate-600 dark:[&>button]:!fill-slate-400">
                    <ControlButton onClick={focusVulnerable} title="Focus Vulnerable Node">
                        <Target className="h-4 w-4" />
                    </ControlButton>
                    <ControlButton
                        onClick={() => setShowImpactRadius(!showImpactRadius)}
                        title={showImpactRadius ? "Show Primary Path Only" : "Show Full Context (Impact Radius)"}
                        className={showImpactRadius ? "!bg-primary-50 dark:!bg-primary-900/20" : ""}
                    >
                        {showImpactRadius ? <LayoutPanelLeft className="h-4 w-4 text-primary" /> : <Layers className="h-4 w-4" />}
                    </ControlButton>
                </Controls>
            </ReactFlow>
        </div>
    );
}

export default function ReachabilityGraph(props: ReachabilityGraphProps) {
    return (
        <ReactFlowProvider>
            <ReachabilityGraphInner {...props} />
        </ReactFlowProvider>
    );
}
