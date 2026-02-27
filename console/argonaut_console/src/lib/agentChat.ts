/**
 * agentChat.ts
 *
 * Server-side module for the ASK ARGONAUT chat feature.
 * - Builds a grounded "Run Context Packet" from ES data
 * - Proxies messages to the Kibana Agent Builder API
 * - Returns grounded, run-scoped answers
 *
 * Phase 1: Q&A only — no tool execution, no writes.
 */

import esClient from './esClient';
import { TaskLogger } from './taskLogger';
import crypto from 'crypto';

const INDEX_FINDINGS = 'argonaut_findings';
const INDEX_RUNS = 'argonaut_runs';

// Kibana Agent Builder env vars (must match .env.local / prod .env)
const KIBANA_URL = process.env.KIBANA_URL || '';
const KIBANA_API_KEY = process.env.KIBANA_API_KEY || '';
const KIBANA_SPACE = process.env.KIBANA_SPACE || '';
const AGENT_ID = process.env.ELASTIC_AGENT_ID || '';

const MINIMAL_FINDING_FIELDS = [
    'findingId', 'title', 'description',
    'packageName', 'packageVersion', 'cve', 'severity',
    'priorityScore',
    'context.threat.kev', 'context.threat.epss', 'context.threat.cve',
    'context.reachability.reachable',
    'priorityExplanation.summary',
];

/**
 * The locked sort order for deterministic context slices.
 */
const LOCKED_SORT: any[] = [
    { priorityScore: { order: 'desc', missing: '_last' } },
    { 'findingId.keyword': { order: 'asc' } },
];

export interface ChatRequest {
    runId: string;
    message: string;
    conversationId?: string;
    context?: {
        findingId?: string;
        findingIds?: string[];
        activeFilters?: Record<string, any>;
    };
}

export interface ChatResponse {
    conversationId: string;
    answer: string;
    citations: Array<{ type: string; runId?: string; findingId?: string }>;
}

/**
 * Build the Run Context Packet — a compact, ES-grounded data snapshot
 * sent to the Agent Builder so it can answer without hallucinating.
 */
export async function buildRunContextPacket(runId: string, contextExtra?: ChatRequest['context']): Promise<string> {
    const sections: string[] = [];

    // 1. Run summary
    try {
        const runRes = await esClient.search({
            index: INDEX_RUNS,
            size: 1,
            query: { term: { runId } },
            _source: ['runId', 'repo', 'buildId', 'status', 'createdAt', 'updatedAt', 'stages'],
        });
        const runDoc = (runRes.hits.hits[0]?._source as any) || {};
        sections.push(`## Run Summary
- Run ID: ${runDoc.runId || runId}
- Repo: ${runDoc.repo || 'N/A'}
- Build: ${runDoc.buildId || 'N/A'}
- Status: ${runDoc.status || 'UNKNOWN'}
- Created: ${runDoc.createdAt || 'N/A'}`);
    } catch {
        sections.push(`## Run Summary\n- Run ID: ${runId}\n- (Run metadata unavailable)`);
    }

    // 2. Finding count
    try {
        const countRes = await esClient.count({
            index: INDEX_FINDINGS,
            query: { term: { runId } },
        });
        sections.push(`## Finding Count: ${countRes.count}`);
    } catch {
        sections.push(`## Finding Count: (unavailable)`);
    }

    // 3. Top 10 findings (overall)
    const topFindings = await fetchFindingsSlice(runId, {}, 10, 'Top 10 Findings');
    sections.push(topFindings);

    // 4. Top 10 reachable
    const topReachable = await fetchFindingsSlice(runId, {
        term: { 'context.reachability.reachable': true }
    }, 10, 'Top 10 Reachable Findings');
    sections.push(topReachable);

    // 5. Top 10 KEV
    const topKev = await fetchFindingsSlice(runId, {
        term: { 'context.threat.kev': true }
    }, 10, 'Top 10 KEV Findings');
    sections.push(topKev);

    // 6. Top 10 reachable+KEV
    const topReachableKev = await fetchFindingsSlice(runId, {
        bool: {
            must: [
                { term: { 'context.reachability.reachable': true } },
                { term: { 'context.threat.kev': true } },
            ]
        }
    }, 10, 'Top 10 Reachable + KEV Findings');
    sections.push(topReachableKev);

    // 7. Pairwise compare (if two findingIds provided)
    if (contextExtra?.findingIds && contextExtra.findingIds.length === 2) {
        const pairwise = await buildPairwiseCompare(runId, contextExtra.findingIds[0], contextExtra.findingIds[1]);
        sections.push(pairwise);
    }

    // 8. Single finding detail (if findingId provided)
    if (contextExtra?.findingId) {
        const singleDetail = await fetchSingleFinding(runId, contextExtra.findingId);
        sections.push(singleDetail);
    }

    return sections.join('\n\n');
}

