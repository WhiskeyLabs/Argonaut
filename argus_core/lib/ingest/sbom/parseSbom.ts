import { SbomParseError } from './errors';
import { ParseSbomMeta, SbomComponent } from './types';

const SUPPORTED_CYCLONEDX_VERSIONS = new Set(['1.4', '1.5', '1.6']);
const HASH_PRIORITY = ['SHA-256', 'SHA-384', 'SHA-512', 'SHA-1', 'MD5'];

type UnknownRecord = Record<string, unknown>;

type RawComponent = {
    component: string;
    version: string | null;
    license: string | null;
    supplier: string | null;
    hash: string | null;
    purl: string | null;
    bomRef: string | null;
};

export function parseSbom(raw: string | UnknownRecord, meta: ParseSbomMeta): SbomComponent[] {
    const payload = normalizeRawInput(raw);

    const bomFormat = normalizeString(payload.bomFormat);
    if (bomFormat !== 'CycloneDX') {
        return [];
    }

    const bomFormatVersion = normalizeString(payload.specVersion);
    if (bomFormatVersion === null || !SUPPORTED_CYCLONEDX_VERSIONS.has(bomFormatVersion)) {
        return [];
    }

    const topLevelComponents = normalizeComponentArray(payload.components);
    const metadataComponent = extractMetadataComponent(payload.metadata);

    const rawComponents = metadataComponent === null
        ? topLevelComponents
        : [...topLevelComponents, metadataComponent];

    if (rawComponents.length === 0) {
        return [];
    }

    const createdAt = normalizeCreatedAt(meta.createdAt);
    const sourceFile = normalizeSourceFile(meta.sourceFile ?? 'sbom.cdx.json', 'sbom.cdx.json');
    const deriveEcosystem = meta.deriveEcosystemFromPurl ?? true;

    const deduped = dedupeAndSort(rawComponents);

    return deduped.map((component) => {
        const ecosystem = deriveEcosystem ? deriveEcosystemFromPurl(component.purl) : null;

        const componentId = stableHash({
            repo: meta.repo,
            buildId: meta.buildId,
            component: component.component,
            version: component.version,
            purl: component.purl,
            supplier: component.supplier,
            hash: component.hash,
        });

        return {
            componentId,
            repo: meta.repo,
            buildId: meta.buildId,
            component: component.component,
            version: component.version,
            license: component.license,
            supplier: component.supplier,
            hash: component.hash,
            purl: component.purl,
            bomRef: component.bomRef,
            bomFormatVersion,
            ecosystem,
            sourceFile,
            createdAt,
        };
    });
}

function normalizeRawInput(raw: string | UnknownRecord): UnknownRecord {
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!isRecord(parsed)) {
                throw new SbomParseError('INVALID_JSON', 'SBOM JSON payload must be an object.');
            }
            return parsed;
        } catch (error) {
            if (error instanceof SbomParseError) {
                throw error;
            }
            throw new SbomParseError('INVALID_JSON', 'Unable to parse SBOM JSON input.');
        }
    }

    if (!isRecord(raw)) {
        throw new SbomParseError('INVALID_JSON', 'SBOM input must be a JSON string or object.');
    }

    return raw;
}

function normalizeComponentArray(value: unknown): RawComponent[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const components: RawComponent[] = [];

    for (const entry of value) {
        const normalized = normalizeComponent(entry);
        if (normalized !== null) {
            components.push(normalized);
        }
    }

    return components;
}

function extractMetadataComponent(value: unknown): RawComponent | null {
    const metadata = toRecord(value);
    if (metadata === null) {
        return null;
    }

    return normalizeComponent(metadata.component);
}

function normalizeComponent(value: unknown): RawComponent | null {
    const record = toRecord(value);
    if (record === null) {
        return null;
    }

    const component = normalizeString(record.name);
    if (component === null) {
        return null;
    }

    const version = normalizeString(record.version);
    const license = normalizeLicense(record.licenses);
    const supplier = normalizeSupplier(record.supplier);
    const hash = normalizeHash(record.hashes);
    const purl = normalizeString(record.purl);
    const bomRef = normalizeString(record['bom-ref']);

    return {
        component,
        version,
        license,
        supplier,
        hash,
        purl,
        bomRef,
    };
}

