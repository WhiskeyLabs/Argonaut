import esClient from './esClient';
import { publishAlertToSlack } from './slackService';

const INDEX_TASKLOGS = 'argonaut_tasklogs';

export type LogLevel = 'INFO' | 'ERROR' | 'WARN';

export interface TaskLog {
    runId: string;
    bundleId?: string;
    seq: number;
    timestamp: string;
    level: LogLevel;
    stage: string;
    status: string;
    taskType: string; // e.g., 'SYSTEM', 'FINDING'
    taskKey: string;
    message: string;
    refs?: any;
}

export class TaskLogger {
    private seqCounter: number;

    constructor(private runId: string, private bundleId?: string) {
        this.seqCounter = Date.now();
    }

    async log(stage: string, taskType: string, taskKey: string, status: string, message: string, refs?: any, level: LogLevel = 'INFO') {
        try {
            const document: TaskLog = {
                runId: this.runId,
                bundleId: this.bundleId,
                seq: this.seqCounter++,
                timestamp: new Date().toISOString(),
                level: status === 'FAILED' ? 'ERROR' : level,
                stage,
                status,
                taskType,
                taskKey,
                message,
                refs,
            };

            await esClient.index({
                index: INDEX_TASKLOGS,
                document,
            });
            if (status === 'FAILED' || level === 'ERROR') {
                await publishAlertToSlack({
                    title: `❌ Stage Failure: ${stage}`,
                    message: message,
                    level: 'error',
                    fields: [
                        { label: 'RunID', value: this.runId },
                        { label: 'Task', value: taskKey }
                    ],
                    actions: [
                        { text: 'View Run ↗', url: `${process.env.PUBLIC_BASE_URL}/runs/${this.runId}` }
                    ]
                });
            }
        } catch (error) {
            console.error('[TaskLogger] Failed to emit log:', error);
        }
    }
}
