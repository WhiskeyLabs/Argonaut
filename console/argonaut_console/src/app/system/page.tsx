'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  ShieldAlert,
  Timer,
  CheckCircle2,
  ArrowDown,
  Zap,
  Expand,
  BarChart3,
  Target,
  Terminal,
  X
} from 'lucide-react';

interface NodeSpec {
  title: string;
  summary: string;
  responsibilities: string[];
  tags: string[];
  icon: string;
  meta: string;
}

const NODE_SPECS: Record<string, NodeSpec> = {
  'security-alerts': {
    title: 'Security Alert Ingress',
    summary: 'Normalizes real-time telemetry from external security tools (PagerDuty, Datadog) into the Argonaut Event Stream.',
    responsibilities: [
      'Webhook signature validation',
      'Event normalization to argonaut_schema',
      'Immediate state checkpointing'
    ],
    tags: ['External', 'Ingress', 'Streaming'],
    icon: 'https://cdn.simpleicons.org/pagerduty/ffffff',
    meta: 'PagerDuty / DD'
  },
  'appsec-scans': {
    title: 'AppSec Scan Ingress',
    summary: 'Ingests batch reports from SCA, SAST, and DAST tools. Extracts SARIF outputs and dependency relationships.',
    responsibilities: [
      'SARIF & SBOM parsing',
      'Dependency graph extraction',
      'Historical scan correlation'
    ],
    tags: ['External', 'Batch', 'Security Testing'],
    icon: 'https://cdn.simpleicons.org/snyk/ffffff',
    meta: 'Snyk / Veracode'
  },
  'supervisor-agent': {
    title: 'Supervisor Agent',
    summary: 'The primary cognitive router. Decides which worker agents to invoke based on alert classification.',
    responsibilities: [
      'Workflow state management',
      'Task decomposition',
      'Final approval & logic override'
    ],
    tags: ['Agent', 'Orchestration', 'Cognitive'],
    icon: 'ARGUS_Logo.png',
    meta: 'Router'
  },
  'triage-agent': {
    title: 'Triage Agent',
    summary: 'Specialized worker for initial data cleansing and formatting of incoming security alerts.',
    responsibilities: [
      'Schema enforcement',
      'Duplicate finding suppression',
      'Initial risk tagging'
    ],
    tags: ['Agent', 'Data Processing', 'Cleansing'],
    icon: 'ARGUS_Logo.png',
    meta: 'Worker'
  },
  'enrichment-agent': {
    title: 'Enrichment Agent',
    summary: 'Augments findings with external threat intelligence and internal code context.',
    responsibilities: [
      'Threat intel API integration (EPSS/KEV)',
      'Reaching out to reachability-builder',
      'Adding asset blast radius'
    ],
    tags: ['Agent', 'Intel', 'Enrichment'],
    icon: 'ARGUS_Logo.png',
    meta: 'Worker'
  },
  'action-agent': {
    title: 'Action Agent',
    summary: 'Responsible for downstream impact: creating tickets, posting summaries, and initiating auto-remediation.',
    responsibilities: [
      'Jira/Slack dynamic templating',
      'Notification throttling',
      'Remediation follow-up'
    ],
    tags: ['Agent', 'Automation', 'Integration'],
    icon: 'https://cdn.simpleicons.org/slack/ffffff',
    meta: 'Worker'
  },
  'es-state-index': {
    title: 'Elastic State Memory',
    summary: 'A purpose-built index providing stateful persistence for every LangChain workflow step.',
    responsibilities: [
      'Workflow checkpoint storage',
      'Audit log serialization',
      'Vector knowledge retrieval'
    ],
    tags: ['Data', 'Persistence', 'Memory'],
    icon: 'https://cdn.simpleicons.org/elasticsearch/ffffff',
    meta: 'argonaut_state'
  },
  'esql-pipeline': {
    title: 'ES|QL Scoring Engine',
    summary: 'Execute-in-database prioritization logic. Replaces slow application-side loops with native Elastic joins.',
    responsibilities: [
      'Cross-index joining (Findings + Intel)',
      'Mathematical ranking (Fix Priority Score)',
      'Aggregated system views'
    ],
    tags: ['Data', 'Analytics', 'ES|QL'],
    icon: 'https://cdn.simpleicons.org/kibana/ffffff',
    meta: 'In-Database'
  },
  'parse-engine': {
    title: 'Core Parser (@argus)',
    summary: 'The battle-tested normalization engine reused from Argus CLI for maximum schema consistency.',
    responsibilities: [
      'Recursive SARIF traversal',
      'Universal ID generation',
      'Validation ruleset application'
    ],
    tags: ['Logic', 'Parsing', 'Argus Core'],
    icon: 'ARGUS_Logo.png',
    meta: '@argus_core'
  },
  'reachability-builder': {
    title: 'Reachability Graph Builder',
    summary: 'Maps dependency lockfiles into visual trees to identify if a vulnerable library is actually called.',
    responsibilities: [
      'Lockfile v3 graph traversal',
      'Call path validation',
      'Pruning irrelevant alerts'
    ],
    tags: ['Logic', 'Graphs', 'Reachability'],
    icon: 'ARGUS_Logo.png',
    meta: '@argus_core'
  }
};