function normalizeLicense(value: unknown): string | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const idCandidates: string[] = [];
    const nameCandidates: string[] = [];
    const expressionCandidates: string[] = [];

    for (const entry of value) {
        const record = toRecord(entry);
        if (record === null) {
            continue;
        }

        const licenseObj = toRecord(record.license);
        const idCandidate = normalizeString(licenseObj?.id);
        const nameCandidate = normalizeString(licenseObj?.name);
        const expressionCandidate = normalizeString(record.expression);

        if (idCandidate !== null) idCandidates.push(idCandidate);
        if (nameCandidate !== null) nameCandidates.push(nameCandidate);
        if (expressionCandidate !== null) expressionCandidates.push(expressionCandidate);
    }

    const byPriority = [idCandidates, nameCandidates, expressionCandidates];
    for (const candidates of byPriority) {
        if (candidates.length === 0) {
            continue;
        }

        candidates.sort((a, b) => a.localeCompare(b));
        return candidates[0];
    }

    return null;
}

function normalizeSupplier(value: unknown): string | null {
    const supplier = toRecord(value);
    if (supplier === null) {
        return null;
    }

    return normalizeString(supplier.name);
}

function normalizeHash(value: unknown): string | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const candidates: Array<{ algorithm: string; value: string; normalized: string }> = [];

    for (const entry of value) {
        const record = toRecord(entry);
        if (record === null) {
            continue;
        }

        const algorithm = normalizeAlgorithm(record.alg);
        const hashValue = normalizeString(record.content);

        if (algorithm === null || hashValue === null) {
            continue;
        }

        candidates.push({
            algorithm,
            value: hashValue,
            normalized: `${algorithm}:${hashValue}`,
        });
    }

    if (candidates.length === 0) {
        return null;
    }

    candidates.sort((left, right) => compareHashCandidate(left, right));
    return candidates[0].normalized;
}

function compareHashCandidate(
    left: { algorithm: string; normalized: string },
    right: { algorithm: string; normalized: string },
): number {
    const leftPriority = hashPriority(left.algorithm);
    const rightPriority = hashPriority(right.algorithm);

    if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
    }

    return left.normalized.localeCompare(right.normalized);
}

function hashPriority(algorithm: string): number {
    const idx = HASH_PRIORITY.indexOf(algorithm);
    if (idx >= 0) {
        return idx;
    }

    return HASH_PRIORITY.length;
}

function normalizeAlgorithm(value: unknown): string | null {
    const normalized = normalizeString(value);
    if (normalized === null) {
        return null;
    }

    return normalized.toUpperCase();
}

function deriveEcosystemFromPurl(purl: string | null): string | null {
    if (purl === null) {
        return null;
    }

    const match = /^pkg:([^/]+)\//.exec(purl);
    return match ? match[1] : null;
}

function dedupeAndSort(components: RawComponent[]): RawComponent[] {
    const deduped = new Map<string, RawComponent>();

    for (const component of components) {
        const key = [
            component.component,
            component.version ?? '__NULL__',
            component.purl ?? '__NULL__',
            component.supplier ?? '__NULL__',
            component.license ?? '__NULL__',
            component.hash ?? '__NULL__',
        ].join('|');

        if (!deduped.has(key)) {
            deduped.set(key, component);
        }
    }

    return Array.from(deduped.values()).sort((left, right) => {
        const byComponent = left.component.localeCompare(right.component);
        if (byComponent !== 0) return byComponent;

        const byVersion = compareNullableStrings(left.version, right.version);
        if (byVersion !== 0) return byVersion;

        const byPurl = compareNullableStrings(left.purl, right.purl);
        if (byPurl !== 0) return byPurl;

        const bySupplier = compareNullableStrings(left.supplier, right.supplier);
        if (bySupplier !== 0) return bySupplier;

        const byLicense = compareNullableStrings(left.license, right.license);
        if (byLicense !== 0) return byLicense;

        return compareNullableStrings(left.hash, right.hash);
    });
}

function normalizeCreatedAt(value: number | undefined): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    return Date.now();
}

function normalizeSourceFile(sourceFile: string, fallback: string): string {
    const normalized = sourceFile.replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '');
    const withoutDot = normalized.replace(/^\.\//, '');
    const withoutLeadingSlash = withoutDot.replace(/^\/+/, '');

    return withoutLeadingSlash || fallback;
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

function compareNullableStrings(left: string | null, right: string | null): number {
    if (left === right) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left.localeCompare(right);
}

function toRecord(value: unknown): UnknownRecord | null {
    return isRecord(value) ? value : null;
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
