// @ts-nocheck
'use client';

import { useEffect, useRef } from 'react';
import './system.css';

export default function SystemPage() {

  useEffect(() => {
    console.log('SystemPage: useEffect mounting');

    const initPage = () => {
      try {
        const revealElements = document.querySelectorAll('.reveal');
        console.log(`SystemPage: found ${revealElements.length} reveal elements`);

        if (revealElements.length === 0) return false; // Not ready

        const nodeSpecs = {
          'security-alerts': {
            title: 'Security Alert Ingress',
            summary: 'Normalizes real-time telemetry from external security tools (PagerDuty, Datadog) into the Argonaut Event Stream.',
            responsibilities: [
              'Webhook signature validation',
              'Event normalization to argonaut_schema',
              'Immediate state checkpointing'
            ],
            tags: ['External', 'Ingress', 'Streaming']
          },
          'appsec-scans': {
            title: 'AppSec Scan Ingress',
            summary: 'Ingests batch reports from SCA, SAST, and DAST tools. Extracts SARIF outputs and dependency relationships.',
            responsibilities: [
              'SARIF & SBOM parsing',
              'Dependency graph extraction',
              'Historical scan correlation'
            ],
            tags: ['External', 'Batch', 'Security Testing']
          },
          'supervisor-agent': {
            title: 'Supervisor Agent',
            summary: 'The primary cognitive router. Decides which worker agents to invoke based on alert classification.',
            responsibilities: [
              'Workflow state management',
              'Task decomposition',
              'Final approval & logic override'
            ],
            tags: ['Agent', 'Orchestration', 'Cognitive']
          },
          'triage-agent': {
            title: 'Triage Agent',
            summary: 'Specialized worker for initial data cleansing and formatting of incoming security alerts.',
            responsibilities: [
              'Schema enforcement',
              'Duplicate finding suppression',
              'Initial risk tagging'
            ],
            tags: ['Agent', 'Data Processing', 'Cleansing']
          },
          'enrichment-agent': {
            title: 'Enrichment Agent',
            summary: 'Augments findings with external threat intelligence and internal code context.',
            responsibilities: [
              'Threat intel API integration (EPSS/KEV)',
              'Reaching out to reachability-builder',
              'Adding asset blast radius'
            ],
            tags: ['Agent', 'Intel', 'Enrichment']
          },
          'action-agent': {
            title: 'Action Agent',
            summary: 'Responsible for downstream impact: creating tickets, posting summaries, and initiating auto-remediation.',
            responsibilities: [
              'Jira/Slack dynamic templating',
              'Notification throttling',
              'Remediation follow-up'
            ],
            tags: ['Agent', 'Automation', 'Integration']
          },
          'es-state-index': {
            title: 'Elastic State Memory',
            summary: 'A purpose-built index providing stateful persistence for every LangChain workflow step.',
            responsibilities: [
              'Workflow checkpoint storage',
              'Audit log serialization',
              'Vector knowledge retrieval'
            ],
            tags: ['Data', 'Persistence', 'Memory']
          },
          'esql-pipeline': {
            title: 'ES|QL Scoring Engine',
            summary: 'Execute-in-database prioritization logic. Replaces slow application-side loops with native Elastic joins.',
            responsibilities: [
              'Cross-index joining (Findings + Intel)',
              'Mathematical ranking (Fix Priority Score)',
              'Aggregated system views'
            ],
            tags: ['Data', 'Analytics', 'ES|QL']
          },
          'parse-engine': {
            title: 'Core Parser (@argus)',
            summary: 'The battle-tested normalization engine reused from Argus CLI for maximum schema consistency.',
            responsibilities: [
              'Recursive SARIF traversal',
              'Universal ID generation',
              'Validation ruleset application'
            ],
            tags: ['Logic', 'Parsing', 'Argus Core']
          },
          'reachability-builder': {
            title: 'Reachability Graph Builder',
            summary: 'Maps dependency lockfiles into visual trees to identify if a vulnerable library is actually called.',
            responsibilities: [
              'Lockfile v3 graph traversal',
              'Call path validation',
              'Pruning irrelevant alerts'
            ],
            tags: ['Logic', 'Graphs', 'Reachability']
          }
        };

        const contractSpecs = {
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

        function setupNavThemeToggle() {
          function setTheme(theme) {
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('argonaut-system-theme', theme);
            const sun = document.getElementById('themeSun');
            const moon = document.getElementById('themeMoon');
            const label = document.getElementById('themeLabel');
            if (sun && moon) {
              if (theme === 'dark') {
                sun.style.display = 'none';
                moon.style.display = 'block';
                if (label) label.textContent = 'DARK';
              } else {
                sun.style.display = 'block';
                moon.style.display = 'none';
                if (label) label.textContent = 'LIGHT';
              }
            }
          }
          const themeToggle = document.getElementById('navThemeToggle');
          if (themeToggle) {
            const savedTheme = localStorage.getItem('argonaut-system-theme');
            const initialTheme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme :
              (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            setTheme(initialTheme);
            themeToggle.addEventListener('click', () => {
              const currentTheme = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
              setTheme(currentTheme === 'dark' ? 'light' : 'dark');
            });
          }
        }

        function setupFilters() {
          const btns = document.querySelectorAll('.seg-btn');
          const grid = document.getElementById('topologyGrid');
          btns.forEach(btn => {
            btn.addEventListener('click', () => {
              btns.forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              const f = btn.getAttribute('data-filter');
              grid.className = 'topology-grid' + (f === 'all' ? ' flow-active' : '');
              document.querySelectorAll('.plane').forEach(p => {
                p.style.opacity = (f === 'all' || p.getAttribute('data-plane') === f) ? '1' : '0.15';
              });
              document.querySelectorAll('.flow-arrow').forEach(a => a.style.opacity = (f === 'all' ? '1' : '0'));
            });
          });
        }

        function setupToggles() {
          const flowToggle = document.getElementById('flowToggle');
          const grid = document.getElementById('topologyGrid');
          if (flowToggle) {
            flowToggle.addEventListener('change', (e) => {
              if (e.target.checked) grid.classList.add('flow-active');
              else grid.classList.remove('flow-active');
            });
          }
        }

        function setupNodes() {
          const nodes = document.querySelectorAll('.node');
          nodes.forEach(node => {
            node.addEventListener('click', () => {
              const id = node.getAttribute('data-node');
              const spec = nodeSpecs[id];
              if (spec) {
                document.getElementById('detailTitle').textContent = spec.title;
                document.getElementById('detailPlane').textContent = node.getAttribute('data-plane') + ' plane';
                document.getElementById('detailSummary').textContent = spec.summary;
                const tags = document.getElementById('detailTags');
                tags.innerHTML = '';
                spec.tags.forEach(t => {
                  const s = document.createElement('span'); s.className = 'chip'; s.textContent = t; tags.appendChild(s);
                });
                const list = document.getElementById('detailResponsibilities');
                list.innerHTML = '';
                spec.responsibilities.forEach(r => {
                  const li = document.createElement('li'); li.innerHTML = `<strong>${r.split(' ')[0]}</strong> ${r.split(' ').slice(1).join(' ')}`;
                  list.appendChild(li);
                });
                document.querySelectorAll('.node').forEach(n => n.classList.remove('active'));
                node.classList.add('active');
              }
            });
          });
          const firstNode = document.querySelector('.node[data-node="supervisor-agent"]');
          if (firstNode) firstNode.click();
        }

        function setupContracts() {
          const modal = document.getElementById('insightModal');
          const close = document.getElementById('modalClose');
          const contracts = document.querySelectorAll('.contract');
          contracts.forEach(c => {
            c.addEventListener('click', () => {
              const id = c.getAttribute('data-contract');
              const spec = contractSpecs[id];
              if (spec) {
                document.getElementById('modalTitle').textContent = spec.title;
                document.getElementById('modalSubtitle').textContent = spec.subtitle;
                const list = document.getElementById('modalResponsibilities');
                list.innerHTML = '<li>Maintains interface integrity.</li><li>Strict validation rules.</li>';
                const notes = document.getElementById('modalNotes');
                notes.innerHTML = '';
                spec.notes.forEach(n => { const li = document.createElement('li'); li.textContent = n; notes.appendChild(li); });
                modal.classList.add('active');
                modal.setAttribute('aria-hidden', 'false');
              }
            });
          });
          close.addEventListener('click', () => {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
          });
          modal.addEventListener('click', (e) => { if (e.target === modal) close.click(); });
        }

        function setupIncidentSimulation() {
          const btn = document.getElementById('simulateIncident');
          if (btn) {
            btn.addEventListener('click', () => {
              btn.disabled = true;
              btn.innerHTML = '<span class="status-indicator warning"></span> Simulating Ingress Spike...';
              setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="zap" class="line-icon"></i> Trigger Webhook Spike';
              }, 2000);
            });
          }
        }

        function setupPulse() {
          const btn = document.getElementById('pulseRun');
          if (btn) {
            btn.addEventListener('click', () => {
              btn.classList.add('active');
              setTimeout(() => btn.classList.remove('active'), 1000);
            });
          }
        }

        function renderEvents() {
          const feed = document.getElementById('eventFeed');
          if (!feed) return;
          const events = [
            { source: 'PagerDuty', msg: 'Ingested raw SARIF alert #4022', time: 'Just Now', type: 'ingress' },
            { source: 'Supervisor', msg: 'Orchestrating enrichment for CVE-2024-001', time: '12s ago', type: 'orch' },
            { source: 'Enrichment', msg: 'Matched reachability path: payment.js -> lib.util', time: '24s ago', type: 'logic' },
            { source: 'ES|QL', msg: 'Calculated FPS: 8.4 (High Priority)', time: '40s ago', type: 'data' }
          ];
          feed.innerHTML = events.map(e => `
            <div class="log-entry">
              <span class="log-src ${e.type}">${e.source}</span>
              <span class="log-msg">${e.msg}</span>
              <span class="log-time">${e.time}</span>
            </div>
          `).join('');
        }

        function animateCounters() {
          document.querySelectorAll('[data-counter]').forEach(el => {
            const target = parseFloat(el.getAttribute('data-counter'));
            const suffix = el.getAttribute('data-suffix') || '';
            let current = 0;
            const step = target / 20;
            const i = setInterval(() => {
              current += step;
              if (current >= target) { current = target; clearInterval(i); }
              el.textContent = current.toLocaleString(undefined, { maximumFractionDigits: (target < 10 ? 1 : 0) }) + suffix;
            }, 50);
          });
        }

        function animateBars() {
          document.querySelectorAll('.bar-fill').forEach(bar => {
            setTimeout(() => { bar.style.width = bar.getAttribute('data-width') + '%'; }, 300);
          });
        }

        function animateRings() {
          document.querySelectorAll('.ring').forEach(ring => {
            const val = ring.getAttribute('data-ring');
            ring.style.background = `conic-gradient(var(--brand-bright) ${val}%, transparent 0%)`;
          });
        }

        // Initialize Lucide
        let lucideRetries = 0;
        const pollLucide = () => {
          if (window.lucide) {
            window.lucide.createIcons();
          } else if (lucideRetries < 20) {
            lucideRetries++;
            setTimeout(pollLucide, 100);
          }
        };
        pollLucide();

        // Setup reveal logic
        const io = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('is-visible');
          });
        }, { threshold: 0 });

        revealElements.forEach(el => {
          io.observe(el);
          // Immediate visibility check
          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            el.classList.add('is-visible');
          }
        });

        // Emergency reveal fallback
        setTimeout(() => {
          revealElements.forEach(el => {
            if (!el.classList.contains('is-visible')) {
              el.classList.add('is-visible');
            }
          });
        }, 1000);

        // Run all setup
        setupNavThemeToggle(); setupFilters(); setupToggles(); setupNodes(); setupContracts(); setupIncidentSimulation(); setupPulse(); renderEvents(); animateCounters(); animateBars(); animateRings();
        return true; // Success
      } catch (err) {
        console.error('SystemPage: Initialization error:', err);
        return true; // Stop polling on error
      }
    };

    // Polling initialization
    let pollCount = 0;
    const pollInit = setInterval(() => {
      console.log(`SystemPage: polling ${pollCount}`);
      if (initPage() || pollCount > 60) {
        if (pollCount > 60) {
          console.warn('SystemPage: Polling timed out. Forcing reveal.');
          document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
        }
        clearInterval(pollInit);
      }
      pollCount++;
    }, 100);

    return () => {
      console.log('SystemPage: clearing interval');
      clearInterval(pollInit);
    };
  }, []);

  return (
    <div
      suppressHydrationWarning={true}
      dangerouslySetInnerHTML={{
        __html: `

  <div class="shell">
    <header class="masthead panel reveal">
      <div class="brand-row">
        <div class="hero-content">
          <p class="eyebrow">Architecture Command Deck</p>
          <h1 class="hero-title">Argonaut System Visualization</h1>
          <p class="hero-copy">
            A real-time visualization of the Argonaut multi-agent security triage factory. Illustrates the flow from
            alerts through LangChain-orchestrated agents, utilizing Elastic for deterministic state.
          </p>
          <div class="status-pills">
            <span class="pill"><span class="pulse-dot"></span><strong>Live Workflows</strong></span>
            <span class="pill"><strong>Agent Pool:</strong>&nbsp;Active</span>
            <span class="pill"><strong>ES|QL Pipeline:</strong>&nbsp;Healthy</span>
            <span class="pill"><strong>Argus Engine:</strong>&nbsp;Linked</span>
          </div>
        </div>
        <div class="action-strip">
          <button class="action-btn pulse-btn" id="pulseRun" type="button">
            <span class="heartbeat-dot" aria-hidden="true"></span>
            Run System Pulse
          </button>
        </div>
      </div>

      <div class="metrics-grid">
        <article class="metric-card">
          <div class="metric-top"><span>Active Workflows</span><span class="metric-icon"><i data-lucide="activity"></i></span></div>
          <div class="metric-val" data-counter="212">0</div>
          <p class="metric-sub">Concurrent multi-agent triage processes orchestrated by Supervisor.</p>
        </article>
        <article class="metric-card">
          <div class="metric-top"><span>Findings Triaged</span><span class="metric-icon"><i data-lucide="shield-alert"></i></span></div>
          <div class="metric-val" data-counter="4502">0</div>
          <p class="metric-sub">Total findings parsed and scored via ES|QL in the current epoch.</p>
        </article>
        <article class="metric-card">
          <div class="metric-top"><span>Avg Resolution Time</span><span class="metric-icon"><i data-lucide="timer"></i></span></div>
          <div class="metric-val" data-counter="1.4" data-suffix="s">0s</div>
          <p class="metric-sub">End-to-end latency from ingress to Jira ticket generation.</p>
        </article>
        <article class="metric-card">
          <div class="metric-top"><span>Automation Rate</span><span class="metric-icon"><i data-lucide="check-circle-2"></i></span></div>
          <div class="metric-val" data-counter="94" data-suffix="%">0%</div>
          <p class="metric-sub">Percentage of alerts resolved without human intervention.</p>
        </article>
      </div>
    </header>

    <section class="section panel reveal">
      <div class="section-head">
        <div>
          <h2 class="section-title">Interactive Architecture Topology</h2>
          <p class="section-note">Click any component node to inspect responsibilities and system bounds. Use filters to
            isolate execution planes.</p>
        </div>
      </div>

      <div class="topology-layout">
        <article class="map-panel">
          <div class="map-toolbar">
            <div class="segmented" id="planeFilters">
              <button class="seg-btn active" data-filter="all" type="button">All</button>
              <button class="seg-btn" data-filter="ingress" type="button">Ingress</button>
              <button class="seg-btn" data-filter="orchestration" type="button">Orchestration</button>
              <button class="seg-btn" data-filter="data" type="button">Data &amp; State</button>
              <button class="seg-btn" data-filter="logic" type="button">Core Logic</button>
            </div>
            <div class="toggle-cluster">
              <label class="toggle"><input id="flowToggle" type="checkbox" checked="">Activity Rails</label>
            </div>
          </div>

          <div class="topology-grid flow-active" id="topologyGrid">
            <section class="plane" data-plane="ingress">
              <div class="plane-head">
                <h3 class="plane-title">Ingress Plane</h3><span class="plane-boundary">External Services</span>
              </div>
              <div class="node-grid">
                <button class="node" data-node="security-alerts" data-plane="ingress" type="button"><span class="node-main"><img src="https://cdn.simpleicons.org/pagerduty/ffffff" width="14" height="14" alt="PagerDuty">Security Alerts</span><span class="node-sub">Real-time webhooks.</span><span class="node-meta">PagerDuty / DD</span></button>
                <button class="node" data-node="appsec-scans" data-plane="ingress" type="button"><span class="node-main"><img src="https://cdn.simpleicons.org/snyk/ffffff" width="14" height="14" alt="Snyk">AppSec Scans</span><span class="node-sub">Batch report intake.</span><span class="node-meta">Snyk / Veracode</span></button>
              </div>
            </section>
            <div class="flow-arrow ingress-to-orch">
              <i data-lucide="arrow-down"></i>
              <span>Alerts &amp; telemetry trigger agent workflows</span>
            </div>
            <section class="plane" data-plane="orchestration">
              <div class="plane-head">
                <h3 class="plane-title">Agent Orchestration Plane</h3><span class="plane-boundary">LangChain</span>
              </div>
              <div class="node-grid">
                <button class="node" data-node="supervisor-agent" data-plane="orchestration" type="button"><span class="node-main"><img src="ARGUS_Logo.png" width="14" height="14" alt="Argonaut" style="filter: brightness(0) invert(1);">Supervisor Agent</span><span class="node-sub">Cognitive
                    routing.</span><span class="node-meta">Router</span></button>
                <button class="node" data-node="triage-agent" data-plane="orchestration" type="button"><span class="node-main"><img src="ARGUS_Logo.png" width="14" height="14" alt="Argonaut" style="filter: brightness(0) invert(1);">Triage Agent</span><span class="node-sub">Formats raw
                    input.</span><span class="node-meta">Worker</span></button>
                <button class="node" data-node="enrichment-agent" data-plane="orchestration" type="button"><span class="node-main"><img src="ARGUS_Logo.png" width="14" height="14" alt="Argonaut" style="filter: brightness(0) invert(1);">Enrichment Agent</span><span class="node-sub">Gathers
                    TI &amp; paths.</span><span class="node-meta">Worker</span></button>
                <button class="node" data-node="action-agent" data-plane="orchestration" type="button"><span class="node-main"><img src="https://cdn.simpleicons.org/slack/ffffff" width="14" height="14" alt="Slack">Action Agent</span><span class="node-sub">Generates tickets.</span><span class="node-meta">Worker</span></button>
              </div>
            </section>
            <div class="flow-arrow orch-to-data">
              <i data-lucide="arrow-down"></i>
              <span>Agent state &amp; scoring persisted deterministically</span>
            </div>
            <section class="plane" data-plane="data">
              <div class="plane-head">
                <h3 class="plane-title">Data &amp; State Plane</h3><span class="plane-boundary">Elastic Agent Builder</span>
              </div>
              <div class="node-grid two-col">
                <button class="node" data-node="es-state-index" data-plane="data" type="button"><span class="node-main"><img src="https://cdn.simpleicons.org/elasticsearch/ffffff" width="14" height="14" alt="Elastic">State Index</span><span class="node-sub">Workflow memory.</span><span class="node-meta">argonaut_state</span></button>
                <button class="node" data-node="esql-pipeline" data-plane="data" type="button"><span class="node-main"><img src="https://cdn.simpleicons.org/kibana/ffffff" width="14" height="14" alt="Kibana">ES|QL Pipeline</span><span class="node-sub">Fix Priority Score.</span><span class="node-meta">In-Database</span></button>
              </div>
            </section>
            <div class="flow-arrow data-to-logic">
              <i data-lucide="arrow-down"></i>
              <span>Data models invoke core Argus parsing &amp; paths</span>
            </div>
            <section class="plane" data-plane="logic">
              <div class="plane-head">
                <h3 class="plane-title">Core Logic Plane</h3><span class="plane-boundary">Argus Reuse</span>
              </div>
              <div class="node-grid two-col">
                <button class="node" data-node="parse-engine" data-plane="logic" type="button"><span class="node-main"><img src="ARGUS_Logo.png" width="14" height="14" alt="Argonaut" style="filter: brightness(0) invert(1);">Parse Engine</span><span class="node-sub">Normalized
                    schemas.</span><span class="node-meta">@argus_core</span></button>
                <button class="node" data-node="reachability-builder" data-plane="logic" type="button"><span class="node-main"><img src="ARGUS_Logo.png" width="14" height="14" alt="Argonaut" style="filter: brightness(0) invert(1);">Reachability Builder</span><span class="node-sub">Lockfile graph
                    trees.</span><span class="node-meta">@argus_core</span></button>
              </div>
            </section>
          </div>
        </article>

        <aside class="detail-panel">
          <div class="detail-head">
            <h3 class="detail-title" id="detailTitle">Supervisor Agent</h3>
            <span class="chip" id="detailPlane">Orchestration Plane</span>
          </div>
          <div class="detail-body">
            <div class="chip-row" id="detailTags"></div>
            <p class="detail-copy" id="detailSummary"></p>
            <ul class="detail-list" id="detailResponsibilities"></ul>
            <div class="detail-actions">
              <button class="ghost-btn" id="openDetailModal" type="button"><i data-lucide="expand" class="line-icon"></i>Open Full Spec</button>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section class="insight-grid reveal">
      <article class="insight-card">
        <h3 class="insight-title"><i data-lucide="bar-chart-3" class="line-icon"></i>Agent Workflow Latency</h3>
        <div class="bar-stack">
          <div class="bar-row">
            <div class="bar-label"><span>Initial Fetch &amp; Parse</span><strong id="latencyLocalText">120ms</strong></div>
            <div class="bar-rail"><span class="bar-fill good" id="latencyLocal" data-width="12"></span></div>
          </div>
          <div class="bar-row">
            <div class="bar-label"><span>Threat Intel &amp; Reachability</span><strong id="latencyCloudText">680ms</strong>
            </div>
            <div class="bar-rail"><span class="bar-fill warn" id="latencyCloud" data-width="68"></span></div>
          </div>
          <div class="bar-row">
            <div class="bar-label"><span>Ticket Generation &amp; Routing</span><strong id="latencyAiText">450ms</strong>
            </div>
            <div class="bar-rail"><span class="bar-fill" id="latencyAi" data-width="45"></span></div>
          </div>
        </div>
      </article>

      <article class="insight-card">
        <h3 class="insight-title"><i data-lucide="target" class="line-icon"></i>System Confidence Rings</h3>
        <div class="rings">
          <div class="ring-item">
            <div class="ring" data-ring="98"><strong>98%</strong></div>
            <p>Threat Evidence</p>
          </div>
          <div class="ring-item">
            <div class="ring" data-ring="92"><strong>92%</strong></div>
            <p>Path Validation</p>
          </div>
          <div class="ring-item">
            <div class="ring" data-ring="87"><strong>87%</strong></div>
            <p>Suggested Fix</p>
          </div>
        </div>
      </article>

      <article class="insight-card">
        <h3 class="insight-title"><i data-lucide="terminal" class="line-icon"></i>Multi-Agent Event Stream</h3>
        <div id="eventFeed" class="log-stream" aria-live="polite"></div>
        <button class="ghost-btn" id="simulateIncident" type="button"><i data-lucide="zap" class="line-icon"></i>Trigger
          Webhook Spike</button>
      </article>
    </section>

    <section class="section panel reveal">
      <div class="section-head">
        <div>
          <h2 class="section-title">Core Operating Contracts</h2>
          <p class="section-note">Each contract below powers deterministic behavior in Argonaut. Click a contract card
            to inspect design intent.</p>
        </div>
      </div>
      <div class="contracts">
        <article class="contract" data-contract="state" tabindex="0" role="button">
          <h4>State Index</h4>
          <p>Index: <code>argonaut_state</code>. Maintains rigorous tracking of multi-agent workflows and checkpointing.
          </p>
        </article>
        <article class="contract" data-contract="scoring" tabindex="0" role="button">
          <h4>ES|QL Scoring Model</h4>
          <p>Mathematical representation of risk executed natively on Elasticsearch nodes for sub-second ranking.</p>
        </article>
        <article class="contract" data-contract="prompts" tabindex="0" role="button">
          <h4>System Prompts</h4>
          <p>Strict LLM boundaries ensuring structured JSON outputs and preventing hallucination.</p>
        </article>
      </div>
    </section>

    <footer class="footer reveal">
      <span>Argonaut Architecture Deck</span>
      <span>Powered by Elastic Agent Builder</span>
      <span>CONFIDENTIAL</span>
    </footer>
  </div>

  <div class="modal" id="insightModal" aria-hidden="true" role="dialog" aria-modal="true">
    <div class="modal-card">
      <div class="modal-head">
        <div>
          <h3 class="modal-title" id="modalTitle">Detail</h3>
          <p class="modal-sub" id="modalSubtitle"></p>
        </div>
        <button class="icon-btn" id="modalClose" type="button" aria-label="Close details"><i data-lucide="x" class="line-icon"></i></button>
      </div>
      <div class="chip-row" id="modalTags"></div>
      <div class="modal-grid">
        <section class="modal-block">
          <h5>Responsibilities</h5>
          <ul id="modalResponsibilities"></ul>
        </section>
        <section class="modal-block">
          <h5>Architecture Notes</h5>
          <ul id="modalNotes"></ul>
        </section>
      </div>
    </div>
  </div>

  
  


` }} />
  );
}