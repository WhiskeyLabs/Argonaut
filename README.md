# Argonaut - The Agentic Security Triage Application

A context-driven security triage factory: pulls evidence from dev/security systems, normalizes, enriches, finds what matters, & pushes results back; **all orchestrated by Agent Builder tools**.  
It turns raw security artifacts (SARIF findings, SBOMs, and lockfiles) into **repeatable, auditable decisions**—executed by an **Agent Builder-style workflow** and persisted into **Elasticsearch + Kibana** for drilldown and proof.

> **Hackathon constraint embraced:** demos break when outputs drift. Argonaut is built around *determinism*: same inputs → same IDs → same rankings → same actions.

---

## Before vs After (User Journey)

### Before (typical reality)
- A scan runs → **hundreds/thousands of findings**
- Someone copies links into a spreadsheet
- Meetings to argue what’s real / what’s reachable
- “Fix it” becomes a vague backlog item
- No single place to answer: *what happened, what changed, what should we do now?*

### After (Argonaut)
1) **New bundle arrives** (SARIF + SBOM + lockfiles) and is grouped by application/build  
2) **Agents auto-triage each of these steps**: acquire → normalize → score → graph → threat intel → report  
3) Console shows “**Agent did this**” with stage timeline + task logs 
4) “**Human in the Loop processing**” You open Findings → drill into Research (graph, evidence, threat) → mark false positives  
5) One click generates a **consolidated report** and publishes it to Slack  
6) Kibana dashboards provide **proof**: runs, task logs, findings, actions—all queryable

---

## What it does

- **Bundle ingestion**: Treats SARIF + SBOM + lockfiles as one unit (`bundleId`) per app/build.
- **Agent-run workflow**: Runs as an Agent Builder-style pipeline with visible stages and task traces.
- **Deterministic scoring**: Stable IDs + stable ranking (same bundle → same output).
- **Dependency graph**: Builds a graph view so “why this matters” is visible, not a guess.
- **Threat intel enrichment**: Seeded KEV/EPSS joins for offline-friendly demos.
- **Fix bundles (optional)**: Reuses Argus fix generation logic to attach patch suggestions.
- **Elastic-native observability**: Every run and task is written to Elasticsearch and explorable in Kibana.
- **Slack output**: Update Slack spaces or owners at each stage with direct link to findings, reports and fixes.

---

## Why Elastic / Agent Builder matters here

Argonaut is designed to showcase the “agent” value in a way that’s hard to fake:
- **Run headers + stage summaries** (`argonaut_runs`)
- **Step-by-step task logs** (`argonaut_tasklogs`)
- **Findings + actions as first-class documents** (`argonaut_findings`, `argonaut_actions`)
- **Kibana dashboards and drilldowns** for evidence and proof

This makes the demo credible: you can always answer **what the agent did**, **when**, and **why**.

---

## Architecture (high level)

**Inputs → Agent Workflow → Elasticsearch → Kibana + Slack + Console**

- **Object storage** holds many demo bundles (hundreds of files) to simulate real pipelines.
- **Agents** pull bundles, verify hashes, normalize and score outputs deterministically.
- **Elasticsearch** stores artifacts, findings, actions, runs, task logs, and graph views.
- **Kibana** provides dashboards/drilldowns for runs, task logs, findings, and actions.
- **Argonaut Console** is the user-facing entry point (don’t start in Kibana).

---

## Quickstart (Elastic Cloud)

Prereqs:
- Node.js 18+
- Elastic Cloud deployment (Elasticsearch + Kibana)
- API keys stored locally (never commit secrets)

1) Load env
```bash
source infra/env/demo_cloud.env
source infra/env/demo_cloud.secrets.env
