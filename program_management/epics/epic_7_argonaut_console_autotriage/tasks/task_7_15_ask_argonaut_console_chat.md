# Task 7.15: "ASK ARGONAUT" Console Chat (Agent Builder Q&A Only)

**Status:** Planned  
**Epic:** EPIC 7 — Argonaut Console Demo Experience  
**Owner:** Track 1 (Console) + Track 3 (Integrations)  
**Estimate:** M  
**Depends on:** Task 7.5 (Grid), Task 7.6 (Drawer), Task 7.7 (Threat Intel Enrichment)

---

## Objective

Add a Q&A-only chat experience in the Argonaut Console powered by the Elastic Agent Builder AI Agent. A flashing top-nav button labeled **ASK ARGONAUT** opens a chat panel where users can ask run-scoped questions and get grounded answers from Elasticsearch-backed data.

**Phase 1 is read-only:** no tool actions, no writes, no fix generation.

---

## User Experience (Locked)

### Entry Point (Top Nav)

- Add a top-nav button: **ASK ARGONAUT**
- Visual state:
  - **Flashing/pulsing** when closed (subtle; stops after first open per session)
  - **Solid** when open
- Button is visible globally in Console.

### Chat Panel

Opens as a **right-side drawer/panel overlay** (consistent with Research Drawer behavior).

Contains:
- Chat transcript (user + agent)
- Input box
- Context pill: `Run: <runId>` (required when on a run page)
- Optional context pills when relevant:
  - `Finding: <findingId>` (if invoked from drawer)
  - `Selection: N findings` (if invoked from grid selection)

When **not** on a run page, panel shows:  
> "Open a run to ask run-scoped questions." (no freeform global querying in Phase 1)

### Supported Questions (examples to validate)

1. "What are the top reachable KEVs?"
2. "Why is finding F-123 ranked higher than F-456?"
3. "Summarize this run in 5 bullets"

### Safety/Scope Rules (Locked)

- Agent answers must be **run-scoped**.
- **No** actions/tools that mutate state.
- **No** direct Slack posting.
- **No** fix generation.
- If user asks for an action: agent responds with *"I can explain and summarize in this mode. Use the buttons in the UI to take actions."*

---

## Architecture (Locked)

### Core Pattern

```
Console → Console backend route → Kibana Agent Builder API → Console
```

- Browser **never** calls Kibana directly.
- Kibana credentials live **server-side only**.

### Required Backend Route

**`POST /api/agent/chat`**

Request body:

```json
{
  "runId": "run_123",
  "context": {
    "findingId": "F-001",
    "findingIds": ["F-001", "F-002"],
    "activeFilters": { "reachableOnly": true, "kevOnly": true }
  },
  "message": "What are the top reachable KEVs?",
  "conversationId": "optional-stable-id"
}
```

Response body:

```json
{
  "conversationId": "conv_abc",
  "answer": "…",
  "citations": [
    { "type": "finding", "runId": "run_123", "findingId": "F-001" }
  ]
}
```

### Kibana Agent Builder Call (Server-Side)

- Use the existing agent in Elastic Cloud (Agent Builder) by ID (configurable).
- Use `KIBANA_BASE_URL`, `KIBANA_API_KEY`, `KIBANA_SPACE` (optional) env vars.
- Always set `kbn-xsrf: true`.

> [!IMPORTANT]
> Phase 1 uses Q&A only. No tool execution; no external calls from the agent besides reading the provided context.

---

## Data Grounding Contract (Locked)

To prevent hallucinated answers, the backend must provide a compact **"Run Context Packet"** to the agent on every call.

### Run Context Packet (server-generated)

Backend fetches and includes in the prompt:

#### Run Summary
- `runId`
- `repo` / `buildId` (if present)
- Run timestamps / stage status (optional)

#### Top Findings Slices (deterministic)

| Slice | Filter | Count |
|---|---|---|
| Top findings | none | 10 |
| Top reachable | `context.reachability.reachable=true` | 10 |
| Top KEV | `context.threat.kev=true` | 10 |
| Top reachable+KEV | both | 10 |

**Locked sort:** `priorityScore desc, findingId asc`

#### Fields Included Per Finding (minimal)

| Field | Required |
|---|---|
| `findingId` | ✅ |
| `title` | ✅ |
| `package` + `version` | if present |
| `cve` | if present |
| `priorityScore` | ✅ |
| `context.threat.kev` | ✅ |
| `context.threat.epss` | ✅ |
| `context.reachability.reachable` | ✅ |
| `priorityExplanation.summary` | if available |

