# User Settings UI/UX & Configuration

This document captures requirements for the **Settings Page** and **User Preferences** that must be implemented to support a production-grade experience. These settings must be persisted (e.g., via LocalStorage or IndexedDB) so they are retained across sessions/tab closes.

## 1. Grid Configuration (The "Grid" Epic)

The Data Grid is the central view of the application. Power users require control over what they see.

### A. Column Visibility
Users must be able to toggle columns on/off.

*   **Default Visible Columns**:
    *   Severity
    *   Status
    *   Title
    *   Package
    *   Location
    *   Tool
    *   CVE (Rule ID)

*   **Hidden by Default (Advanced / Future)**:
    *   Reachability / Confidence
    *   Exploit Signal (KEV)
    *   Owner
    *   Fix Action
    *   First Seen

**Requirement**: A "Columns" dropdown or Settings panel where these can be checked/unchecked.

### B. Persistence
*   **Column Widths**: If a user resizes a column, remember that width.
*   **Sorting Preference**: If a user prefers sorting by "Date" descending, remember it.
*   **Visibility**: Remember which columns are hidden.

## 2. General Preferences

### A. Appearance
*   **Theme**: Light / Dark / System (Currently relies on system/class, ensure persistence).
*   **Density**: Comfortable vs Compact grid rows (Future).

### B. Data & Privacy (Privacy by Default)
*   **Session Retention**: Option to "Always clear session on exit" vs "Keep previous session".
*   **External Intelligence**:
    *   **Enrichment (CVE/KEV)**: `OFF` (Default) | `ON`. When ON, fetches external vulnerability data (e.g. from OSV.dev).
    *   **AI Remediation**: `OFF` (Default) | `ON`. When ON, sends snippets to LLM for fix suggestions.
*   **Evidence Persistence**:
    *   **Store Locally**: `OFF` (Default) | `ON`. When ON, adheres to `EvidenceEvent` schema and persists logs to IndexedDB. Default behavior is session-memory only.

## 3. Implementation Plan (Roadmap)

*   [ ] **Settings Store**: Create a logical store (Zustand/Context) backed by `localStorage` to hold `Observer<Preferences>`.
*   [ ] **Settings Page**: A route `/settings` to manage these.
*   [ ] **Quick Actions**: A "View Options" button above the Grid for quick column toggling.
