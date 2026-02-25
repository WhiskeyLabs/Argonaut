
import { z } from 'zod';

// Minimal SARIF schema focused on what we need
// We don't need to validate the entire 200-page spec, just the results.

export const SarifRegionSchema = z.object({
    startLine: z.number().optional(),
    endLine: z.number().optional(),
    snippet: z.object({ text: z.string().optional() }).optional(),
});

export const SarifLocationSchema = z.object({
    physicalLocation: z.object({
        artifactLocation: z.object({ uri: z.string() }).optional(),
        region: SarifRegionSchema.optional(),
    }).optional(),
});

export const SarifResultSchema = z.object({
    ruleId: z.string().optional(),
    message: z.object({ text: z.string().optional() }).optional(),
    level: z.enum(['error', 'warning', 'note', 'none']).optional(),
    locations: z.array(SarifLocationSchema).optional(),
    properties: z.record(z.string(), z.any()).optional(),
});

export const SarifRunSchema = z.object({
    tool: z.object({
        driver: z.object({
            name: z.string(),
            rules: z.array(z.object({
                id: z.string(),
                shortDescription: z.object({ text: z.string() }).optional(),
            })).optional(),
        }),
    }),
    results: z.array(SarifResultSchema).optional(),
});

export const SarifLogSchema = z.object({
    version: z.string().optional(),
    $schema: z.string().optional(),
    runs: z.array(SarifRunSchema),
});

export type SarifLog = z.infer<typeof SarifLogSchema>;
