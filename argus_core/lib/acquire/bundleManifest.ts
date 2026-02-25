import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ArtifactType = 'sarif' | 'lockfile' | 'sbom' | 'other';

export type ArtifactEntry = {
    artifactId: string;
    artifactType: ArtifactType;
    tool: string;
    filename: string;
    objectKey: string;
    sha256: string;
    bytes: number;
};

export type BundleManifest = {
    manifestVersion: '1.0';
    bundleId: string;
    repo: string;
    buildId: string;
    createdAt: number;
    artifacts: ArtifactEntry[];
};

export function parseRepoBuild(folderName: string): { repo: string; buildId: string } {
    const marker = '_build-';
    if (folderName.includes(marker)) {
        const [repo, buildRest] = folderName.split(marker);
        return {
            repo: repo || 'unknown-repo',
            buildId: `build-${buildRest || 'unknown'}`,
        };
    }

    return {
        repo: 'unknown-repo',
        buildId: 'build-unknown',
    };
}

export function collectArtifactEntries(bundleDir: string, prefix: string, bundleId: string): ArtifactEntry[] {
    const artifactFiles = fs.readdirSync(bundleDir)
        .map((name) => path.join(bundleDir, name))
        .filter((filePath) => fs.statSync(filePath).isFile())
        .filter((filePath) => path.basename(filePath) !== 'bundle.manifest.json')
        .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

    const entries = artifactFiles.map((filePath, index) => {
        const filename = path.basename(filePath);
        const objectKey = `${prefix}/${bundleId}/artifacts/${filename}`;
        const stat = fs.statSync(filePath);

        return {
            artifactId: `A${index + 1}`,
            artifactType: detectArtifactType(filename),
            tool: detectTool(filename),
            filename,
            objectKey,
            sha256: sha256File(filePath),
            bytes: stat.size,
        } satisfies ArtifactEntry;
    });

    return sortArtifactsBySha(entries);
}

export function buildBundleManifest(params: {
    bundleId: string;
    repo: string;
    buildId: string;
    artifacts: ArtifactEntry[];
}): BundleManifest {
    const sortedArtifacts = sortArtifactsBySha(params.artifacts);

    return {
        manifestVersion: '1.0',
        bundleId: params.bundleId,
        repo: params.repo,
        buildId: params.buildId,
        createdAt: deriveCreatedAtFromArtifacts(sortedArtifacts),
        artifacts: sortedArtifacts,
    };
}

export function computeBundleHash(artifacts: ArtifactEntry[]): string {
    const sorted = sortArtifactsBySha(artifacts);
    return sha256String(sorted.map((artifact) => artifact.sha256).join(''));
}

export function stableManifestJson(manifest: BundleManifest): string {
    return `${JSON.stringify(stableSortObject(manifest), null, 2)}\n`;
}

export function sortArtifactsBySha(artifacts: ArtifactEntry[]): ArtifactEntry[] {
    return [...artifacts].sort((a, b) => a.sha256.localeCompare(b.sha256));
}

export function verifyFileChecksum(filePath: string, expectedSha256: string): { actualSha256: string; ok: boolean } {
    const actualSha256 = sha256File(filePath);
    return {
        actualSha256,
        ok: actualSha256 === expectedSha256,
    };
}

export function validateManifestShape(manifest: BundleManifest, bundleId: string): void {
    if (manifest.manifestVersion !== '1.0') {
        throw new Error(`Manifest version mismatch for bundleId=${bundleId}. Expected 1.0.`);
    }

    if (manifest.bundleId !== bundleId) {
        throw new Error(`Manifest bundleId mismatch: expected ${bundleId}, got ${manifest.bundleId}.`);
    }

    if (!Array.isArray(manifest.artifacts)) {
        throw new Error(`Manifest artifacts must be an array for bundleId=${bundleId}.`);
    }
}

function deriveCreatedAtFromArtifacts(artifacts: ArtifactEntry[]): number {
    const createdAtSeed = sha256String(artifacts.map((artifact) => artifact.sha256).join('|')).slice(0, 12);
    const createdAtNumeric = Number.parseInt(createdAtSeed, 16);

    if (!Number.isFinite(createdAtNumeric)) {
        return 1700000000000;
    }

    return 1700000000000 + (createdAtNumeric % 1000000);
}

function sha256File(filePath: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256String(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
}

function detectArtifactType(filename: string): ArtifactType {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.sarif') || lower.endsWith('.sarif.json')) return 'sarif';
    if (lower === 'package-lock.json' || lower === 'yarn.lock' || lower.includes('lock')) return 'lockfile';
    if (lower.includes('sbom') || lower.endsWith('.spdx.json') || lower.endsWith('.cyclonedx.json') || lower.endsWith('.cdx.json')) return 'sbom';
    return 'other';
}

function detectTool(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.includes('semgrep')) return 'semgrep';
    if (lower.includes('trivy')) return 'trivy';
    if (lower.includes('grype')) return 'grype';
    if (lower.includes('npm')) return 'npm';
    return 'unknown';
}

function stableSortObject(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => stableSortObject(entry));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort((a, b) => a.localeCompare(b))) {
        result[key] = stableSortObject(source[key]);
    }

    return result;
}
