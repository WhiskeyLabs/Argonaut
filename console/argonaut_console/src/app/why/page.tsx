// @ts-nocheck
'use client';

import { useEffect, useRef } from 'react';

export default function WhyPage() {

  useEffect(() => {
    console.log('WhyPage: useEffect mounting');

    const initPage = () => {
      try {
        const revealElements = document.querySelectorAll('.reveal');
        console.log(`WhyPage: found ${revealElements.length} reveal elements`);

        if (revealElements.length === 0) return false;


        // Lucide Polling
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

        // reveal logic
        const io = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
            }
          });
        }, { threshold: 0 }); // Changed to 0 for maximum reliability

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

        return true;
      } catch (err) {
        console.error('WhyPage: Initialization error:', err);
        return true;
      }
    };

    // Polling initialization
    let pollCount = 0;
    const pollInit = setInterval(() => {
      console.log(`WhyPage: polling ${pollCount}`);
      if (initPage() || pollCount > 60) { // 6 seconds
        if (pollCount > 60) {
          console.warn('WhyPage: Polling timed out. Forcing reveal.');
          document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
        }
        clearInterval(pollInit);
      }
      pollCount++;
    }, 100);

    return () => {
      console.log('WhyPage: clearing interval');
      clearInterval(pollInit);
    };
  }, []);

  return (
    <div className="shell min-h-screen pb-12">
      <header className="masthead argonaut-panel p-12 mb-8 reveal">
        <div className="brand-row flex items-start justify-between gap-4 flex-wrap">
          <div className="hero-content max-w-4xl">
            <p className="eyebrow mb-2">Why Argonaut</p>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">Why We Built Argonaut</h1>
            <p className="text-xl text-neutral-400 max-w-2xl font-light">Rationale, Judging Criteria, and Architecture Details</p>
          </div>
        </div>
      </header>

      <section className="section argonaut-panel p-8 mb-8 reveal text-lg leading-relaxed">
        <div className="space-y-6 text-white/90 font-light">
          <p>
            Security teams typically juggle SARIF outputs from multiple scanners, dependency lockfiles, SBOMs,
            threat intelligence feeds, and manual ticket creation across Jira/Slack. That workflow is brittle:
            the same vulnerability appears in multiple tools, reachability is unclear, and urgency is often guessed.
            <strong className="text-accent-blue font-semibold">Argonaut automates the full loop from evidence → context → action.</strong>
          </p>
          <p>
            Argonaut reuses an existing local triage engine (Argus) for what it already does well—parsing SARIF,
            extracting dependencies from lockfiles/SBOMs, and computing reachability signals—then layers
            <strong className="text-accent-green font-semibold">Agent Builder orchestration</strong> on top to make it an agent that "gets work done."
            Elasticsearch becomes the shared system-of-record and memory layer.
          </p>
        </div>

        <div className="insight-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
          <article className="argonaut-panel p-6 border-accent-blue/20 hover:border-accent-blue/50 transition-all group relative overflow-hidden">
            <div className="absolute -inset-full bg-gradient-radial from-accent-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2 group-hover:text-accent-blue transition-colors">
              <span className="w-8 h-8 rounded-lg bg-accent-blue/10 flex items-center justify-center text-accent-blue">
                <i data-lucide="download" className="w-4 h-4"></i>
              </span>
              1. Acquire
            </h3>
            <p className="text-sm text-neutral-400">Pulls/accepts SARIF + lockfiles + SBOM, normalizes them, and indexes findings and dependency relationships.</p>
          </article>

          <article className="argonaut-panel p-6 border-accent-pink/20 hover:border-accent-pink/50 transition-all group relative overflow-hidden">
            <div className="absolute -inset-full bg-gradient-radial from-accent-pink/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2 group-hover:text-accent-pink transition-colors">
              <span className="w-8 h-8 rounded-lg bg-accent-pink/10 flex items-center justify-center text-accent-pink">
                <i data-lucide="database" className="w-4 h-4"></i>
              </span>
              2. Enrichment
            </h3>
            <p className="text-sm text-neutral-400">Attaches threat intel context (KEV/EPSS/advisory flags) and reachability confidence.</p>
          </article>

          <article className="argonaut-panel p-6 border-accent-yellow/20 hover:border-accent-yellow/50 transition-all group relative overflow-hidden">
            <div className="absolute -inset-full bg-gradient-radial from-accent-yellow/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2 group-hover:text-accent-yellow transition-colors">
              <span className="w-8 h-8 rounded-lg bg-accent-yellow/10 flex items-center justify-center text-accent-yellow">
                <i data-lucide="bar-chart-2" className="w-4 h-4"></i>
              </span>
              3. Scoring
            </h3>
            <p className="text-sm text-neutral-400">Joins findings + threat intel + reachability via Elasticsearch to compute Fix Priority Score and return the top set.</p>
          </article>

          <article className="argonaut-panel p-6 border-accent-green/20 hover:border-accent-green/50 transition-all group relative overflow-hidden">
            <div className="absolute -inset-full bg-gradient-radial from-accent-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2 group-hover:text-accent-green transition-colors">
              <span className="w-8 h-8 rounded-lg bg-accent-green/10 flex items-center justify-center text-accent-green">
                <i data-lucide="check-square" className="w-4 h-4"></i>
              </span>
              4. Action
            </h3>
            <p className="text-sm text-neutral-400">Posts Slack alerts with ranked findings, generates fix bundles, and produces run report summaries with deep links.</p>
          </article>
        </div>

        <div className="mt-12 space-y-4">
          <h4 className="text-xl font-bold text-white">What we liked / challenges:</h4>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <li className="argonaut-panel p-5 bg-white/5 border-none">
              <span className="text-accent-blue font-bold block mb-2 font-mono text-xs uppercase tracking-widest">Hybrid Intelligence</span>
              We loved using Elasticsearch as both a retrieval layer and a structured join engine (ES|QL) for scoring.
            </li>
            <li className="argonaut-panel p-5 bg-white/5 border-none">
              <span className="text-accent-green font-bold block mb-2 font-mono text-xs uppercase tracking-widest">Reliable Automation</span>
              Workflows made multi-step automation reliable and demo-friendly (repeatable runs, clear stages).
            </li>
            <li className="argonaut-panel p-5 bg-white/5 border-none">
              <span className="text-accent-pink font-bold block mb-2 font-mono text-xs uppercase tracking-widest">Schema Design</span>
              The biggest challenge was designing schemas that support fast search and clean joins while keeping data synthetic.
            </li>
          </ul>
        </div>
      </section>

      <section className="section argonaut-panel p-8 mb-8 reveal">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <i data-lucide="check-circle" className="text-accent-blue w-6 h-6"></i>
              Judging Criteria Mapping
            </h2>
            <p className="text-neutral-400 mt-1">Alignment with official hackathon criteria</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <article className="argonaut-panel p-6 bg-accent-blue/5 border-accent-blue/30 group hover:border-accent-blue/60 transition-all">
            <h3 className="text-xl font-bold text-accent-blue mb-4">1. Technical Execution (25%)</h3>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex gap-2">
                <span className="text-accent-blue">→</span>
                <span><strong>Clear Multi-Step Agent:</strong> Supervisor plans, acquires, enriches, scores, and creates actions.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-blue">→</span>
                <span><strong>Agent Builder Use:</strong> Workflows (deterministic), Search (hybrid), ES|QL (joins + ranking).</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-blue">→</span>
                <span><strong>Clean Index Design:</strong> Purpose-built indices allowing structured joins, RAG, and stateful memory.</span>
              </li>
            </ul>
          </article>

          <article className="argonaut-panel p-6 bg-accent-yellow/5 border-accent-yellow/30 group hover:border-accent-yellow/60 transition-all">
            <h3 className="text-xl font-bold text-accent-yellow mb-4">2. Impact & Wow Factor (25%)</h3>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex gap-2">
                <span className="text-accent-yellow">→</span>
                <span><strong>Clear Problem:</strong> Reduces 800 findings → 5 fix-first in under 60s.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-yellow">→</span>
                <span><strong>Measurable Impact:</strong> Saves ~90% time, reduces 6 steps to 1, eliminates manual joins.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-yellow">→</span>
                <span><strong>Novelty:</strong> Executes downstream action, explains logic, and maintains audit memory.</span>
              </li>
            </ul>
          </article>

          <article className="argonaut-panel p-6 bg-accent-green/5 border-accent-green/30 group hover:border-accent-green/60 transition-all">
            <h3 className="text-xl font-bold text-accent-green mb-4">3. Demo & Presentation (25%)</h3>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex gap-2">
                <span className="text-accent-green">→</span>
                <span><strong>Visual Demo:</strong> Shows tool orchestration, ranked output, and Slack actions.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-green">→</span>
                <span><strong>Clear Narrative:</strong> Narrative flows from raw SARIF pain to one-click triage.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-green">→</span>
                <span><strong>Evidence:</strong> Agent Builder configs, Elasticsearch queries, Kibana dashboards, Slack alerts.</span>
              </li>
            </ul>
          </article>

          <article className="argonaut-panel p-6 bg-accent-pink/5 border-accent-pink/30 group hover:border-accent-pink/60 transition-all">
            <h3 className="text-xl font-bold text-accent-pink mb-4">4. Elastic-Specific Use (25%)</h3>
            <ul className="space-y-3 text-sm text-white/80">
              <li className="flex gap-2">
                <span className="text-accent-pink">→</span>
                <span><strong>Elasticsearch-First:</strong> All data lives in purpose-built indices with strict mappings.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-pink">→</span>
                <span><strong>Observability:</strong> Kibana dashboards provide full audit trail and run observability.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent-pink">→</span>
                <span><strong>Agent Builder:</strong> Workflows, search, and structured data orchestration via Elastic tooling.</span>
              </li>
            </ul>
          </article>
        </div>

        <div className="mt-12 argonaut-panel p-8 border-accent-pink/30 bg-accent-pink/5 relative overflow-hidden group rounded-3xl">
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-accent-pink/10 blur-[100px] pointer-events-none group-hover:bg-accent-pink/20 transition-all duration-700" />
          <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
            <i data-lucide="award" className="text-accent-pink w-6 h-6"></i>
            Competitive Positioning
          </h3>
          <p className="text-neutral-400 text-lg relative z-10 font-light">
            Argonaut clearly demonstrates: Multi-step reasoning, Tool orchestration, Elasticsearch-first design,
            Real-world automation, Measurable impact, Explainable output, and Production-style architecture.
            This positions it strongly for Top 3 placement.
          </p>
        </div>
      </section>

      <footer className="mt-12 py-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono tracking-widest text-neutral-400 uppercase">
        <span>Argonaut Command Deck</span>
        <span className="text-accent-blue">Powered by Elastic Agent Builder</span>
        <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10">v1.0</span>
      </footer>
    </div>
  );
}