import { readFile } from 'fs/promises';
import path from 'path';

const SAMPLE_ROOT = path.join(process.cwd(), 'synthetic_files', 'KEV test');

const ALLOWED_FILES = new Set([
    'kev-test-small.sarif',
    'kev-test-small-package-lock.json',
    'kev-test-medium.sarif',
    'kev-test-medium-package-lock.json',
    'kev-test-large.sarif',
    'kev-test-large-package-lock.json',
    'kev-threat-test.sarif',
]);

function contentTypeFor(filename: string): string {
    if (filename.endsWith('.sarif')) {
        return 'application/sarif+json';
    }
    if (filename.endsWith('.json')) {
        return 'application/json';
    }
    return 'application/octet-stream';
}

export const runtime = 'nodejs';

export async function GET(
    _request: Request,
    { params }: { params: { file: string } }
) {
    const fileName = decodeURIComponent(params.file);

    if (!ALLOWED_FILES.has(fileName)) {
        return new Response('File not found.', { status: 404 });
    }

    const filePath = path.join(SAMPLE_ROOT, fileName);

    try {
        const fileBuffer = await readFile(filePath);
        return new Response(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentTypeFor(fileName),
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch {
        return new Response('File not found.', { status: 404 });
    }
}
