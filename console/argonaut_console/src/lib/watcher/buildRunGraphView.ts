import { Client } from '@elastic/elasticsearch';

const INDEX_SBOM = 'argonaut_sbom';
const INDEX_DEPENDENCIES = 'argonaut_dependencies';
const INDEX_FINDINGS = 'argonaut_findings';
const INDEX_GRAPH_VIEWS = 'argonaut_graph_views';

const MAX_NODES = 250;
const MAX_EDGES = 500;

function stableSortString(a: string, b: string): number {
    return a.localeCompare(b);
}

export async function buildRunGraphView(esClient: Client, bundleId: string, runId: string, repo: string) {
    // 1. Fetch SBOM components
    const sbomRes = await esClient.search({
        index: INDEX_SBOM,
        size: 10000,
        query: { term: { runId } }
    });
    const components = (sbomRes.hits.hits || []).map(h => h._source as any);

    // 2. Fetch Dependencies
    const depsRes = await esClient.search({
        index: INDEX_DEPENDENCIES,
        size: 10000,
        query: { term: { runId } }
    });
    const dependencies = (depsRes.hits.hits || []).map(h => h._source as any);

    // 3. Fetch Findings (CVEs)
    const findingsRes = await esClient.search({
        index: INDEX_FINDINGS,
        size: 10000,
        query: { term: { runId } }
    });
    const findings = (findingsRes.hits.hits || []).map(h => h._source as any);

    // BUILD GRAPH
    const nodesMap = new Map<string, any>();
    const edgesList: any[] = [];

    // Add Application Root node
    const rootNodeId = `app:${repo}`;
    nodesMap.set(rootNodeId, {
        id: rootNodeId,
        type: 'application',
        label: repo,
        data: {
            name: repo,
            type: 'application'
        }
    });

    // Add Component nodes
    for (const comp of components) {
        const nodeId = `pkg:${comp.ecosystem || 'unknown'}/${comp.package}@${comp.version}`;
        nodesMap.set(nodeId, {
            id: nodeId,
            type: 'package',
            label: comp.package,
            data: {
                name: comp.package,
                version: comp.version,
                ecosystem: comp.ecosystem,
                type: 'package'
            }
        });
    }

    // Add Finding nodes
    for (const finding of findings) {
        const nodeId = `cve:${finding.ruleId}`;
        if (!nodesMap.has(nodeId)) {
            nodesMap.set(nodeId, {
                id: nodeId,
                type: 'vulnerability',
                label: finding.ruleId,
                data: {
                    name: finding.ruleId,
                    severity: finding.severity,
                    type: 'vulnerability'
                }
            });
        }
    }

    // Build Edges
    // 1. App -> Dependencies
    const rootDeps = dependencies.filter(d => d.depth === 1 || d.parentName === '__root__');
    for (const dep of rootDeps) {
        const rawComp = components.find(c => c.package === dep.childName && c.version === dep.version);
        if (rawComp) {
            const childId = `pkg:${rawComp.ecosystem || 'unknown'}/${rawComp.package}@${rawComp.version}`;
            edgesList.push({
                source: rootNodeId,
                target: childId,
                type: 'depends_on',
                id: `e_${rootNodeId}_${childId}`
            });
        }
    }

    // 2. Transitive Dependencies
    const transDeps = dependencies.filter(d => d.depth > 1 && d.parentName !== '__root__');
    for (const dep of transDeps) {
        // Find parent component
        const rawParent = components.find(c => c.package === dep.parentName);
        const rawChild = components.find(c => c.package === dep.childName && c.version === dep.version);

        if (rawParent && rawChild) {
            const parentId = `pkg:${rawParent.ecosystem || 'unknown'}/${rawParent.package}@${rawParent.version}`;
            const childId = `pkg:${rawChild.ecosystem || 'unknown'}/${rawChild.package}@${rawChild.version}`;
            edgesList.push({
                source: parentId,
                target: childId,
                type: 'depends_on',
                id: `e_${parentId}_${childId}`
            });
        }
    }

    // 3. Component -> Finding
    for (const finding of findings) {
        const cveId = `cve:${finding.ruleId}`;
        const rawPackage = components.find(c => c.package === finding.package && c.version === finding.version);
        if (rawPackage) {
            const pkgId = `pkg:${rawPackage.ecosystem || 'unknown'}/${rawPackage.package}@${rawPackage.version}`;
            edgesList.push({
                source: pkgId,
                target: cveId,
                type: 'has_vulnerability',
                id: `e_${pkgId}_${cveId}`
            });
        }
    }

    // DETERMINISTIC SORTING & CAPPING
    let nodes = Array.from(nodesMap.values());
    nodes.sort((a, b) => stableSortString(a.id, b.id));
    nodes = nodes.slice(0, MAX_NODES);

    let edges = edgesList;
    edges.sort((a, b) => {
        if (a.source !== b.source) return stableSortString(a.source, b.source);
        if (a.target !== b.target) return stableSortString(a.target, b.target);
        return stableSortString(a.type, b.type);
    });
    edges = edges.slice(0, MAX_EDGES);

    // Filter edges to only include nodes that exist
    const activeNodeIds = new Set(nodes.map(n => n.id));
    edges = edges.filter(e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));

    const crypto = await import('crypto');
    const docId = crypto.createHash('sha256').update(`${runId}:run_graph`).digest('hex');

    const graphViewDoc = {
        runId,
        bundleId,
        repo,
        createdAt: new Date().toISOString(),
        graphVersion: "1.0",
        nodes,
        edges,
        stats: {
            totalNodes: nodes.length,
            totalEdges: edges.length,
            cappedNodes: nodesMap.size > MAX_NODES,
            cappedEdges: edgesList.length > MAX_EDGES
        }
    };

    console.log(`[GRAPH] Graph generated for run ${runId} - Nodes: ${nodes.length}, Edges: ${edges.length}`);

    await esClient.index({
        index: INDEX_GRAPH_VIEWS,
        id: docId,
        document: graphViewDoc
    });

    return {
        nodes: nodes.length,
        edges: edges.length
    };
}
