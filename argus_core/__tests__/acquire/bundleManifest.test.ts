import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  buildBundleManifest,
  collectArtifactEntries,
  computeBundleHash,
  stableManifestJson,
  verifyFileChecksum,
} from '../../lib/acquire/bundleManifest';

function createTempBundle(files: Array<{ name: string; content: string }>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argonaut-bundle-test-'));
  for (const file of files) {
    fs.writeFileSync(path.join(dir, file.name), file.content, 'utf8');
  }
  return dir;
}

describe('bundle manifest generation', () => {
  test('collectArtifactEntries excludes bundle.manifest.json and sorts by sha256 ASC', () => {
    const bundleDir = createTempBundle([
      { name: 'z-findings.sarif.json', content: 'zeta' },
      { name: 'a-package-lock.json', content: 'alpha' },
      { name: 'bundle.manifest.json', content: '{"stale":true}' },
    ]);

    const entries = collectArtifactEntries(bundleDir, 'bundles', 'bundle-001');
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.filename).includes('bundle.manifest.json')).toBe(false);

    const sortedHashes = [...entries.map((entry) => entry.sha256)].sort((a, b) => a.localeCompare(b));
    expect(entries.map((entry) => entry.sha256)).toEqual(sortedHashes);
  });

  test('buildBundleManifest + stableManifestJson are deterministic for same input', () => {
    const bundleDir = createTempBundle([
      { name: 'findings.sarif.json', content: '{"runs":[]}' },
      { name: 'package-lock.json', content: '{"name":"svc"}' },
    ]);

    const entriesA = collectArtifactEntries(bundleDir, 'bundles', 'payment-service_build-128');
    const entriesB = collectArtifactEntries(bundleDir, 'bundles', 'payment-service_build-128');

    const manifestA = buildBundleManifest({
      bundleId: 'payment-service_build-128',
      repo: 'payment-service',
      buildId: 'build-128',
      artifacts: entriesA,
    });

    const manifestB = buildBundleManifest({
      bundleId: 'payment-service_build-128',
      repo: 'payment-service',
      buildId: 'build-128',
      artifacts: entriesB,
    });

    const jsonA = stableManifestJson(manifestA);
    const jsonB = stableManifestJson(manifestB);

    expect(jsonA).toBe(jsonB);
    expect(computeBundleHash(entriesA)).toBe(computeBundleHash(entriesB));
  });

  test('verifyFileChecksum reports mismatch deterministically', () => {
    const bundleDir = createTempBundle([
      { name: 'artifact.json', content: '{"ok":true}' },
    ]);

    const filePath = path.join(bundleDir, 'artifact.json');
    const correct = verifyFileChecksum(filePath, verifyFileChecksum(filePath, '').actualSha256);
    expect(correct.ok).toBe(true);

    const mismatch = verifyFileChecksum(filePath, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(mismatch.ok).toBe(false);
    expect(mismatch.actualSha256).toHaveLength(64);
  });
});
