# Argonaut (Hackathon Edition)

Argonaut is a deterministic security triage workflow built on Elasticsearch and Agent Builder patterns.

## Judge Quickstart

Single command path (from clean workspace):

```bash
cd argus_core
DEMO_REPO=payment-service DEMO_BUILD_ID=128 DEMO_BUNDLE_PATH=demo-data/bundles/payment-service_build-128 npm run demo:judge
```

Expected result:
- Evidence generated under `program_management/epics/epic_5_demo_hardening_submission/evidence/`
- `determinism_report.json` present and passing
- `diff_report.txt` empty or timestamp-only

## Architecture (One Page)

```text
Acquire -> Normalize/Write -> Enrich -> Score -> Act (dry-run)
```

- Acquire ingests SARIF/lockfile/SBOM bundle.
- Enrich merges reachability + threat context.
- Score computes deterministic ranking and writeback.
- Act generates dry-run Jira/Slack payload intents and audit logs.

## What this is / What this isn't

This is:
- Deterministic demo pipeline with evidence capture.
- Dry-run action generation with auditability.

This is not:
- Live production automation with outbound ticket/post side effects.
- A replacement for production change-control workflows.

## Developer Path

```bash
cd argus_core
npm install
npm run test -- __tests__/data_plane/determinism.harness.test.ts
npm run test -- __tests__/agent_workflow/workflow.orchestrate.test.ts
```

Key docs:
- `program_management/roadmap_summary.md`
- `program_management/epics/epic_5_demo_hardening_submission/epic_5_master_plan.md`
- `program_management/epics/epic_5_demo_hardening_submission/evidence/README.md`
