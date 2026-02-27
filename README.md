Argonaut is an agentic auto triage workflow built on Elasticsearch and Kibana, with an Agent Builder style control loop and a chat surface for taking actions.

It turns messy scan outputs into a clean, queryable run with a real evidence trail. It also keeps the human in control. You can ask the agent what happened, why something was ranked high, and trigger safe actions like generating a fix bundle.

This started as a hackathon build, but I built it like something I would want to run every day. Deterministic, explainable, and safe by default.

## Why Argonaut
Security teams do not have a lack of data problem. They have a too much data, not enough clarity problem.

A typical scan produces SARIF, SBOMs, lockfiles, logs, plus a wall of findings. Then people do the same painful work every time.
Where are the files.
Which repo is this.
Which findings matter.
What is actually reachable.
What changed since last run.

Argonaut makes that messy middle boring and repeatable, so triage and fixes become the focus instead of file wrangling.

## What it does
Argonaut runs an Agent Builder style pipeline on an incoming bundle and persists the full run trail into Elasticsearch so Kibana can show exactly what the agent did, when, and why.

At a high level:
- Ingest and validate scan bundles deterministically
- Normalize artifacts into canonical document shapes
- Write run headers, task logs, and outputs into Elasticsearch in a predictable order
- Auto triage findings into slices like reachable and fixable
- Expose a chat driven agent surface to explain results and take actions
- Notify teams in Slack when scans land and when fix artifacts are ready

Argonaut does not auto apply changes. When you generate fixes, it produces a fix bundle artifact and uploads it to a secure location for developer review.

## Agentic workflow and chat actions
Argonaut is built around a simple control loop. The agent watches for new bundles, runs the pipeline, and records evidence for every stage. Then the human can drive the next steps through chat.

Examples of chat actions:
- "What changed since the last run for this app"
- "Show me only reachable findings with the highest priority"
- "Explain why these 7 are marked reachable"
- "Generate a fix bundle for the reachable set and post it to Slack"
- "Create a report summary and include Kibana drilldowns"

The important part is that chat is not a magic layer. Every action becomes a run step with a trace in Elasticsearch, so you can audit what happened later.

## How it works
Argonaut is intentionally evidence first.

Pipeline stages:
- **Acquire**: ingest bundle inputs deterministically and validate structure and hashes
- **Normalize**: convert artifacts into canonical document shapes with stable IDs and stable ordering
- **Write**: persist run state, task logs, and normalized outputs into Elasticsearch in a predictable order
- **Triage**: compute slices like reachable and fixable so humans can focus fast
- **Act**: generate fix bundles and reports as artifacts for review and controlled application
- **Notify**: post to Slack on intake and on fix bundle readiness

Elasticsearch is the source of truth.
Kibana and the console are views on top of that data.

## What makes it different
- **Deterministic runs**. Same input produces the same ordering and the same shapes.
- **Real evidence trail**. The agent story is backed by run headers and task logs in Elasticsearch.
- **Chat with guardrails**. You can ask questions and trigger actions, but every action is logged and reproducible.
- **Safe actioning**. Fixes are generated as artifacts and handed off for review. Nothing is auto applied.
- **Operator friendly**. Kibana dashboards are first class, not screenshots.

## Tech stack
- TypeScript, Node.js
- Elasticsearch
- Kibana
- Slack integration
- Agent Builder style pipeline and action loop
- Deterministic pipeline contracts and idempotent writes

## Project status
Hackathon build with real infrastructure behind it.
The core focus is reliability, traceability, and a clean handoff to developers.

## Links
- System overview: https://argonaut.whiskeylabs.io/system
- Demo video: [<add link>](https://www.youtube.com/watch?v=5V0XU-YEMvo)

## License
<add license>
