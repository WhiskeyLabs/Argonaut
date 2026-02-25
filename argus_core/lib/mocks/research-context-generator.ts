/**
 * Research Context Mock Generator
 * Creates deterministic ResearchContext, FindingRisk, and FixRecommendation based on findingId.
 *
 * Updated for Task 4.3 — uses the new structured ResearchContext shape.
 */
import {
    ResearchContext,
    FindingRisk,
    FixRecommendation,
    NormalizedSeverity,
    NormalizedStatus,
} from '../types/research';

function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function generateMockResearchContext(sessionId: string, findingId: string): ResearchContext {
    const seed = simpleHash(findingId);
    const severities: NormalizedSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
    const statuses: NormalizedStatus[] = ["OPEN", "IGNORED", "FIXED"];

    // Bias toward CRITICAL/HIGH and OPEN for demo effect
    const severityIdx = seed % 3 < 2 ? seed % 2 : (seed % 5);
    const severity = severities[severityIdx];
    const tool = seed % 2 === 0 ? "Semgrep" : "Trivy";
    const cveId = seed % 2 === 0 ? "CVE-2022-22947" : "CVE-2021-44228";
    const packageName = seed % 2 === 0 ? "spring-cloud-gateway" : "log4j-core";

    return {
        // Structured blocks
        identity: {
            tool,
            ruleId: cveId,
            normalizedSeverity: severity,
            cveId,
            packageName,
            packageVersion: seed % 2 === 0 ? "3.1.0" : "2.14.1",
        },
        location: {
            path: seed % 2 === 0 ? "src/main/java/Gateway.java" : "src/main/java/Logger.java",
            startLine: 42 + (seed % 20),
            endLine: 45 + (seed % 20),
        },
        snippet: {
            raw: null,
            normalized: null,
        },
        meta: {
            sessionId,
            findingId,
            ingestionTimestamp: Date.now() - (seed % 12) * 3600000,
            toolVersion: null,
        },
        availability: {
            hasSnippet: false,
            hasEndLine: true,
            hasCve: true,
            hasPackage: true,
            hasLockfile: false,
        },

        // Provenance
        input_hash: `mock-hash-${seed.toString(16)}`,

        // Backward-compat display fields
        title: seed % 2 === 0 ? "API Gateway: Path Traversal" : "Log4j Remote Code Execution",
        severity,
        status: statuses[0], // Always OPEN for demo
        tool,
        cve: cveId,
        packageName,
        stableHash: `hash-${seed.toString(16)}`,

        // Mock does not hydrate event streams in research context.
    };
}

export function generateMockFindingRisk(findingId: string): FindingRisk {
    const seed = simpleHash(findingId);
    const severities: FindingRisk["severityLabel"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
    const reachabilities: FindingRisk["reachability"][] = ["CONFIRMED", "LIKELY", "UNKNOWN", "UNREACHABLE"];

    return {
        severityScore: 8.0 + (seed % 20) / 10, // 8.0 - 9.9 for dramatic effect
        severityLabel: severities[seed % 2], // CRITICAL or HIGH
        reachability: reachabilities[0], // CONFIRMED for demo
        exploitability: "KNOWN_EXPLOIT" as const,
        confidence: 90 + (seed % 8), // 90-98%
    };
}

export function generateMockFixRecommendation(findingId: string): FixRecommendation {
    const seed = simpleHash(findingId);

    // Spring Cloud Gateway fix
    if (seed % 2 === 0) {
        return {
            id: `fix-${seed}`,
            type: "Upgrade",
            summary: "Upgrade spring-cloud-gateway to patched version",
            patch: {
                before: `<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-webflux</artifactId>
  <version>2.7.0</version>
</dependency>`,
                after: `<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-webflux</artifactId>
  <version>3.1.5</version>
</dependency>`,
            },
            source: {
                type: "CVE_ADVISORY",
                ref: "GHSA-2022-22947",
            },
            confidence: 95,
        };
    }

    // Log4j fix
    return {
        id: `fix-${seed}`,
        type: "Upgrade",
        summary: "Upgrade log4j-core to 2.17.1 or later",
        patch: {
            before: `<dependency>
  <groupId>org.apache.logging.log4j</groupId>
  <artifactId>log4j-core</artifactId>
  <version>2.14.1</version>
</dependency>`,
            after: `<dependency>
  <groupId>org.apache.logging.log4j</groupId>
  <artifactId>log4j-core</artifactId>
  <version>2.17.1</version>
</dependency>`,
        },
        source: {
            type: "CVE_ADVISORY",
            ref: "CVE-2021-44228",
        },
        confidence: 98,
    };
}
