import { ReachabilityResult, DependencyGraphViewModel, ReachabilityNode } from '../types/reachability';
import { ResearchContext } from '../types/research';

/**
 * Service to transform raw ReachabilityResult into a high-fidelity 
 * DependencyGraphViewModel for the Research Page.
 */
export class GraphViewModelService {
    /**
     * Maps raw reachability data and finding context into the high-fidelity ViewModel.
     */
    static mapResultToViewModel(
        result: ReachabilityResult,
        context: ResearchContext
    ): DependencyGraphViewModel {
        const { graph, evidence } = result;

        // 1. Identify Vulnerable Node
        const vulnerableNode = graph.nodes.find(n => n.type === 'VULNERABLE_PACKAGE');
        const vulnerableNodeId = vulnerableNode?.id || '';

        // 2. Identify Selected Path Node IDs
        // Nodes are on the selected path if they have a pathDepth in the raw evidence
        const selectedPathNodeIds = graph.nodes
            .filter(n => n.evidence?.pathDepth !== undefined)
            .map(n => n.id);

        // 3. Map Nodes with High-Fidelity Metadata
        const enrichedNodes = graph.nodes.map(node => {
            const isVulnerable = node.id === vulnerableNodeId;
            const isOnSelectedPath = selectedPathNodeIds.includes(node.id);

            return {
                ...node,
                packageName: node.label, // Currently node.label is the package name
                version: node.evidence?.version,
                pathDepth: node.evidence?.pathDepth,
                isOnSelectedPath,

                // Add finding info for the vulnerable node
                ...(isVulnerable && {
                    finding: {
                        advisoryId: context.identity.cveId || context.identity.ruleId,
                        severity: context.identity.normalizedSeverity,
                        fixVersions: context.fixAction === 'upgrade_libraries' ? [context.fixActionLabel || 'latest'] : undefined
                    }
                })
            } as ReachabilityNode;
        });

        // 4. Map Edges with Relationship Meta
        const enrichedEdges = graph.edges.map(edge => {
            const sourceNode = graph.nodes.find(n => n.id === edge.source);
            const targetNode = graph.nodes.find(n => n.id === edge.target);
            const relationship: 'DIRECT' | 'TRANSITIVE' = sourceNode?.type === 'PROJECT_ROOT' ? 'DIRECT' : 'TRANSITIVE';

            // Edge is part of the path if both endpoints are on the path
            const isPath = (sourceNode?.evidence?.pathDepth !== undefined) && (targetNode?.evidence?.pathDepth !== undefined);

            return {
                ...edge,
                relationship,
                isPath
            };
        });

        // 5. Compute Stats
        const stats = {
            pathLength: selectedPathNodeIds.length,
            maxDepth: Math.max(...graph.nodes.map(n => n.evidence?.pathDepth || 0), 0),
            totalNodes: graph.nodes.length,
            impactRadiusCount: graph.nodes.length
        };

        // 6. Determine Verification Signal
        let verifiedBy: DependencyGraphViewModel['metadata']['verifiedBy'] = 'UNKNOWN';
        if (evidence.lockfilePresent) {
            verifiedBy = evidence.lockfileVersion === 2 ? 'LOCKFILE_V2' :
                evidence.lockfileVersion === 3 ? 'LOCKFILE_V3' : 'INFERRED';
        }

        return {
            nodes: enrichedNodes,
            edges: enrichedEdges as any,
            metadata: {
                vulnerableNodeId,
                selectedPathNodeIds,
                verifiedBy,
                stats
            }
        };
    }

    /**
     * Compute the "Nearest Direct Parent" for a given node.
     */
    static getNearestDirectParent(nodeId: string, viewModel: DependencyGraphViewModel): string | null {
        // Find the node in the view model
        const node = viewModel.nodes.find(n => n.id === nodeId);
        if (!node || node.type === 'PROJECT_ROOT') return null;
        if (node.type === 'DIRECT') return node.id;

        // In the full graph, we might have multiple paths. 
        // For simplicity in the inspector, we find the one on the "selected path"
        const directParentOnPath = viewModel.nodes.find(n => n.type === 'DIRECT' && n.isOnSelectedPath);
        return directParentOnPath?.id || null;
    }
}
