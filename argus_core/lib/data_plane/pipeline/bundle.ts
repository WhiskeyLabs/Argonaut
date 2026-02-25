import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { buildCanonicalHash, stableStringify } from '../../identity';
import type { ArtifactType, BundleArtifact } from './types';

type UnknownRecord = Record<string, unknown>;

export function loadBundleArtifacts(bundlePath: string): BundleArtifact[] {
    const files = readdirSync(bundlePath)
        .map((entry) => join(bundlePath, entry))
        .filter((filePath) => statSync(filePath).isFile())
        .sort((left, right) => left.localeCompare(right));

    return files.map((filePath) => {
        const content = readFileSync(filePath, 'utf8');
        const filename = filePath.split('/').pop() as string;

        return {
            filename,
            filePath,
            content,
            checksum: buildCanonicalHash({ filename, content }),
            type: detectArtifactType(filename),
            sourceTool: detectSourceTool(filename, content),
        } satisfies BundleArtifact;
    });
}

export function computeBundleId(repo: string, buildId: string, artifacts: BundleArtifact[]): string {
    const payload = {
        repo,
        buildId,
        files: artifacts
            .map((artifact) => ({
                filename: artifact.filename,
                checksum: artifact.checksum,
            }))
            .sort((left, right) => left.filename.localeCompare(right.filename)),
    };

    return buildCanonicalHash(payload);
}

export function detectArtifactType(filename: string): ArtifactType {
    const lower = filename.toLowerCase();

    if (lower.endsWith('.sarif') || lower.endsWith('.sarif.json')) {
        return 'sarif';
    }

    if (lower === 'package-lock.json' || lower === 'yarn.lock' || lower.endsWith('.lock')) {
        return 'lockfile';
    }

    if (lower.endsWith('.cdx.json') || lower.includes('cyclonedx') || lower.includes('sbom')) {
        return 'sbom';
    }

    return 'other';
}

function detectSourceTool(filename: string, content: string): string {
    if (filename.toLowerCase().includes('sarif')) {
        const parsed = tryParseJson(content);
        const toolName = normalizeString(parsed?.runs?.[0]?.tool?.driver?.name);
        return toolName ?? 'sarif';
    }

    if (filename === 'package-lock.json') {
        return 'npm';
    }

    if (filename === 'yarn.lock') {
        return 'yarn';
    }

    if (filename.toLowerCase().includes('sbom') || filename.toLowerCase().includes('cdx')) {
        return 'cyclonedx';
    }

    return 'unknown';
}

function tryParseJson(value: string): UnknownRecord | null {
    try {
        const parsed = JSON.parse(value) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return null;
        }

        JSON.parse(stableStringify(parsed));
        return parsed as UnknownRecord;
    } catch {
        return null;
    }
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
