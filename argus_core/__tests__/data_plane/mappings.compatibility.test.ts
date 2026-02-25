import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    getFieldType,
    getIndexContract,
    validateDocumentAgainstIndex,
} from '../../lib/data_plane/mappings';

type FindingDoc = Record<string, unknown>;

describe('mapping compatibility against EPIC 1 artifacts', () => {
    it('accepts EPIC 1 sample documents for findings/dependencies/reachability/explanations', () => {
        const findingsPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_1/normalized_findings.sample.json',
        );
        const dependenciesPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_2/dependency_edges.sample.json',
        );
        const reachabilityPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_4/reachability_result.sample.json',
        );
        const explanationPath = join(
            process.cwd(),
            '../program_management/epics/epic_1_argus_core_extraction_stabilization/tasks/artifacts/task_1_5/priority_explanation.sample.json',
        );

        const findings = JSON.parse(readFileSync(findingsPath, 'utf8')) as FindingDoc[];
        const dependencies = JSON.parse(readFileSync(dependenciesPath, 'utf8')) as Record<string, unknown>[];
        const reachability = JSON.parse(readFileSync(reachabilityPath, 'utf8')) as Record<string, unknown>;
        const explanation = JSON.parse(readFileSync(explanationPath, 'utf8')) as Record<string, unknown>;

        const findingsWithExplanation = findings.map((finding, index) => (
            index === 0
                ? {
                    ...finding,
                    priorityExplanation: explanation,
                }
                : finding
        ));

        for (const finding of findingsWithExplanation) {
            expect(validateDocumentAgainstIndex('argonaut_findings', finding).ok).toBe(true);
        }

        for (const edge of dependencies) {
            expect(validateDocumentAgainstIndex('argonaut_dependencies', edge).ok).toBe(true);
        }

        expect(validateDocumentAgainstIndex('argonaut_reachability', reachability).ok).toBe(true);
    });

    it('rejects unknown fields under strict mappings', () => {
        const result = validateDocumentAgainstIndex('argonaut_findings', {
            findingId: 'f-1',
            repo: 'payment-service',
            buildId: '128',
            ruleId: 'RULE-1',
            severity: 'HIGH',
            fingerprint: 'abc',
            createdAt: 1700000000000,
            unknownField: 'not-allowed',
        });

        expect(result.ok).toBe(false);
        expect(result.issues.some((issue) => issue.code === 'UNKNOWN_FIELD')).toBe(true);
    });

    it('allows unknown fields under dynamic:false workflow indices', () => {
        const artifactsResult = validateDocumentAgainstIndex('argonaut_artifacts', {
            artifactId: 'a-1',
            repo: 'payment-service',
            buildId: '128',
            type: 'sarif',
            sourceTool: 'semgrep',
            timestamp: 1700000000000,
            extraMeta: 'allowed-by-dynamic-false',
        });

        const actionsResult = validateDocumentAgainstIndex('argonaut_actions', {
            actionId: 'act-1',
            status: 'dry_run',
            createdAt: 1700000000000,
            anythingElse: 5,
        });

        expect(artifactsResult.ok).toBe(true);
        expect(actionsResult.ok).toBe(true);
    });

    it('rejects type coercion attempts in strict mapping checks', () => {
        const result = validateDocumentAgainstIndex('argonaut_findings', {
            findingId: 'f-2',
            repo: 'payment-service',
            buildId: '128',
            ruleId: 'RULE-2',
            severity: 'MEDIUM',
            fingerprint: 'def',
            lineNumber: '42',
            createdAt: 1700000000000,
        });

        expect(result.ok).toBe(false);
        expect(result.issues.some((issue) => issue.code === 'TYPE_MISMATCH')).toBe(true);
    });

    it('retains mapping shape (no dynamic expansion) after validation runs', () => {
        const contractBefore = JSON.stringify(getIndexContract('argonaut_findings').mappings);

        validateDocumentAgainstIndex('argonaut_findings', {
            findingId: 'f-3',
            repo: 'payment-service',
            buildId: '128',
            ruleId: 'RULE-3',
            severity: 'LOW',
            fingerprint: 'ghi',
            createdAt: 1700000000000,
            unknown: 'rejected',
        });

        const contractAfter = JSON.stringify(getIndexContract('argonaut_findings').mappings);
        expect(contractAfter).toBe(contractBefore);
    });

    it('passes ES|QL join compatibility smoke checks on join and score fields', () => {
        const findings = getIndexContract('argonaut_findings');
        const threat = getIndexContract('argonaut_threatintel');
        const reachability = getIndexContract('argonaut_reachability');

        expect(getFieldType(findings, 'cve')).toBe('keyword');
        expect(getFieldType(threat, 'cve')).toBe('keyword');

        expect(getFieldType(findings, 'findingId')).toBe('keyword');
        expect(getFieldType(reachability, 'findingId')).toBe('keyword');

        expect(getFieldType(reachability, 'confidenceScore')).toBe('float');
        expect(getFieldType(threat, 'epssScore')).toBe('float');
        expect(getFieldType(findings, 'priorityExplanation.factors.blastRadius')).toBe('integer');
    });
});
