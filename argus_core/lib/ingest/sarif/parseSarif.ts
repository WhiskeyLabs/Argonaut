import { SarifLogSchema } from '../../schemas/sarif';
import { generateFindingId } from '../../identity';
import { SarifParseError } from './errors';
import { NormalizedFinding, NormalizedSeverity, ParseSarifMeta } from './types';

const SUPPORTED_SARIF_VERSION = '2.1.0';
const CVE_PATTERN = /CVE-\d{4}-\d{4,7}/gi;

type UnknownRecord = Record<string, unknown>;

export function parseSarif(raw: string | UnknownRecord, meta: ParseSarifMeta): NormalizedFinding[] {
    const payload = normalizeRawInput(raw);
    const parsed = SarifLogSchema.safeParse(payload);

    if (!parsed.success) {
        return [];
    }

    const log = parsed.data;
    if (log.version !== SUPPORTED_SARIF_VERSION) {
        return [];
    }

    const createdAt = normalizeCreatedAt(meta.createdAt);
    const normalized: NormalizedFinding[] = [];

    for (const run of log.runs) {
        const toolName = normalizeString(run.tool.driver.name) ?? 'unknown-tool';

        for (const result of run.results ?? []) {
            const properties = toRecord(result.properties);
            const ruleId = normalizeString(result.ruleId) ?? 'unknown-rule';
            const messageText = normalizeString(result.message?.text) ?? '';
            const severity = normalizeSeverity(properties, result.level);
            const { packageName, packageVersion } = extractDependencyMetadata(properties);
            const { filePath, lineNumber } = extractLocation(result, meta);
            const cves = extractCves(ruleId, messageText, properties);
            const cve = cves.length > 0 ? cves[0] : null;

            const fingerprint = buildFingerprint({
                ruleId,
                severity,
                cves,
                packageName,
                packageVersion,
                filePath,
                lineNumber,
                toolName,
            });

            const findingId = buildFindingId({
                repo: meta.repo,
                buildId: meta.buildId,
                fingerprint,
            });

            normalized.push({
                findingId,
                repo: meta.repo,
                buildId: meta.buildId,
                ruleId,
                severity,
                cve,
                cves,
                package: packageName,
                version: packageVersion,
                filePath,
                lineNumber,
                tool: toolName,
                fingerprint,
                createdAt,
            });
        }
    }

    return dedupeAndSort(normalized);
}

export { SUPPORTED_SARIF_VERSION };

function normalizeRawInput(raw: string | UnknownRecord): unknown {
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch {
            throw new SarifParseError('MALFORMED_JSON', 'Unable to parse SARIF JSON input.');
        }
    }

    if (!isRecord(raw)) {
        throw new SarifParseError('INVALID_INPUT', 'Expected SARIF payload as JSON string or object.');
    }

    return raw;
}

function normalizeCreatedAt(value: number | undefined): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    return Date.now();
}

function normalizeSeverity(
    properties: UnknownRecord,
    level: 'error' | 'warning' | 'note' | 'none' | undefined,
): NormalizedSeverity {
    const explicitCandidates: unknown[] = [
        properties.severity,
        properties['security-severity'],
        properties.securitySeverity,
        properties.priority,
    ];

    for (const candidate of explicitCandidates) {
        const mapped = mapSeverityValue(candidate);
        if (mapped !== null) {
            return mapped;
        }
    }

    switch (level) {
        case 'error':
            return 'HIGH';
        case 'warning':
            return 'MEDIUM';
        case 'note':
        case 'none':
            return 'INFO';
        default:
            return 'MEDIUM';
    }
}

function mapSeverityValue(value: unknown): NormalizedSeverity | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return mapNumericSeverity(value);
    }

    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    const asNumber = Number(normalized);
    if (!Number.isNaN(asNumber)) {
        return mapNumericSeverity(asNumber);
    }

    if (normalized.includes('critical')) return 'CRITICAL';
    if (normalized.includes('high') || normalized === 'error') return 'HIGH';
    if (normalized.includes('medium') || normalized.includes('moderate') || normalized === 'warning') return 'MEDIUM';
    if (normalized.includes('low')) return 'LOW';
    if (normalized.includes('info') || normalized.includes('informational') || normalized === 'note' || normalized === 'none') {
        return 'INFO';
    }

    return 'UNKNOWN';
}

function mapNumericSeverity(value: number): NormalizedSeverity {
    if (value >= 9) return 'CRITICAL';
    if (value >= 7) return 'HIGH';
    if (value >= 4) return 'MEDIUM';
    if (value > 0) return 'LOW';
    return 'INFO';
}

