# EPIC 2 Mapping Bootstrap

## Source of truth

- Contract source: `argus_core/lib/data_plane/mappings/contracts.ts`
- Versioned snapshots: `argus_core/lib/data_plane/mappings/snapshots/*.json`

## Bootstrap CLI

Use:

```bash
ELASTIC_URL="https://<cluster>:443" \
ELASTIC_API_KEY="<api-key>" \
node scripts/bootstrapMappings.mjs
```

Validate-only mode:

```bash
ELASTIC_URL="https://<cluster>:443" \
ELASTIC_API_KEY="<api-key>" \
node scripts/bootstrapMappings.mjs --validate-only
```

Behavior:

- Creates missing indices using frozen mapping contracts.
- Validates existing index mappings exactly against snapshots.
- Fails fast on mapping drift or mapping-version mismatch.
