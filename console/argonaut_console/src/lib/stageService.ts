import esClient from './esClient';

export type StageStatus = 'SKIPPED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type StageMode = 'single' | 'topN';

export interface RunStage {
    runId: string;
    stage: string; // e.g., "FIX_BUNDLES"
    status: StageStatus;
    mode?: StageMode;
    requestedCount?: number;
    startedAt: string; // ISO string
    endedAt?: string; // ISO string
    requestId?: string;
    stageIdempotencyKey?: string;
}

const INDEX_RUN_STAGES = 'argonaut_run_stages';

export class StageService {
    /**
     * Attempts to lock a stage for a run.
     * Returns true if lock was acquired, false if stage is already RUNNING.
     */
    async acquireLock(runId: string, stage: string, requestId: string, mode?: StageMode, requestedCount?: number): Promise<boolean> {
        const id = `${runId}:${stage}`;

        try {
            // Check if stage is already running
            const existing = await esClient.get({
                index: INDEX_RUN_STAGES,
                id,
            }).catch(() => null);

            if (existing && existing._source && (existing._source as RunStage).status === 'RUNNING') {
                return false;
            }

            // Create or update the stage record
            const runStage: RunStage = {
                runId,
                stage,
                status: 'RUNNING',
                mode,
                requestedCount,
                startedAt: new Date().toISOString(),
                requestId,
            };

            await esClient.index({
                index: INDEX_RUN_STAGES,
                id,
                document: runStage,
                refresh: true, // Ensure visibility for immediate subsequent checks
            });

            return true;
        } catch (error) {
            console.error(`[StageService] Error acquiring lock for ${id}:`, error);
            throw error;
        }
    }

    /**
     * Updates the status of a stage.
     */
    async updateStatus(runId: string, stage: string, status: StageStatus, extra?: Partial<RunStage>): Promise<void> {
        const id = `${runId}:${stage}`;

        try {
            const updateDoc: Partial<RunStage> = {
                status,
                ...extra,
            };

            if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'SKIPPED') {
                updateDoc.endedAt = new Date().toISOString();
            }

            await esClient.update({
                index: INDEX_RUN_STAGES,
                id,
                doc: updateDoc,
                refresh: true,
            });
        } catch (error) {
            console.error(`[StageService] Error updating status for ${id}:`, error);
            // Don't throw here to avoid failing the main process just because of status update, 
            // but in a real app we might want to handle this.
        }
    }

    /**
     * Retrieves the current stage record.
     */
    async getStage(runId: string, stage: string): Promise<RunStage | null> {
        const id = `${runId}:${stage}`;
        try {
            const res = await esClient.get({
                index: INDEX_RUN_STAGES,
                id,
            });
            return res._source as RunStage;
        } catch (error) {
            return null;
        }
    }
}

export const stageService = new StageService();
