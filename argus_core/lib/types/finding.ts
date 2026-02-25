
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingStatus = 'open' | 'fixed' | 'ignored' | 'in_progress' | 'risk_accepted' | 'false_positive';

export type FindingType = 'SCA' | 'SAST' | 'SECRET' | 'IAC' | 'OTHER';

export type FixAction =
  | 'upgrade_libraries'
  | 'sanitize_inputs'
  | 'config_changes'
  | 'review_code'
  | 'other';

export type Reachability = 'reachable' | 'potentially_reachable' | 'unreachable' | 'unknown';

export interface CodeLocation {
  filepath: string;
  startLine: number;
  endLine?: number;
  snippet?: string; // Optional code context
}

export interface Project {
  id: string;             // UUID
  name: string;           // "Alethia-Core"
  rootPath?: string;      // "/Users/alice/dev/alethia" (inferred)
  createdAt: number;
  updatedAt: number;
}

export interface FindingEvent {
  id: string;             // UUID
  findingId: string;
  sessionId: string;
  actor: string;          // "user" | "system" | "policy"
  action: "triage" | "comment" | "rehydrate" | "expire";
  timestamp: number;
  diff?: Record<string, any>; // { from: "OPEN", to: "RISK_ACCEPTED" }
  reason?: string;
}

// Epic 5: Rich State Model
export type FindingStatusV2 = 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED';

export type Resolution =
  | 'FIXED'
  | 'ACCEPTED_RISK'
  | 'FALSE_POSITIVE'
  | 'WONT_FIX'
  | 'SUPPRESSED';

export type Scope = 'INSTANCE' | 'FILE' | 'RULE' | 'PACKAGE' | 'REPO';

export interface RehydrationMeta {
  matchedBy: 'PRIMARY' | 'SECONDARY' | 'DEPENDENCY';
  confidence: 'HIGH' | 'LOW';
  needsReview: boolean;
  matchedFindingId?: string;
}

export interface FindingState {
  status: FindingStatusV2;
  resolution?: Resolution;
  scope: Scope;
  expiresAt?: number;       // Mandatory if resolution === 'ACCEPTED_RISK'
  snoozedUntil?: number;
  reviewCadenceDays?: 30 | 60 | 90;
  rehydration?: RehydrationMeta;
  assignee?: string;
  priority?: "p0" | "p1" | "p2" | "p3";
}

export interface UniversalFinding {
  id: string;             // Hash(sessionId + ruleId + file + line)
  ruleId: string;         // Scanner-specific Rule ID
  title: string;          // Human readable title
  description: string;    // Full description
  severity: Severity;
  status: FindingStatus;  // @deprecated Use state.status in V2

  // Epic 5: Project Context & State
  projectId?: string;     // Link to parent project
  state?: FindingState;   // Rich State Model (v0.8+)

  // Pivot Fields
  sessionId: string;      // Foreign Key (indexed)
  packageName?: string;   // For SCA grouping (indexed)
  packageVersion?: string; // e.g. "4.17.15"
  purl?: string;          // Package URL (e.g. pkg:npm/lodash@4.17.21)

  // Normalization & Traceability
  findingType?: FindingType; // Normalized category
  runIndex?: number;        // Traceability for multi-run SARIF

  // Deduplication & Integrity
  dedupeKey: string;      // Hash(tool + ruleId + pkg + file + line)
  messageFingerprint: string;

  // Pivot Fields (Optimized)
  toolId: string;         // Normalized tool name
  severityRank: number;   // Numeric rank (Critical=4...)
  evidenceScore?: number; // 1 if snippet/evidence present, else 0

  // Location
  location: CodeLocation;

  // Metadata
  tool: string;           // "semgrep", "eslint"
  tags: string[];

  // Prioritization Signals
  reachability?: Reachability;
  isExploitable?: boolean;

  // Epic 6: Logic Plane Signals (Normalized Ranks)
  reachabilityRank?: number;   // 0: REACHABLE, 1: POTENTIAL, 2: NO_PATH, 3: UNKNOWN
  threatRank?: number;         // 0: KEV, 1: EPSS HIGH, 2: EPSS LOW, 3: ELSE
  cveId?: string;             // Derived Identifier (e.g., CVE-2023-1234)

  threat?: {
    kev?: boolean;
    epss?: number;            // 0-1
    source?: string;
    lastUpdated?: number;
  };

  evidencePeek?: {
    kind: 'source-sink' | 'trace' | 'dependency' | 'config' | 'snippet' | 'none';
    text: string;             // Truncated/Normalized single line
    detailRef?: string;       // Anchor to open drawer at specific location
  };

  projectMeta?: {
    name?: string;           // Display Name (App/Service)
    env?: string;            // e.g. "prod", "staging"
    owner?: string;          // Team or repo owner
  };

  // Action Grouping (Dashboard)
  fixAction?: FixAction;
  fixActionLabel?: string; // Display override ("Upgrade Libraries")

  // Task 4.7 - Live Intelligence Plane
  dependencyAnalysis?: {
    status: "REAL" | "UNAVAILABLE" | "ERROR";
    pathsFound: number;                 // 0 if none
    matchStrategy: "exact" | "closest_to_root" | "ambiguous" | "not_found";
    lockfileVersion?: number;           // 2/3
    computedAt: number;                 // epoch ms
  };

  userOverride?: {
    priority?: "p0" | "p1" | "p2" | "p3";     // manual urgency
    severityOverride?: "critical" | "high" | "medium" | "low" | "info"; // optional
    tags?: string[];                           // user-defined labels
    classification?: "needs_review" | "false_positive" | "accepted_risk" | "compensating_control";
    rationale?: string;                        // short free text
    updatedAt: number;
  };
}
