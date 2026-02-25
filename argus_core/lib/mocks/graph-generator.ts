
import {
    ReachabilityGraphData,
    ReachabilityNode,
    ReachabilityEdge
} from "@/lib/types/research";

/**
 * Deterministic Mock Generator for Reachability Graphs
 * Seed logic: simple string hash to determine graph topology.
 */

// Simple string hash for deterministic "randomness"
function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

export function generateMockGraph(sessionId: string, findingId: string): ReachabilityGraphData {
    const seed = simpleHash(sessionId + findingId);
    const nodeCount = (seed % 5) + 4; // Generate 4-8 nodes deterministicly
    const hasDatabase = seed % 2 === 0;
    const entryType = seed % 3 === 0 ? "INTERNET" : (seed % 3 === 1 ? "INTERNAL" : "CI");

    const nodes: ReachabilityNode[] = [];
    const edges: ReachabilityEdge[] = [];

    // 1. Entry Point
    nodes.push({
        id: "node-entry",
        type: "ENTRY",
        label: entryType === "INTERNET" ? "Public Internet" : (entryType === "INTERNAL" ? "Internal Network" : "CI/CD Pipeline"),
        subLabel: entryType === "INTERNET" ? "0.0.0.0/0" : "10.0.0.0/8",
        severity: null,
        status: "CONFIRMED",
        meta: { metaType: "GENERIC" }
    });

    // 2. Gateway / Load Balancer
    nodes.push({
        id: "node-gateway",
        type: "BOUNDARY",
        label: "API Gateway",
        subLabel: "nginx-ingress",
        severity: null,
        status: "CONFIRMED",
        meta: { metaType: "SERVICE", tool: "k8s" }
    });

    edges.push({
        id: "edge-entry-gateway",
        source: "node-entry",
        target: "node-gateway",
        type: "FLOWS_TO",
        confidence: "HIGH"
    });

    // 3. Main Service
    nodes.push({
        id: "node-service",
        type: "SERVICE",
        label: "Payment-Service",
        subLabel: "Java / Spring Boot",
        severity: null,
        status: "CONFIRMED",
        meta: { metaType: "SERVICE", path: "/api/v1/payment" }
    });

    edges.push({
        id: "edge-gateway-service",
        source: "node-gateway",
        target: "node-service",
        type: "FLOWS_TO",
        confidence: "HIGH"
    });

    // 4. Vulnerable Dependency (The Finding)
    nodes.push({
        id: "node-vuln-pkg",
        type: "DEPENDENCY",
        label: "log4j-core",
        subLabel: "2.14.1",
        severity: "CRITICAL",
        status: "CONFIRMED",
        meta: { metaType: "PACKAGE", ref: "pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1" }
    });

    edges.push({
        id: "edge-service-pkg",
        source: "node-service",
        target: "node-vuln-pkg",
        type: "DEPENDS_ON",
        confidence: "HIGH"
    });

    // 5. Code Location (If hash allows)
    if (seed % 3 !== 0) {
        nodes.push({
            id: "node-code",
            type: "CODE_LOCATION",
            label: "LogManager.getLogger()",
            subLabel: "PaymentController.java:42",
            severity: "HIGH",
            status: "LIKELY",
            meta: { metaType: "CODE", path: "src/main/java/com/example/PaymentController.java", line: 42 }
        });

        edges.push({
            id: "edge-pkg-code",
            source: "node-vuln-pkg",
            target: "node-code",
            type: "LOCATED_IN",
            confidence: "MEDIUM"
        });
    }

    // 6. Database (Conditional)
    if (hasDatabase) {
        nodes.push({
            id: "node-db",
            type: "SERVICE",
            label: "Payment-DB",
            subLabel: "PostgreSQL 13",
            severity: null,
            status: "UNKNOWN",
            meta: { metaType: "SERVICE" }
        });

        edges.push({
            id: "edge-service-db",
            source: "node-service",
            target: "node-db",
            type: "FLOWS_TO",
            confidence: "LOW"
        });
    }

    return {
        version: "1.0",
        graphBuildVersion: "v0.1.0-mock",
        findingRef: { sessionId, findingId },
        createdAt: Date.now(),
        criticalPath: ["node-entry", "node-gateway", "node-service", "node-vuln-pkg", "node-code"],
        nodes,
        edges,
        selectedNodeId: null
    };
}
