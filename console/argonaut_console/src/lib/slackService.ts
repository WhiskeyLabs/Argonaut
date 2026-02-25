import esClient from './esClient';
import { ReportSummaryPayload, canonicalStringify } from './reportEngine';
import crypto from 'crypto';

const INDEX_ACTIONS = 'argonaut_actions';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const SLACK_MODE = process.env.SLACK_MODE || 'dry_run';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

export async function publishReportToSlack(runId: string, payload: ReportSummaryPayload) {
    console.log(`[SLACK_SERVICE] Preparing to publish report for run: ${runId}`);

    // 1. Calculate Idempotency Key
    // We hash the report summary content to ensure we only post THIS specific report once.
    const { generatedAt: _, ...hashablePayload } = payload;
    const reportPayloadHash = crypto
        .createHash('sha256')
        .update(canonicalStringify(hashablePayload))
        .digest('hex');
    const idempotencyKey = `SLACK_REPORT:${runId}:${reportPayloadHash}`;

    // 2. Check Idempotency
    try {
        const existing = await esClient.get({
            index: INDEX_ACTIONS,
            id: idempotencyKey
        });

        if (existing && (existing._source as Record<string, any>).status === 'POSTED') {
            console.log(`[SLACK_SERVICE] Report already posted to Slack (Idempotency Key: ${idempotencyKey}). Skipping.`);
            return { status: 'SKIPPED', idempotencyKey };
        }
    } catch (e: any) {
        if (e.meta?.statusCode !== 404) {
            console.error(`[SLACK_SERVICE] Error checking idempotency:`, e);
        }
    }

    // 3. Build Slack Message Blocks
    const { counts, thresholds, links } = payload;
    const blocks = [
        {
            type: "header",
            text: {
                type: "plain_text",
                text: `📊 Scan Summary: ${runId}`,
                emoji: true
            }
        },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*Total Findings:*\n${counts.totalFindings}` },
                { type: "mrkdwn", text: `*Reachable:*\n${counts.reachableCount}` }
            ]
        },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*KEV (CISA):*\n${counts.kevCount}` },
                { type: "mrkdwn", text: `*EPSS ≧ 0.5:*\n${counts.epssGte050Count}` }
            ]
        },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*Critical Filter (PS ≧ ${thresholds.fixableScoreCutoff}):*\n${counts.fixableCutoffCount}` },
                { type: "mrkdwn", text: `*Fix Bundles Proposed:*\n${counts.fixBundlesCreated}` }
            ]
        },
        {
            type: "divider"
        },
        {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*Status:* ${counts.reachableKevCount > 0 ? "🚨 *Action Required:* Reachable KEVs found!" : counts.reachableCount > 0 ? "⚠️ *Warning:* Reachable vulnerabilities found." : "✅ *Clear:* No reachable vulnerabilities found."}`
            }
        },
        // Curated Findings Section
        ...(payload.topLists.topCurated && payload.topLists.topCurated.length > 0 ? [
            { type: "divider" },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "*Curated Findings to Review:*"
                }
            },
            ...payload.topLists.topCurated.slice(0, 3).map((f: any) => ({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `• *${f.findingType || 'Finding'}* in \`${f.filePath || 'unknown'}\` (Score: ${f.priorityScore})\n<${PUBLIC_BASE_URL}/runs/${runId}/findings?findingId=${f.findingId}|View Details ↗>`
                }
            }))
        ] : []),
        {
            type: "divider"
        },
        {
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: { type: "plain_text", text: "View Results ↗" },
                    url: `${PUBLIC_BASE_URL}${links.consoleRunPath}`,
                    style: "primary"
                },
                {
                    type: "button",
                    text: { type: "plain_text", text: "Triage Reachable ↗" },
                    url: `${PUBLIC_BASE_URL}${links.consoleFindingsPath}`
                }
            ]
        }
    ];

    const slackPayload = { blocks };
    let status: 'POSTED' | 'SKIPPED' | 'FAILED' = 'SKIPPED';
    let slackMessageTs: string | null = null;

    // 4. Send to Webhook
    if (SLACK_MODE === 'enabled' && SLACK_WEBHOOK_URL) {
        try {
            const res = await fetch(SLACK_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(slackPayload)
            });
            if (res.ok) {
                status = 'POSTED';
                slackMessageTs = new Date().toISOString();
                console.log(`[SLACK_SERVICE] Successfully posted report to Slack.`);
            } else {
                console.error(`[SLACK_SERVICE] Failed to post report to Slack. Status: ${res.status}`);
                status = 'FAILED';
            }
        } catch (e) {
            console.error(`[SLACK_SERVICE] Error sending to Slack webhook:`, e);
            status = 'FAILED';
        }
    } else {
        console.log(`[SLACK_SERVICE] (Dry Run): Payload ready for ${runId}`);
        status = 'SKIPPED';
    }

    // 5. Record SLACK_PUBLISH Action
    try {
        await esClient.index({
            index: INDEX_ACTIONS,
            id: idempotencyKey,
            document: {
                actionId: idempotencyKey,
                runId,
                actionType: 'SLACK_PUBLISH',
                status,
                idempotencyKey,
                payloadHash: reportPayloadHash,
                targetSystem: 'slack',
                targetKey: SLACK_WEBHOOK_URL ? 'webhook' : 'not_configured',
                slackMessageTs,
                payload: slackPayload,
                createdAt: new Date().toISOString()
            }
        });
    } catch (e) {
        console.error(`[SLACK_SERVICE] Error recording slack action:`, e);
    }

    return { status, idempotencyKey };
}

export interface SlackAlertOptions {
    title: string;
    message: string;
    level?: 'info' | 'warning' | 'error';
    fields?: { label: string, value: string }[];
    actions?: { text: string, url: string }[];
}

export async function publishAlertToSlack(options: SlackAlertOptions) {
    if (SLACK_MODE !== 'enabled' || !SLACK_WEBHOOK_URL) {
        console.log(`[SLACK_SERVICE] (Dry Run/Disabled) Alert ready: ${options.title}`);
        return { status: 'DRY_RUN' };
    }

    const color = options.level === 'error' ? '#FF0000' : options.level === 'warning' ? '#FFA500' : '#36a64f';
    const slackPayload = {
        attachments: [
            {
                fallback: `${options.title}: ${options.message}`,
                color,
                title: options.title,
                text: options.message,
                fields: options.fields?.map(f => ({ title: f.label, value: f.value, short: true })),
                footer: "Argonaut Notification System",
                ts: Math.floor(Date.now() / 1000)
            }
        ]
    };

    if (options.actions && options.actions.length > 0) {
        (slackPayload.attachments[0] as any).actions = options.actions.map(a => ({
            type: "button",
            text: a.text,
            url: a.url
        }));
    }

    try {
        const res = await fetch(SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload)
        });
        if (res.ok) {
            console.log(`[SLACK_SERVICE] Successfully posted alert to Slack.`);
            return { status: 'POSTED' };
        } else {
            console.error(`[SLACK_SERVICE] Failed to post alert to Slack. Status: ${res.status}`);
            return { status: 'FAILED' };
        }
    } catch (e) {
        console.error(`[SLACK_SERVICE] Error sending alert to Slack webhook:`, e);
        return { status: 'FAILED' };
    }
}