async function fetchFindingsSlice(
    runId: string,
    extraFilter: any,
    size: number,
    title: string
): Promise<string> {
    try {
        const must: any[] = [{ term: { runId } }];
        if (extraFilter && Object.keys(extraFilter).length > 0) {
            must.push(extraFilter);
        }

        const res = await esClient.search({
            index: INDEX_FINDINGS,
            size,
            _source: MINIMAL_FINDING_FIELDS,
            query: { bool: { must } },
            sort: LOCKED_SORT,
        });

        const hits = res.hits.hits;
        if (!hits || hits.length === 0) {
            return `## ${title}\nNo findings match this filter.`;
        }

        const rows = hits.map((h: any) => {
            const s = h._source;
            return `- **${s.findingId}** | ${s.title || s.description || 'Untitled'} | pkg: ${s.packageName || 'N/A'}@${s.packageVersion || '?'} | CVE: ${s.cve || s.context?.threat?.cve || 'N/A'} | score: ${s.priorityScore ?? 'N/A'} | KEV: ${s.context?.threat?.kev ?? false} | EPSS: ${s.context?.threat?.epss ?? 'N/A'} | Reachable: ${s.context?.reachability?.reachable ?? 'N/A'}${s.priorityExplanation?.summary ? ' | Reason: ' + s.priorityExplanation.summary : ''}`;
        });

        return `## ${title} (${hits.length} results)\n${rows.join('\n')}`;
    } catch (err: any) {
        return `## ${title}\n(Error fetching: ${err.message})`;
    }
}

async function fetchSingleFinding(runId: string, findingId: string): Promise<string> {
    try {
        const res = await esClient.search({
            index: INDEX_FINDINGS,
            size: 1,
            _source: MINIMAL_FINDING_FIELDS,
            query: {
                bool: {
                    must: [
                        { term: { runId } },
                        { term: { findingId } },
                    ]
                }
            },
        });

        const hit = res.hits.hits[0];
        if (!hit) return `## Focused Finding: ${findingId}\nNot found in this run.`;
        const s = hit._source as any;

        return `## Focused Finding: ${findingId}
- Title: ${s.title || s.description || 'Untitled'}
- Package: ${s.packageName || 'N/A'}@${s.packageVersion || '?'}
- CVE: ${s.cve || s.context?.threat?.cve || 'N/A'}
- Severity: ${s.severity || 'N/A'}
- Priority Score: ${s.priorityScore ?? 'N/A'}
- KEV: ${s.context?.threat?.kev ?? false}
- EPSS: ${s.context?.threat?.epss ?? 'N/A'}
- Reachable: ${s.context?.reachability?.reachable ?? 'N/A'}
- Explanation: ${s.priorityExplanation?.summary || 'None available'}`;
    } catch {
        return `## Focused Finding: ${findingId}\n(Error fetching)`;
    }
}

async function buildPairwiseCompare(runId: string, idA: string, idB: string): Promise<string> {
    try {
        const res = await esClient.search({
            index: INDEX_FINDINGS,
            size: 2,
            _source: MINIMAL_FINDING_FIELDS,
            query: {
                bool: {
                    must: [{ term: { runId } }],
                    should: [{ term: { findingId: idA } }, { term: { findingId: idB } }],
                    minimum_should_match: 1,
                }
            },
        });

        const hits = res.hits.hits;
        if (hits.length < 2) return `## Pairwise Compare: ${idA} vs ${idB}\nOne or both findings not found.`;

        const a = hits.find((h: any) => (h._source as any).findingId === idA)?._source as any;
        const b = hits.find((h: any) => (h._source as any).findingId === idB)?._source as any;
        if (!a || !b) return `## Pairwise Compare: ${idA} vs ${idB}\nCould not match both findings.`;

        const scoreDelta = (a.priorityScore ?? 0) - (b.priorityScore ?? 0);
        const kevDelta = `${a.context?.threat?.kev ?? false} vs ${b.context?.threat?.kev ?? false}`;
        const epssDelta = `${a.context?.threat?.epss ?? 'N/A'} vs ${b.context?.threat?.epss ?? 'N/A'}`;
        const reachableDelta = `${a.context?.reachability?.reachable ?? 'N/A'} vs ${b.context?.reachability?.reachable ?? 'N/A'}`;

        return `## Pairwise Compare: ${idA} vs ${idB}
| Attribute | ${idA} | ${idB} |
|---|---|---|
| Score | ${a.priorityScore ?? 'N/A'} | ${b.priorityScore ?? 'N/A'} |
| KEV | ${a.context?.threat?.kev ?? false} | ${b.context?.threat?.kev ?? false} |
| EPSS | ${a.context?.threat?.epss ?? 'N/A'} | ${b.context?.threat?.epss ?? 'N/A'} |
| Reachable | ${a.context?.reachability?.reachable ?? 'N/A'} | ${b.context?.reachability?.reachable ?? 'N/A'} |
| Explanation | ${a.priorityExplanation?.summary || 'None'} | ${b.priorityExplanation?.summary || 'None'} |

**Score Delta:** ${scoreDelta > 0 ? '+' : ''}${scoreDelta} (${idA} ${scoreDelta > 0 ? 'higher' : scoreDelta < 0 ? 'lower' : 'equal'})`;
    } catch {
        return `## Pairwise Compare: ${idA} vs ${idB}\n(Error)`;
    }
}

