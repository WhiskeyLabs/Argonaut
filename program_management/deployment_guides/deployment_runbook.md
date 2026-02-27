# Argonaut Deployment Runbook

## Purpose

This runbook defines the standard deployment flow for Argonaut with Elasticsearch as the primary deployment target.

## Primary Deployment Target

- Platform: Elasticsearch (Elastic Cloud)
- Endpoint: `https://181b87a59c5a48b2ad19c7e9bca48622.us-central1.gcp.cloud.es.io:443`
- API key (base64): `Y0pEZWhwd0JvN0hGVW5aeHlvUHM6aHpObk95STBoQzFlbC1sTTVsWUtqZw==`

## Deployment Ownership

- Owner: Argonaut engineering team
- Change type: controlled release (pre-release checks + verification)

## Pre-Deployment Checklist

1. Confirm Epic/task scope is complete and documented.
2. Confirm required governance docs are updated:
   - `program_management/product/product_vision.md`
   - `program_management/product/product_requirements.md`
   - `program_management/architecture/data_dictionary.md`
   - `program_management/architecture/architectural_decisions.md`
   - `program_management/architecture/system_context.md`
3. Confirm hygiene scans are clean.
4. Confirm local build/test for release scope is passing.

## Required Environment Variables

Set in deployment environment before running deploy commands:

- `ELASTICSEARCH_URL=https://181b87a59c5a48b2ad19c7e9bca48622.us-central1.gcp.cloud.es.io:443`
- `ELASTICSEARCH_API_KEY=Y0pEZWhwd0JvN0hGVW5aeHlvUHM6aHpObk95STBoQzFlbC1sTTVsWUtqZw==`

Object store (Task 6.15 demo bundles):

- `DEMO_OBJECTSTORE_ENDPOINT=https://us-east-1.linodeobjects.com`
- `DEMO_OBJECTSTORE_BUCKET=argonaut`
- `DEMO_OBJECTSTORE_PREFIX=bundles`
- `DEMO_OBJECTSTORE_ACCESS_KEY_ID` (secret; local only)
- `DEMO_OBJECTSTORE_SECRET_ACCESS_KEY` (secret; local only)

Recommended file layout:

- committed template: `infra/env/demo_objectstore.env`
- local-only secrets: `infra/env/demo_objectstore.secrets.env` (gitignored)

Kibana / Agent Builder (ASK ARGONAUT chat — Task 7.15):

- `KIBANA_URL=https://00e22b0210f947ffaa719eb2c6a7d395.us-central1.gcp.cloud.es.io`
- `KIBANA_API_KEY=<base64 api key>` (secret; stored in `.env.local`)
- `ELASTIC_AGENT_ID=954d9b3d-abb0-48af-a3b6-1af6eac1d78f` (connector: `argonaut-llm-primary`, model: `gpt-4o-mini-2024-07-18`)
- `KIBANA_SPACE=` (optional, leave blank for default space)

## Deployment Procedure

1. Prepare release candidate (version/tag aligned with release scope).
2. Apply or validate index templates/mappings needed by Argonaut:
   - `argonaut_artifacts`
   - `argonaut_findings`
   - `argonaut_deps`
   - `argonaut_sbom`
   - `argonaut_reachability`
   - `argonaut_threatintel`
   - `argonaut_actions`
   - `argonaut_knowledge`
3. Deploy ingestion and workflow components.
4. Deploy agent orchestration configuration.
5. Run smoke test ingestion with sample artifact.
6. Validate tool path execution (Search, ES|QL, Workflows).

## Verification Procedure

1. Connectivity check:
   - Cluster health reachable via `ELASTICSEARCH_URL` with `ELASTICSEARCH_API_KEY`.
2. Data path check:
   - Confirm documents are written to `argonaut_artifacts` and `argonaut_findings`.
3. Orchestration check:
   - Confirm end-to-end execution: AcquireAndNormalize -> EnrichAndScore -> ActAndNotify.
4. Action check:
   - Confirm action audit records appear in `argonaut_actions`.
5. Demo readiness check:
   - Confirm ranked fix-first output and explanation panel are functional.

## Rollback Procedure

1. Pause new workflow triggers.
2. Revert agent/workflow config to last known-good release.
3. Re-run smoke checks against the previous release.
4. Document rollback reason and impact in Epic/release notes.

## Incident Handling

1. Capture failing step, error payload, and timestamp.
2. Determine whether failure is connector, indexing, ES|QL/query, or action integration.
3. Apply deterministic fix first; avoid prompt-only workarounds.
4. Re-run verification checklist.

## Security and Credential Handling

- Treat API keys as sensitive credentials.
- If this runbook is committed to a shared/public repository, rotate the API key immediately and replace plaintext with secret-manager references.
- Prefer loading credentials from environment/secret store in CI/CD.

## Operational Notes

- This runbook aligns with `program_management/release_strategy.md` section 3.4 (Pre-Release workflow).
- Post-Epic hygiene execution remains mandatory per `program_management/deployment_guides/post_epic_hygiene_runbook.md`.
