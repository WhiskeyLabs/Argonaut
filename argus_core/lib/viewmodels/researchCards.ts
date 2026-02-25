import { ResearchContext, NormalizedSeverity, NormalizedStatus } from '../types/research';

export interface ResearchCardsViewModel {
    severity: {
        label: string; // "High", "Low", etc
        value: number; // 0-10 (optional)
        color: string; // Tailored color class (e.g. text-red-500)
    };
    status: {
        label: string; // "Open", "Fixed", "Ignored"
        color: string;
    };
    identity: {
        type: 'Package' | 'Rule';
        label: string;
        value: string; // "log4j-core" or "semgrep.rules..."
    };
    detected: string; // "2 hours ago"
    confidence: {
        label: string; // "High (91%)" or "—"
        score?: number;
    };
    metadata: {
        ruleId: string;
        tool: string;
        location: string;
        tags: string[];
    };
    recommendedAction?: string;
    graphStatus?: {
        label: string; // REAL / UNAVAILABLE
        type: 'success' | 'warning' | 'error' | 'default';
    };
}

function getRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
}

function getSeverityColor(severity: NormalizedSeverity): string {
    switch (severity) {
        case 'CRITICAL': return 'text-red-600';
        case 'HIGH': return 'text-orange-500';
        case 'MEDIUM': return 'text-yellow-500';
        case 'LOW': return 'text-blue-500';
        case 'INFO': return 'text-slate-400';
        default: return 'text-slate-400';
    }
}

function getStatusColor(status: NormalizedStatus): string {
    switch (status) {
        case 'OPEN':
            return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800/50';
        case 'IN_PROGRESS':
            return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800/50';
        case 'FIXED':
            return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800/50';
        case 'RISK_ACCEPTED':
            return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800/50';
        case 'FALSE_POSITIVE':
            return 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300 ring-1 ring-stone-200 dark:ring-stone-700/50';
        case 'IGNORED':
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700/50';
        default:
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
    }
}

export function buildResearchCardsViewModel(
    context: ResearchContext,
    overrides?: {
        status?: NormalizedStatus;
        severity?: NormalizedSeverity;
    }
): ResearchCardsViewModel {
    const { identity, meta, reachability } = context;

    // Severity Logic
    const severityLabel = overrides?.severity || identity.normalizedSeverity;
    const severityColor = getSeverityColor(severityLabel);

    // Status Logic
    const statusLabel = overrides?.status || context.status;
    const statusColor = getStatusColor(statusLabel);

    // Identity Logic
    const isPackage = !!identity.packageName;
    const identityType = isPackage ? 'Package' : 'Rule';
    const identityValue = isPackage
        ? `${identity.packageName}${identity.packageVersion ? `@${identity.packageVersion}` : ''}`
        : identity.ruleId;

    // Detected Logic
    const detectedLabel = getRelativeTime(meta.ingestionTimestamp);

    // Graph Status Logic
    let graphStatus: ResearchCardsViewModel['graphStatus'];
    if (reachability) {
        const status = reachability.status; // REAL, HEURISTIC, UNAVAILABLE
        let type: ResearchCardsViewModel['graphStatus']['type'] = 'default';
        if (status === 'REAL') type = 'success';
        else if (status === 'HEURISTIC') type = 'warning';
        else if (status === 'UNAVAILABLE' || status === 'ERROR') type = 'error';

        graphStatus = {
            label: status,
            type
        };
    }

    return {
        severity: {
            label: severityLabel, // Display normalized severity
            value: 0, // Placeholder
            color: severityColor
        },
        status: {
            label: statusLabel,
            color: statusColor
        },
        identity: {
            type: identityType,
            label: identityType,
            value: identityValue
        },
        detected: detectedLabel,
        confidence: {
            label: 'Not computed',
        },
        metadata: {
            ruleId: identity.ruleId,
            tool: identity.tool,
            location: context.location.path
                ? `${context.location.path}:${context.location.startLine || '?'}`
                : 'Unknown location',
            tags: context.tags || []
        },
        recommendedAction: context.description || "No specific recommendation available.",
        graphStatus
    };
}