/**
 * The system prompt that grounds the Agent Builder to the context packet.
 */
const SYSTEM_PROMPT = `You are **Argonaut**, an AI security analyst embedded in the Argonaut Console. You help users understand their vulnerability scan results.

## Rules (STRICT)
1. **Answer ONLY using the provided Run Context Packet below.** If the data is missing or insufficient to answer, say exactly what data is missing — never invent CVEs, packages, scores, or counts.
2. **All answers are run-scoped.** You can only discuss findings from the provided run.
3. **You cannot take actions.** If the user asks you to generate fixes, post to Slack, triage, or modify anything, respond: "I can explain and summarize in this mode. Use the buttons in the UI to take actions."
4. **Be concise and factual.** Use bullet points. Cite findingIds when referencing specific findings.
5. **Never hallucinate.** If you don't have enough context, say so.`;

/**
 * Send a chat message to the Elastic Agent Builder and return the answer.
 * Falls back to a local mock if Kibana is not configured.
 */
export async function sendAgentChat(request: ChatRequest): Promise<ChatResponse> {
    const logger = new TaskLogger(request.runId);
    const conversationId = request.conversationId || `conv_${crypto.randomBytes(8).toString('hex')}`;

    // Log the question
    await logger.log(
        'ASK_ARGONAUT', 'SYSTEM', `chat:${conversationId}`, 'STARTED',
        `ASK_ARGONAUT question received: "${request.message.slice(0, 200)}"`,
        { runId: request.runId, findingId: request.context?.findingId }
    );

    try {
        // Build grounded context packet
        const contextPacket = await buildRunContextPacket(request.runId, request.context);
        const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n# Run Context Packet\n${contextPacket}\n---\n\nUser question: ${request.message}`;

        let answer: string;

        if (KIBANA_URL && KIBANA_API_KEY && AGENT_ID) {
            // Call Kibana Agent Builder API (real LLM)
            answer = await callKibanaAgent(fullPrompt, conversationId);
        } else {
            // Local mock for demo / development (no Kibana configured)
            answer = await mockAgentResponse(request.message, contextPacket);
        }

        // Extract citations (findingIds referenced in the answer)
        const citationPattern = /F-\d+|[a-f0-9]{12,}/gi;
        const matches = answer.match(citationPattern) || [];
        const citations = [...new Set(matches)].slice(0, 10).map(id => ({
            type: 'finding',
            runId: request.runId,
            findingId: id,
        }));

        // Log the response
        await logger.log(
            'ASK_ARGONAUT', 'SYSTEM', `chat:${conversationId}`, 'SUCCEEDED',
            `ASK_ARGONAUT response generated (${answer.length} chars, ${citations.length} citations)`,
            { runId: request.runId }
        );

        return { conversationId, answer, citations };

    } catch (err: any) {
        await logger.log(
            'ASK_ARGONAUT', 'SYSTEM', `chat:${conversationId}`, 'FAILED',
            `ASK_ARGONAUT error: ${err.message}`
        );
        throw err;
    }
}

/**
 * Call the Kibana Agent Builder API (server-side only).
 */