#### Pairwise Compare Packet

Only when question references **two findingIds**:
- Fetch both findings fully (same minimal fields + explanation summary)
- Include a computed diff stub: `scoreDelta`, `kevDelta`, `epssDelta`, `reachableDelta`

### Locked Guidance to Agent (System Prompt)

- *"Answer only using the provided context packet. If data is missing, say what is missing."*
- *"Never invent CVEs, packages, or counts."*
- *"If asked to take action, explain how to do it in the UI."*

---

## UI Components (Implementation)

### New Components

| Component | Description |
|---|---|
| `AskArgonautButton.tsx` | Top nav button; pulsating state until first open (`localStorage`) |
| `AskArgonautPanel.tsx` | Chat transcript + input; shows context pills; loads/saves `conversationId` per `runId` (`localStorage`) |

### Modifications

- **Top nav layout** — include the button.
- **Run Page and Research Drawer** — add "Ask about this" entry points:
  - Optional: a small link that opens chat with `findingId` prefilled.

---

## Logging & Observability (Locked)

### Tasklogs

Every chat submission emits a tasklog entry:

| Field | Value |
|---|---|
| `index` | `argonaut_tasklogs` |
| `stage` | `ASK_ARGONAUT` |
| `message` | `ASK_ARGONAUT question received` / `ASK_ARGONAUT response generated` |
| `runId` | when present |
| `findingId` | when present |

### Actions (optional — recommended)

Write an action doc for audit:

| Field | Value |
|---|---|
| `actionType` | `AGENT_QA` |
| `runId` | run being queried |
| `status` | `SUCCEEDED` / `FAILED` |
| `idempotencyKey` | `AGENT_QA:<runId>:<sha256(question+context)>` |

> [!NOTE]
> Store the full transcript externally (payload is disabled); store only hashes and references in mapped fields. If scope is tight, skip action docs in Phase 1 and rely on tasklogs.

---

## Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| 1 | Top nav shows **ASK ARGONAUT** button with a subtle pulse until first open | Visual test |
| 2 | On a run page, chat answers are run-scoped and grounded to ES-derived context | Ask the 3 target questions |
| 3 | "What are the top reachable KEVs?" returns correct, non-hallucinated response with findingIds | Compare to ES query result |
| 4 | Pairwise ranking explanation for two findings is accurate | Verify scores/KEV/EPSS deltas |
| 5 | 5-bullet run summary covers findings count, severity distribution, top CVEs | Verify vs. run data |
| 6 | When user asks for an action, agent refuses politely and points to the UI | Ask "generate a fix" |
| 7 | Every chat exchange writes `ASK_ARGONAUT` tasklogs | Query `argonaut_tasklogs` |
| 8 | Kibana API credentials **never** reach the browser | Inspect network tab |

---

## File Change Summary (Planned)

| File | Change | Type |
|---|---|---|
| `src/components/AskArgonautButton.tsx` | Top-nav chat button with pulse animation | NEW |
| `src/components/AskArgonautPanel.tsx` | Chat drawer with transcript, input, context pills | NEW |
| `src/lib/agentChat.ts` | Server-side Agent Builder API client + context packet builder | NEW |
| `src/app/api/agent/chat/route.ts` | `POST /api/agent/chat` — proxy to Kibana Agent Builder | NEW |
| Top nav layout | Add `AskArgonautButton` | MODIFY |
| Run page / Research Drawer | Optional "Ask about this" links | MODIFY |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Agent hallucinating beyond context packet | Medium | System prompt locks answers to provided context; validate with 3 target questions |
| Kibana Agent Builder API latency | Medium | Set 30s timeout; show "thinking..." animation; cache context packet per runId for 60s |
| Context packet too large for agent | Low | Minimal field set per finding; max 40 findings across all slices (deduped) |
| Credentials leak to browser | Low | All Kibana calls server-side; env vars never serialized to client |

---

## Implementation Notes (Non-negotiables)

1. **Phase 1 is Q&A only.** No tools that write to ES, no Slack, no fix generation.
2. **All answers must be grounded** to the server-provided context packet.
3. **Deterministic slices** must use locked sort: `priorityScore desc, findingId asc`.
4. **Tool calls authenticate** using a shared secret header (`X-Agent-Key`), consistent with the fix agent pattern.

---

## Artifacts

| Artifact | Contents |
|---|---|
| `tasks/artifacts/task_7_15/ask_argonaut_contract_v1.md` | API contract (`/api/agent/chat`), context packet schema, UI behavior rules, logging requirements |
