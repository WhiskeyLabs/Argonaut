import esClient from './esClient';
import { TaskLogger } from './taskLogger';
import { buildFixInput } from '@argus_core/lib/types/fix';
import { computeStableHash } from '@argus_core/lib/utils/hashing';

const INDEX_ACTIONS = 'argonaut_actions';
const INDEX_FINDINGS = 'argonaut_findings';

export interface FixBundleAction {
    actionType: 'FIX_BUNDLE';
    runId: string;
    findingId: string;
    findingIds: string[];
    status: 'CREATED' | 'EXISTS' | 'FAILED';
    payload: {
        engineVersion: string;
        inputHash: string;
        patchSummary: string;
        filesTouched: string[];
        diff: string;
        confidence: number;
        warnings: string[];
    };
    targetSystem?: string;  // 'inline' | 'object_store'
    targetKey?: string;     // future: 'bundles/<runId>/fixes/<findingId>.patch'
    source?: string;        // 'fix_agent' | 'console'
    createdAt: string;
}

export class FixEngine {
    constructor(private logger: TaskLogger) { }

    /**
     * Generates a fix for a single finding.
     * Implements the EXISTS vs CREATED logic.
     */
    async processFinding(runId: string, findingId: string, findingDoc: any): Promise<'CREATED' | 'EXISTS' | 'FAILED'> {
        const stage = 'FIX_BUNDLES';
        await this.logger.log(stage, 'FINDING', findingId, 'STARTED', `Processing fix for finding ${findingId}`);

        try {
            // 1. Build Deterministic Input
            // We need to map the ES doc to ResearchContext shape for the builder
            const context: any = {
                meta: { findingId },
                identity: {
                    cveId: findingDoc.cve || null,
                    packageName: findingDoc.packageName || null,
                    packageVersion: findingDoc.packageVersion || null,
                    tool: findingDoc.tool || 'unknown',
                    ruleId: findingDoc.ruleId || 'unknown',
                },
                location: {
                    path: findingDoc.assetUrl || null, // Best available for now
                    startLine: findingDoc.location?.startLine ?? null,
                    endLine: findingDoc.location?.endLine ?? null,
                },
                snippet: {
                    normalized: findingDoc.description || null, // Mocking snippet with description if missing
                },
                reachability: findingDoc.context?.reachability || null,
                dependencyAnalysis: findingDoc.dependencyAnalysis || null,
            };

            const input = buildFixInput(context);
            const inputHash = await computeStableHash(input);
            const idempotencyKey = `FIX_BUNDLE:${runId}:${findingId}:${inputHash}`;

            // 2. Check for existing fix
            const existing = await esClient.get({
                index: INDEX_ACTIONS,
                id: idempotencyKey
            }).catch(() => null);

            if (existing && existing.found) {
                await this.logger.log(stage, 'FINDING', findingId, 'SKIPPED', `Fix already exists (hash match)`, { inputHash });
                return 'EXISTS';
            }

            // 3. Generate new fix (Mocking the AI engine call for now)
            // In a real implementation, we would call aiAnalysisService.analyzeFinding(context)
            // But we'd need to mock its Dexie dependencies.
            const result = await this.mockGenerateFix(findingId, inputHash, findingDoc);

            // 4. Store in argonaut_actions
            const action: FixBundleAction = {
                actionType: 'FIX_BUNDLE',
                runId,
                findingId,
                findingIds: [findingId],
                status: 'CREATED',
                payload: {
                    engineVersion: '1.0.0-agent',
                    inputHash,
                    patchSummary: result.summary,
                    filesTouched: result.filesTouched,
                    diff: result.diff,
                    confidence: result.confidence,
                    warnings: [],
                },
                targetSystem: 'inline',
                targetKey: `bundles/${runId}/fixes/${findingId}.patch`,
                source: 'fix_agent',
                createdAt: new Date().toISOString()
            };

            await esClient.index({
                index: INDEX_ACTIONS,
                id: idempotencyKey,
                document: action
            });

            // Update the finding status to Fixed automatically
            await esClient.update({
                index: INDEX_FINDINGS,
                id: findingId,
                doc: {
                    triage: {
                        status: 'Fixed',
                        updatedAt: new Date().toISOString()
                    }
                }
            }).catch(err => {
                console.warn(`[FixEngine] Failed to update finding status for ${findingId}:`, err);
            });

            await this.logger.log(stage, 'FINDING', findingId, 'SUCCEEDED', `New fix bundle created and finding marked as Fixed`, { inputHash, confidence: result.confidence });
            return 'CREATED';

        } catch (error: any) {
            console.error(`[FixEngine] Failed to process ${findingId}:`, error);
            await this.logger.log(stage, 'FINDING', findingId, 'FAILED', `Fix generation failed: ${error.message}`);
            return 'FAILED';
        }
    }

    private async mockGenerateFix(findingId: string, inputHash: string, findingDoc?: any) {
        // Simulating AI latency
        await new Promise(resolve => setTimeout(resolve, 1000));
        const confidence = this.deterministicConfidence(inputHash);

        const pkg = findingDoc?.packageName || 'vulnerable-lib';
        const fromVer = findingDoc?.packageVersion || '1.0.0';
        const cve = findingDoc?.cve || 'CVE-XXXX-XXXX';
        // Derive a plausible patch version
        const parts = fromVer.split('.');
        const toVer = parts.length === 3
            ? `${parts[0]}.${parts[1]}.${parseInt(parts[2] || '0', 10) + 1}`
            : `${fromVer}-patched`;

        return {
            summary: `Fix ${cve}: upgrade ${pkg} from ${fromVer} to ${toVer}.`,
            filesTouched: ['package.json', 'package-lock.json'],
            diff: `--- a/package.json\n+++ b/package.json\n@@ -10,1 +10,1 @@\n-    "${pkg}": "${fromVer}"\n+    "${pkg}": "${toVer}"`,
            confidence
        };
    }

    private deterministicConfidence(inputHash: string): number {
        const byte = parseInt(inputHash.slice(0, 2), 16);
        const normalized = byte / 255;
        return Number((0.85 + normalized * 0.1).toFixed(4));
    }
}