async function callKibanaAgent(prompt: string, conversationId: string): Promise<string> {
    const spacePrefix = KIBANA_SPACE ? `/s/${KIBANA_SPACE}` : '';
    const url = `${KIBANA_URL}${spacePrefix}/api/actions/connector/${AGENT_ID}/_execute`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `ApiKey ${KIBANA_API_KEY}`,
            'kbn-xsrf': 'true',
        },
        body: JSON.stringify({
            params: {
                subAction: 'unified_completion',
                subActionParams: {
                    body: {
                        messages: [
                            {
                                role: 'user',
                                content: prompt,
                            }
                        ],
                    },
                },
            },
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kibana Agent Builder returned ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = await res.json();
    // .inference connector _execute response shape:
    // { status: 'ok', data: { choices: [{ message: { content, role } }] } }
    if (data.status === 'error') {
        throw new Error(`Agent connector error: ${data.message || data.service_message || 'Unknown'}`);
    }
    return data.data?.choices?.[0]?.message?.content || data.data?.message || 'No response from agent.';
}

/**
 * Mock agent response for demo/dev when Kibana is not configured.
 * Uses the context packet to produce grounded-looking answers.
 */
async function mockAgentResponse(question: string, contextPacket: string): Promise<string> {
    // Simulate latency
    await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
    const q = question.toLowerCase();

    // Extract data from context for grounded answers
    const findingLines = contextPacket.split('\n').filter(l => l.startsWith('- **'));
    const kevFindings = findingLines.filter(l => l.includes('KEV: true'));
    const reachableFindings = findingLines.filter(l => l.includes('Reachable: true'));
    const reachableKevFindings = findingLines.filter(l => l.includes('KEV: true') && l.includes('Reachable: true'));

    // Count findings
    const countMatch = contextPacket.match(/Finding Count: (\d+)/);
    const totalCount = countMatch ? countMatch[1] : 'unknown';

    if (q.includes('action') || q.includes('fix') || q.includes('remediat') || q.includes('slack') || q.includes('triage')) {
        return "I can explain and summarize in this mode. Use the buttons in the UI to take actions.\n\n- To generate fixes: click **Generate Fixes (Top 5)** in the findings toolbar\n- To view threat intel: click the 🔬 icon on any finding row\n- Fix results appear as toast notifications and in Slack";
    }

    if (q.includes('top') && q.includes('reachable') && q.includes('kev')) {
        if (reachableKevFindings.length === 0) {
            return `There are no findings in this run that are both **reachable** and on the **CISA KEV list**.`;
        }
        const bullets = reachableKevFindings.slice(0, 5).map(l => {
            const idMatch = l.match(/\*\*(.+?)\*\*/);
            return `  ${l.trim()}`;
        }).join('\n');
        return `Here are the top reachable KEV findings in this run:\n\n${bullets}\n\nThese findings are **both confirmed reachable in your codebase and listed in CISA's Known Exploited Vulnerabilities catalog**, making them the highest priority for remediation.`;
    }

    if (q.includes('top') && q.includes('kev')) {
        if (kevFindings.length === 0) return 'No KEV findings found in this run.';
        const bullets = kevFindings.slice(0, 5).map(l => `  ${l.trim()}`).join('\n');
        return `Here are the top KEV (Known Exploited Vulnerability) findings:\n\n${bullets}\n\nThese are listed in **CISA's KEV catalog**, meaning active exploitation has been observed in the wild.`;
    }

    if (q.includes('top') && q.includes('reachable')) {
        if (reachableFindings.length === 0) return 'No reachable findings found in this run.';
        const bullets = reachableFindings.slice(0, 5).map(l => `  ${l.trim()}`).join('\n');
        return `Here are the top reachable findings:\n\n${bullets}\n\nThese vulnerabilities have been confirmed reachable through static analysis of your application's dependency graph.`;
    }

    if (q.includes('why') && q.includes('rank') || q.includes('higher') || q.includes('compare')) {
        // Look for pairwise section
        if (contextPacket.includes('Pairwise Compare')) {
            const pairSection = contextPacket.split('## Pairwise Compare')[1]?.split('##')[0] || '';
            return `Based on the priority scoring analysis:\n\n${pairSection.trim()}\n\nThe ranking is determined by a weighted combination of: vulnerability severity, CISA KEV status, EPSS exploitation probability, and reachability in your codebase.`;
        }
        return `To compare specific findings, I need their finding IDs. Could you specify which two findings you'd like to compare? For example: "Why is finding F-001 ranked higher than F-002?"`;
    }

    if (q.includes('summar')) {
        const severities = findingLines.reduce((acc: Record<string, number>, l: string) => {
            const sevMatch = l.match(/severity: (\w+)/i);
            if (sevMatch) acc[sevMatch[1]] = (acc[sevMatch[1]] || 0) + 1;
            return acc;
        }, {});

        return `## Run Summary\n\n` +
            `- **Total findings:** ${totalCount}\n` +
            `- **KEV findings:** ${kevFindings.length} findings are on the CISA Known Exploited Vulnerabilities list\n` +
            `- **Reachable findings:** ${reachableFindings.length} findings are confirmed reachable in your codebase\n` +
            `- **Reachable + KEV:** ${reachableKevFindings.length} findings are both reachable and on KEV (highest priority)\n` +
            `- **Top priority:** ${findingLines[0]?.match(/\*\*(.+?)\*\*/)?.[1] || 'See findings grid'} — review this first`;
    }

    // Generic fallback
    return `Based on the current run data:\n\n` +
        `- This run contains **${totalCount}** total findings\n` +
        `- **${kevFindings.length}** are on the CISA KEV list\n` +
        `- **${reachableFindings.length}** are confirmed reachable\n\n` +
        `Could you be more specific about what you'd like to know? For example:\n` +
        `- "What are the top reachable KEVs?"\n` +
        `- "Summarize this run in 5 bullets"\n` +
        `- "Why is finding X ranked higher than Y?"`;
}
