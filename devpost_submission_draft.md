# Devpost Submission Draft

## Project Title
Argonaut: Deterministic Security Triage with Elasticsearch Agent Builder

## What it does
Argonaut ingests SARIF, lockfiles, and SBOM artifacts, enriches findings with reachability and threat context, computes deterministic priority scores, and generates dry-run Jira/Slack action payloads with full audit logging.

## How we built it
- Elasticsearch for state, joins, and scoring outputs.
- Deterministic Acquire -> Enrich -> Score -> Act workflow orchestration.
- Dry-run Jira/Slack payload generation with idempotent action records.
- Determinism harness validating no drift across repeated runs.

## Built with
- Elasticsearch / Kibana
- Node.js / TypeScript
- Agent Builder workflow and tool wiring

## Why it matters
Security teams spend hours manually correlating findings. Argonaut reduces this to a deterministic, explainable, replayable run with auditable outputs.

## Demo and Evidence
- Demo command: `npm run demo:judge`
- Evidence folder: `program_management/epics/epic_5_demo_hardening_submission/evidence/`
- Determinism proof: `determinism_report.json`, `diff_report.txt`

## Submission QA
- Claims in this draft must match `program_management/epics/epic_5_demo_hardening_submission/evidence/demo_script.md`.
- Do not claim live ticket execution (demo mode is dry-run).