interface ContractSpec {
  title: string;
  subtitle: string;
  notes: string[];
}

const CONTRACT_SPECS: Record<string, ContractSpec> = {
  'state': {
    title: 'Workload State Contract',
    subtitle: 'Index: argonaut_state',
    notes: [
      'Uses @timestamp for strictly ordered event sequencing.',
      'Stores full JSON context for workflow resume logic.',
      'Retains memory for 90 days by default via ILM.'
    ]
  },
  'scoring': {
    title: 'Scoring & Ranking Contract',
    subtitle: 'ES|QL Functional Logic',
    notes: [
      'Fix Priority Score = (CVSS * 0.4) + (Reachability * 0.4) + (EPSS * 0.2).',
      'Joins happen at query time across 3 distinct indices.',
      'Output is a ranked set of "Fix-First" recommendations.'
    ]
  },
  'prompts': {
    title: 'Agent Instruction Contract',
    subtitle: 'Prompt Registry v2.4',
    notes: [
      'Zero-shot classification and chain-of-thought enrichment.',
      'Encrypted storage for API keys and endpoint secrets.',
      'Strict JSON schema validation for all agent outputs.'
    ]
  }
};

interface Counters {
  workflows: number;
  findings: number;
  latency: string | number;
  automation: number;
}

const EVENTS = [
  { source: 'PagerDuty', msg: 'Ingested raw SARIF alert #4022', time: 'Just Now', type: 'ingress' },
  { source: 'Supervisor', msg: 'Orchestrating enrichment for CVE-2024-001', time: '12s ago', type: 'orch' },
  { source: 'Enrichment', msg: 'Matched reachability path: payment.js -> lib.util', time: '24s ago', type: 'logic' },
  { source: 'ES|QL', msg: 'Calculated FPS: 8.4 (High Priority)', time: '40s ago', type: 'data' }
];

