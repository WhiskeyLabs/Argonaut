export interface PatchBundle {
    patch_id: string; // UUID
    type: 'dependency_update' | 'code_fix';
    summary: string;
    risk: {
        level: 'low' | 'medium' | 'high';
        notes: string[];
    };
    changes: Array<{
        path: string; // relative file path
        diff: string; // standard unified diff
    }>;
    validation_results?: {
        syntax_check: 'PASS' | 'FAIL';
        semantic_check: 'PASS' | 'FAIL';
        notes: string[];
    };
}