function extractDependencyMetadata(properties: UnknownRecord): {
    packageName: string | null;
    packageVersion: string | null;
} {
    const packageFromObject = extractNameVersionFromObject(properties.package);
    const dependencyFromObject = extractNameVersionFromObject(properties.dependency);
    const componentFromObject = extractNameVersionFromObject(properties.component);

    const packageName = firstNonNullString([
        packageFromObject.name,
        dependencyFromObject.name,
        componentFromObject.name,
        normalizeString(properties.packageName),
        normalizeString(properties.package),
        normalizeString(properties.dependencyName),
        normalizeString(properties.componentName),
    ]);

    const packageVersion = firstNonNullString([
        packageFromObject.version,
        dependencyFromObject.version,
        componentFromObject.version,
        normalizeString(properties.packageVersion),
        normalizeString(properties.version),
        normalizeString(properties.dependencyVersion),
        normalizeString(properties.componentVersion),
    ]);

    return {
        packageName,
        packageVersion,
    };
}

function extractNameVersionFromObject(value: unknown): { name: string | null; version: string | null } {
    if (!isRecord(value)) {
        return { name: null, version: null };
    }

    return {
        name: normalizeString(value.name),
        version: normalizeString(value.version),
    };
}

function extractLocation(
    result: {
        locations?: Array<{
            physicalLocation?: {
                artifactLocation?: { uri?: string };
                region?: { startLine?: number };
            };
        }>;
    },
    meta: ParseSarifMeta,
): { filePath: string | null; lineNumber: number | null } {
    const primaryLocation = result.locations?.[0]?.physicalLocation;
    const filePath = normalizeString(primaryLocation?.artifactLocation?.uri)
        ?? normalizeString(meta.defaultFilePath);

    const line = primaryLocation?.region?.startLine;
    const lineNumber = typeof line === 'number' && Number.isFinite(line) && line > 0
        ? Math.trunc(line)
        : null;

    return {
        filePath,
        lineNumber,
    };
}

function extractCves(ruleId: string, messageText: string, properties: UnknownRecord): string[] {
    const cveSet = new Set<string>();

    addCvesFromUnknown(ruleId, cveSet);
    addCvesFromUnknown(messageText, cveSet);
    addCvesFromUnknown(properties.cve, cveSet);
    addCvesFromUnknown(properties.cves, cveSet);
    addCvesFromUnknown(properties.tags, cveSet);
    addCvesFromUnknown(properties.identifiers, cveSet);
    addCvesFromUnknown(properties.vulnerabilities, cveSet);

    return Array.from(cveSet).sort((a, b) => a.localeCompare(b));
}

function addCvesFromUnknown(value: unknown, sink: Set<string>): void {
    if (typeof value === 'string') {
        const matches = value.match(CVE_PATTERN);
        for (const match of matches ?? []) {
            sink.add(match.toUpperCase());
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            addCvesFromUnknown(entry, sink);
        }
        return;
    }

    if (isRecord(value)) {
        for (const nested of Object.values(value)) {
            addCvesFromUnknown(nested, sink);
        }
    }
}

function buildFingerprint(input: {
    ruleId: string;
    severity: NormalizedSeverity;
    cves: string[];
    packageName: string | null;
    packageVersion: string | null;
    filePath: string | null;
    lineNumber: number | null;
    toolName: string;
}): string {
    return stableHash({
        ruleId: input.ruleId,
        severity: input.severity,
        cves: input.cves,
        package: input.packageName,
        version: input.packageVersion,
        filePath: input.filePath,
        lineNumber: input.lineNumber,
        tool: input.toolName,
    });
}

function buildFindingId(input: { repo: string; buildId: string; fingerprint: string }): string {
    return generateFindingId({
        repo: input.repo,
        buildId: input.buildId,
        fingerprint: input.fingerprint,
    });
}

function dedupeAndSort(findings: NormalizedFinding[]): NormalizedFinding[] {
    const deduped = new Map<string, NormalizedFinding>();

    for (const finding of findings) {
        if (!deduped.has(finding.findingId)) {
            deduped.set(finding.findingId, finding);
        }
    }

    return Array.from(deduped.values()).sort((left, right) => {
        if (left.findingId !== right.findingId) {
            return left.findingId.localeCompare(right.findingId);
        }

        return left.ruleId.localeCompare(right.ruleId);
    });
}

function stableHash(value: unknown): string {
    const serialized = stableStringify(value);
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;

    for (let i = 0; i < serialized.length; i += 1) {
        const charCode = serialized.charCodeAt(i);
        h1 = Math.imul(h1 ^ charCode, 2654435761);
        h2 = Math.imul(h2 ^ charCode, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function stableStringify(value: unknown): string {
    return JSON.stringify(value, (_key, nestedValue) => {
        if (Array.isArray(nestedValue)) {
            return nestedValue;
        }

        if (nestedValue && typeof nestedValue === 'object') {
            return Object.keys(nestedValue as UnknownRecord)
                .sort((a, b) => a.localeCompare(b))
                .reduce<UnknownRecord>((accumulator, key) => {
                    accumulator[key] = (nestedValue as UnknownRecord)[key];
                    return accumulator;
                }, {});
        }

        return nestedValue;
    });
}

function firstNonNullString(values: Array<string | null>): string | null {
    for (const value of values) {
        if (value !== null) {
            return value;
        }
    }

    return null;
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toRecord(value: unknown): UnknownRecord {
    return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