export default function SystemPage() {
  const [selectedNode, setSelectedNode] = useState('supervisor-agent');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showFlow, setShowFlow] = useState(true);
  const [modalContract, setModalContract] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [counters, setCounters] = useState<Counters>({
    workflows: 0,
    findings: 0,
    latency: 0,
    automation: 0
  });

  useEffect(() => {
    // Reveal animation logic
    const revealElements = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      });
    }, { threshold: 0 });

    revealElements.forEach(el => io.observe(el));

    // Animate counters
    const duration = 1000;
    const steps = 20;
    const interval = duration / steps;

    const targets = {
      workflows: 212,
      findings: 4502,
      latency: 1.4,
      automation: 94
    };

    let stepCount = 0;
    const timer = setInterval(() => {
      stepCount++;
      const progress = stepCount / steps;
      setCounters({
        workflows: Math.floor(targets.workflows * progress),
        findings: Math.floor(targets.findings * progress),
        latency: (targets.latency * progress).toFixed(1),
        automation: Math.floor(targets.automation * progress)
      });
      if (stepCount >= steps) clearInterval(timer);
    }, interval);

    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, []);

  const handleSimulate = () => {
    setIsSimulating(true);
    setTimeout(() => setIsSimulating(false), 2000);
  };

  const spec = NODE_SPECS[selectedNode];

  return (
    <div className="shell min-h-screen pb-12">
      <header className="masthead argonaut-panel p-8 mb-8 reveal">
        <div className="brand-row flex items-start justify-between gap-4 flex-wrap">
          <div className="hero-content max-w-4xl">
            <p className="eyebrow mb-2">Architecture Command Deck</p>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Argonaut System Visualization</h1>
            <p className="text-xl text-neutral-400 font-light max-w-2xl">
              Visualizing the Argonaut System Architecture: Knowledge Planes, Evidence Graphs, and Actionable Intelligence.
            </p>
            <div className="status-pills flex gap-3 mt-6 flex-wrap">
              <span className="pill bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs font-mono flex items-center gap-2">
                <span className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
                Live Workflows
              </span>
              <span className="pill bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs font-mono">Agent Pool: Active</span>
              <span className="pill bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs font-mono text-accent-blue">ES|QL Pipeline: Healthy</span>
            </div>
          </div>
          <button
            onClick={() => { }}
            className="argonaut-panel px-6 py-3 border-accent-blue/30 text-accent-blue hover:bg-accent-blue/10 transition-all flex items-center gap-2 font-mono text-sm uppercase tracking-wider"
          >
            <span className="w-2 h-2 bg-accent-blue rounded-full animate-ping" />
            Run System Pulse
          </button>
        </div>

        <div className="metrics-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
          <MetricCard
            title="Active Workflows"
            value={counters.workflows}
            icon={<Activity className="w-4 h-4" />}
            subtitle="Concurrent multi-agent triage processes."
          />
          <MetricCard
            title="Findings Triaged"
            value={counters.findings}
            icon={<ShieldAlert className="w-4 h-4" />}
            subtitle="Total findings parsed in current epoch."
          />
          <MetricCard
            title="Avg Resolution Time"
            value={`${counters.latency}s`}
            icon={<Timer className="w-4 h-4" />}
            subtitle="Latency from ingress to ticket."
          />
          <MetricCard
            title="Automation Rate"
            value={`${counters.automation}%`}
            icon={<CheckCircle2 className="w-4 h-4" />}
            subtitle="Alerts resolved autonomously."
          />
        </div>
      </header>

      <section className="section argonaut-panel p-8 mb-8 reveal">
        <div className="section-head mb-8">
          <h2 className="text-2xl font-bold text-white">Interactive Architecture Topology</h2>
          <p className="text-neutral-400 font-light mt-1">Isolate execution planes and inspect component responsibilities.</p>
        </div>

        <div className="topology-layout grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="map-panel lg:col-span-2 argonaut-panel overflow-hidden border-white/5 bg-white/2">
            <div className="map-toolbar p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <div className="segmented flex gap-2">
                {['all', 'ingress', 'orchestration', 'data', 'logic'].map(f => (
                  <button
                    key={f}
                    onClick={() => setActiveFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase tracking-wider transition-all ${activeFilter === f
                      ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                      : 'text-neutral-400 hover:text-white border border-transparent'
                      }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-3 cursor-pointer group">
                <span className="text-xs font-mono text-neutral-400 group-hover:text-white transition-colors">ACTIVITY RAILS</span>
                <input
                  type="checkbox"
                  checked={showFlow}
                  onChange={e => setShowFlow(e.target.checked)}
                  className="w-4 h-4 accent-accent-blue"
                />
              </label>
            </div>

            <div className={`topology-grid p-8 space-y-8 relative ${showFlow ? 'flow-active' : ''}`}>
              <Plane
                id="ingress"
                title="Ingress Plane"
                boundary="External Services"
                active={activeFilter === 'all' || activeFilter === 'ingress'}
              >
                <div className="grid grid-cols-2 gap-4">
                  <Node id="security-alerts" active={selectedNode === 'security-alerts'} onClick={setSelectedNode} />
                  <Node id="appsec-scans" active={selectedNode === 'appsec-scans'} onClick={setSelectedNode} />
                </div>
              </Plane>

              <div className={`flex justify-center transition-opacity duration-500 ${showFlow && activeFilter === 'all' ? 'opacity-100' : 'opacity-0'}`}>
                <ArrowDown className="text-accent-blue animate-bounce" />
              </div>

              <Plane
                id="orchestration"
                title="Agent Orchestration Plane"
                boundary="LangChain"
                active={activeFilter === 'all' || activeFilter === 'orchestration'}
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Node id="supervisor-agent" active={selectedNode === 'supervisor-agent'} onClick={setSelectedNode} />
                  <Node id="triage-agent" active={selectedNode === 'triage-agent'} onClick={setSelectedNode} />
                  <Node id="enrichment-agent" active={selectedNode === 'enrichment-agent'} onClick={setSelectedNode} />
                  <Node id="action-agent" active={selectedNode === 'action-agent'} onClick={setSelectedNode} />
                </div>
              </Plane>

              <div className={`flex justify-center transition-opacity duration-500 ${showFlow && activeFilter === 'all' ? 'opacity-100' : 'opacity-0'}`}>
                <ArrowDown className="text-accent-pink animate-bounce" />
              </div>

              <Plane
                id="data"
                title="Data & State Plane"
                boundary="Elastic Agent Builder"
                active={activeFilter === 'all' || activeFilter === 'data'}
              >
                <div className="grid grid-cols-2 gap-4">
                  <Node id="es-state-index" active={selectedNode === 'es-state-index'} onClick={setSelectedNode} />
                  <Node id="esql-pipeline" active={selectedNode === 'esql-pipeline'} onClick={setSelectedNode} />
                </div>
              </Plane>

              <div className={`flex justify-center transition-opacity duration-500 ${showFlow && activeFilter === 'all' ? 'opacity-100' : 'opacity-0'}`}>
                <ArrowDown className="text-accent-green animate-bounce" />
              </div>

              <Plane
                id="logic"
                title="Core Logic Plane"
                boundary="Argus Reuse"
                active={activeFilter === 'all' || activeFilter === 'logic'}
              >
                <div className="grid grid-cols-2 gap-4">
                  <Node id="parse-engine" active={selectedNode === 'parse-engine'} onClick={setSelectedNode} />
                  <Node id="reachability-builder" active={selectedNode === 'reachability-builder'} onClick={setSelectedNode} />
                </div>
              </Plane>
            </div>
          </div>

          <aside className="detail-panel space-y-6">
            <div className="argonaut-panel p-6 border-accent-blue/20 h-full">
              <div className="detail-head mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{spec.title}</h3>
                <span className="text-xs font-mono text-accent-blue uppercase tracking-widest">{selectedNode.replace('-', ' ')}</span>
              </div>
              <div className="detail-body space-y-6">
                <div className="flex gap-2 flex-wrap">
                  {spec.tags.map(t => (
                    <span key={t} className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest">{t}</span>
                  ))}
                </div>
                <p className="text-neutral-400 text-sm leading-relaxed font-light">{spec.summary}</p>
                <div className="space-y-3">
                  <h5 className="text-[10px] font-mono text-white/70 uppercase tracking-[0.2em]">Responsibilities</h5>
                  <ul className="space-y-2 text-sm text-white/80 font-light">
                    {spec.responsibilities.map(r => (
                      <li key={r} className="flex gap-2">
                        <span className="text-accent-blue">→</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button className="w-full mt-8 border border-white/10 py-3 rounded-xl text-xs font-mono uppercase tracking-widest hover:bg-white/5 transition-all flex items-center justify-center gap-2 text-neutral-400 hover:text-white">
                  <Expand className="w-3 h-3" />
                  Open Full Spec
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className="insight-grid grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8 reveal">
        <InsightCard title="Agent Workflow Latency" icon={<BarChart3 className="w-4 h-4" />}>
          <div className="space-y-4 pt-4">
            <LatencyBar label="Initial Fetch & Parse" value={12} text="120ms" color="accent-green" />
            <LatencyBar label="Threat Intel & Path" value={68} text="680ms" color="accent-yellow" />
            <LatencyBar label="Action & Routing" value={45} text="450ms" color="accent-pink" />
          </div>
        </InsightCard>

        <InsightCard title="System Confidence" icon={<Target className="w-4 h-4" />}>
          <div className="flex justify-around items-end h-full py-4">
            <ConfidenceRing value={98} label="Evidence" color="accent-blue" />
            <ConfidenceRing value={92} label="Paths" color="accent-green" />
            <ConfidenceRing value={87} label="Fixes" color="accent-pink" />
          </div>
        </InsightCard>

        <InsightCard title="Multi-Agent Event Stream" icon={<Terminal className="w-4 h-4" />}>
          <div className="space-y-3 pt-4 font-mono text-[10px]">
            {EVENTS.map((e, i) => (
              <div key={i} className="flex gap-3 border-l border-white/10 pl-3 py-1">
                <span className={`uppercase font-bold ${e.type === 'ingress' ? 'text-accent-blue' :
                  e.type === 'orch' ? 'text-accent-pink' :
                    e.type === 'data' ? 'text-accent-yellow' : 'text-accent-green'
                  }`}>{e.source}</span>
                <span className="text-white/60 truncate flex-1">{e.msg}</span>
                <span className="text-white/20">{e.time}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleSimulate}
            disabled={isSimulating}
            className="w-full mt-6 argonaut-panel border-white/10 py-2.5 rounded-lg text-[10px] font-mono uppercase tracking-widest hover:bg-white/5 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            <Zap className={`w-3 h-3 ${isSimulating ? 'text-accent-yellow animate-ping' : 'text-neutral-400 group-hover:text-accent-yellow'}`} />
            {isSimulating ? 'Simulating Ingress Spike...' : 'Trigger Webhook Spike'}
          </button>
        </InsightCard>
      </div>

      <section className="section argonaut-panel p-8 reveal">
        <div className="section-head mb-8">
          <h2 className="text-2xl font-bold text-white">Core Operating Contracts</h2>
          <p className="text-neutral-400 font-light mt-1">Deterministic behavior models for Argonaut agents.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(CONTRACT_SPECS).map(([id, c]) => (
            <button
              key={id}
              onClick={() => setModalContract(id)}
              className="argonaut-panel p-6 text-left hover:border-white/30 transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                <Terminal className="w-12 h-12" />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">{c.title}</h4>
              <p className="text-xs text-neutral-400 font-light leading-relaxed">{c.subtitle}</p>
              <div className="mt-4 text-[10px] font-mono text-accent-blue uppercase tracking-widest underline underline-offset-4">Inspect Logic</div>
            </button>
          ))}
        </div>
      </section>

      {modalContract && (
        <ContractModal
          contract={CONTRACT_SPECS[modalContract]}
          onClose={() => setModalContract(null)}
        />
      )}

      <footer className="mt-12 py-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-sans font-bold tracking-widest text-neutral-400 uppercase">
        <span>Argonaut Command Deck</span>
        <span className="text-accent-blue">Powered by Elastic Agent Builder</span>
        <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10">CONFIDENTIAL</span>
      </footer>
    </div>
  );
}

function MetricCard({ title, value, icon, subtitle }: { title: string; value: string | number; icon: React.ReactNode; subtitle: string }) {
  return (
    <div className="argonaut-panel p-6 bg-white/2 border-white/5 relative group overflow-hidden">
      <div className="absolute -inset-1 bg-gradient-to-r from-accent-blue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">{title}</span>
        <span className="text-accent-blue/60 group-hover:text-accent-blue transition-colors">{icon}</span>
      </div>
      <div className="text-4xl font-bold text-white mb-2 relative z-10 font-outfit">{value}</div>
      <p className="text-[11px] text-neutral-400 font-light leading-relaxed relative z-10">{subtitle}</p>
    </div>
  );
}

function Plane({ id, title, boundary, active, children }: { id: string; title: string; boundary: string; active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`plane p-6 rounded-2xl border transition-all duration-700 ${active
        ? 'bg-white/5 border-white/10 opacity-100 scale-100'
        : 'bg-transparent border-transparent opacity-10 scale-[0.98]'
        }`}
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xs font-mono font-bold text-white/70 uppercase tracking-[0.2em]">{title}</h3>
        <span className="text-[10px] font-mono border border-white/10 px-2 py-0.5 rounded-full text-neutral-400">{boundary}</span>
      </div>
      {children}
    </div>
  );
}

function Node({ id, active, onClick }: { id: string; active: boolean; onClick: (id: string) => void }) {
  const spec = NODE_SPECS[id];
  return (
    <button
      onClick={() => onClick(id)}
      className={`argonaut-panel p-4 text-left transition-all relative group overflow-hidden min-h-[100px] flex flex-col justify-center ${active
        ? 'border-accent-blue/50 bg-accent-blue/10'
        : 'border-white/5 bg-white/2 hover:border-white/20'
        }`}
    >
      <div className="flex items-center gap-2 mb-2 relative z-10">
        {spec.icon.startsWith('http') ? (
          <img src={spec.icon} className="w-4 h-4" alt="" />
        ) : (
          <img src={spec.icon} className={`w-4 h-4 ${active ? '' : 'brightness-0 invert opacity-40'}`} alt="" />
        )}
        <span className={`text-[11px] font-bold ${active ? 'text-white' : 'text-white/60'}`}>{spec.title.split(' ').slice(0, 2).join(' ')}</span>
      </div>
      <p className="text-[10px] text-neutral-400 leading-tight font-light relative z-10 line-clamp-2">{spec.summary}</p>
      <div className="mt-2 text-[9px] font-mono text-white/20 uppercase tracking-widest relative z-10">{spec.meta}</div>
    </button>
  );
}

function InsightCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="argonaut-panel p-6 border-white/5 bg-white/2">
      <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-4">
        <span className="text-accent-blue">{icon}</span>
        <h3 className="text-xs font-mono font-bold text-white/80 uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function LatencyBar({ label, value, text, color }: { label: string; value: number; text: string; color: 'accent-green' | 'accent-yellow' | 'accent-pink' }) {
  const colorMap = {
    'accent-green': 'bg-accent-green',
    'accent-yellow': 'bg-accent-yellow',
    'accent-pink': 'bg-accent-pink'
  };
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider">
        <span className="text-neutral-400">{label}</span>
        <span className="text-white">{text}</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorMap[color]} transition-all duration-1000 ease-out`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function ConfidenceRing({ value, label, color }: { value: number; label: string; color: 'accent-blue' | 'accent-green' | 'accent-pink' }) {
  const colorMap = {
    'accent-blue': 'text-accent-blue',
    'accent-green': 'text-accent-green',
    'accent-pink': 'text-accent-pink'
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`text-2xl font-bold font-mono ${colorMap[color]}`}>{value}%</div>
      <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">{label}</div>
    </div>
  );
}

function ContractModal({ contract, onClose }: { contract: ContractSpec; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <div className="argonaut-panel max-w-2xl w-full p-8 relative animate-in fade-in zoom-in duration-300">
        <button onClick={onClose} className="absolute top-6 right-6 text-neutral-400 hover:text-white transition-colors">
          <X className="w-6 h-6" />
        </button>
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-white mb-2">{contract.title}</h3>
          <p className="text-neutral-400 font-mono text-sm tracking-wide">{contract.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h5 className="text-[10px] font-mono text-white/70 uppercase tracking-[0.2em] pt-2">Responsibilities</h5>
            <ul className="space-y-3 text-sm text-white/80 font-light">
              <li className="flex gap-2"><span className="text-accent-blue">→</span><span>Maintains interface integrity.</span></li>
              <li className="flex gap-2"><span className="text-accent-blue">→</span><span>Strict validation rules.</span></li>
            </ul>
          </div>
          <div className="space-y-4">
            <h5 className="text-[10px] font-mono text-white/70 uppercase tracking-[0.2em] pt-2">Architecture Notes</h5>
            <ul className="space-y-3 text-sm text-white/80 font-light">
              {contract.notes.map(n => (
                <li key={n} className="flex gap-2"><span className="text-accent-blue">→</span><span>{n}</span></li>
              ))}
            </ul>
          </div>
        </div>
        <button onClick={onClose} className="w-full mt-10 bg-white/5 border border-white/10 py-4 rounded-xl text-xs font-mono uppercase tracking-widest hover:bg-white/10 transition-all text-white">
          Close Specification
        </button>
      </div>
    </div>
  );
}