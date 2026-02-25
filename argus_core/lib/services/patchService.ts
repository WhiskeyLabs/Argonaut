import JSZip from 'jszip';
import { PatchBundle } from '@/lib/types/patch';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export class PatchService {

    /**
     * Validate a patch bundle for syntax and basic semantic rules.
     */
    validatePatch(patch: PatchBundle): ValidationResult {
        const errors: string[] = [];

        // 1. Basic Schema Validation (already done by AI Service, but double checking provided fields)
        if (!patch.patch_id || !patch.changes) {
            errors.push('Invalid patch structure: missing ID or changes');
            return { isValid: false, errors };
        }

        // 2. Diff Syntax Check
        patch.changes.forEach((change, index) => {
            // Unified diffs should contain hunk headers if they are valid
            if (!change.diff.includes('@@')) {
                // It might be a file creation/deletion, which still has @@ usually? 
                // Creating a new file: @@ -0,0 +1,5 @@
                // Deleting: @@ -1,5 +0,0 @@
                // But sometimes simple diffs might lack it if empty? Unlikely for a fix.
                errors.push(`Change #${index + 1} (${change.path}): Missing hunk header (@@)`);
            }
        });

        // 3. Path Safety Check
        patch.changes.forEach((change) => {
            if (change.path.includes('..') || change.path.startsWith('/')) {
                errors.push(`Unsafe file path detected: ${change.path}`);
            }
        });

        // 4. Forbidden Patterns (Simple heuristic)
        // e.g. preventing patches that introduce "TODO" or obvious placeholders
        patch.changes.forEach((change) => {
            if (change.diff.includes('<<<<<<< HEAD')) {
                errors.push(`Change #${index + 1} (${change.path}): Contains merge conflict markers`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * createBundle - Generate a ZIP file containing the patches and an apply script.
     */
    async createBundle(patches: PatchBundle[]): Promise<Blob> {
        const zip = new JSZip();

        // Root folder for the bundle
        const root = zip.folder('argus_fixes');
        if (!root) throw new Error('Failed to create zip folder');

        let applyScript = '#!/bin/bash\n\n# Argus Auto-Fix Applicator\n# Run this script from your project root.\n\n';

        patches.forEach((patch) => {
            const patchFolder = root.folder(patch.patch_id);
            if (!patchFolder) return;

            // readme.txt
            patchFolder.file('README.txt', `Fix: ${patch.summary}\nType: ${patch.type}\nRisk: ${patch.risk.level}\n\nNotes:\n${patch.risk.notes.join('\n')}`);

            // patches
            patch.changes.forEach((change, idx) => {
                const cleanPath = change.path.replace(/[\/\\]/g, '_');
                const patchFileName = `${idx}_${cleanPath}.diff`;
                patchFolder.file(patchFileName, change.diff);

                applyScript += `echo "Applying fix for: ${patch.summary} (${change.path})"\n`;
                // Use relative path from where the script is run (assuming root of zip is extracted)
                // Actually, if they extract 'argus_fixes', then inside is apply_all.sh
                // So the path to patch file is ./<patch_id>/<patchFileName>
                applyScript += `git apply --check "./${patch.patch_id}/${patchFileName}" && git apply "./${patch.patch_id}/${patchFileName}"\n`;
                applyScript += `if [ $? -ne 0 ]; then\n  echo "Failed to apply ${patchFileName}. Check for conflicts."\n  exit 1\nfi\n`;
            });

            applyScript += '\n';
        });

        applyScript += `echo "All fixes applied successfully."\n`;
        root.file('apply_all.sh', applyScript, { unixPermissions: '755' });

        return await zip.generateAsync({ type: 'blob' });
    }
}

export const patchService = new PatchService();
