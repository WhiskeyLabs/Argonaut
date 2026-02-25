/**
 * Simple Unified Diff Generator
 * Used to create patch files from AI-generated suggestions without a heavy diff library.
 */

export function createSimpleDiff(path: string, original: string, modified: string, startLine: number = 1): string {
    // Handle empty strings gracefully
    const originalLines = original ? original.split('\n') : [];
    const modifiedLines = modified ? modified.split('\n') : [];

    // Construct the hunk header
    // Format: @@ -start,count +start,count @@
    // If count is 0, omit it? No, standard is 0.
    // Actually, if count is 1, it's omitted in some formats but standard usually includes range.
    // -start,count +start,count

    // Special case for empty original (creation)
    const oldStart = originalLines.length === 0 ? 0 : startLine;
    const oldCount = originalLines.length;

    const newStart = modifiedLines.length === 0 ? 0 : startLine;
    const newCount = modifiedLines.length;

    const chunkHeader = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;

    // Construct the diff body
    // Simply mark all original lines as removed (-) and all modified lines as added (+)
    // This is a "replacement" diff, not a minimized diff, but valid.
    const diffLines = [
        ...originalLines.map(l => `-${l}`),
        ...modifiedLines.map(l => `+${l}`)
    ];

    // Combine into full unified diff format
    return [
        `diff --git a/${path} b/${path}`,
        `index 0000000..0000000 100644`,
        `--- a/${path}`,
        `+++ b/${path}`,
        chunkHeader,
        ...diffLines,
        '' // Trailing newline
    ].join('\n');
}
