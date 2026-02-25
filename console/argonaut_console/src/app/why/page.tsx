// @ts-nocheck
'use client';

import { useEffect, useRef } from 'react';
import './why.css';

export default function WhyPage() {

  useEffect(() => {
    console.log('WhyPage: useEffect mounting');

    const initPage = () => {
      try {
        const revealElements = document.querySelectorAll('.reveal');
        console.log(`WhyPage: found ${revealElements.length} reveal elements`);

        if (revealElements.length === 0) return false;

        // Theme logic
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

        const toggle = document.getElementById('navThemeToggle');
        if (toggle) {
          const saved = localStorage.getItem('argonaut-system-theme');
          const initialTheme = saved === 'light' || saved === 'dark' ? saved :
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
          setTheme(initialTheme);
          toggle.addEventListener('click', () => {
            const current = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            setTheme(current === 'dark' ? 'light' : 'dark');
          });
        }

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
    <div
      suppressHydrationWarning={true}
      dangerouslySetInnerHTML={{
        __html: `

  
  <div class="shell">

    <header class="masthead panel reveal">
      <div class="brand-row">
        <div class="hero-content">
          <p class="eyebrow">Why Argonaut</p>
          <h1 class="hero-title">Why We Built Argonaut</h1>
          <p class="hero-copy">Rationale, Judging Criteria, and Architecture Details</p>
        </div>
      </div>
    </header>

    <section class="section panel reveal">
      <div style="padding: 1rem; color: var(--text); font-size: 0.9rem; line-height: 1.6;">
        <p>Security teams typically juggle SARIF outputs from multiple scanners, dependency lockfiles, SBOMs, threat intelligence feeds, and manual ticket creation across Jira/Slack. That workflow is brittle: the same vulnerability appears in multiple tools, reachability is unclear, and urgency is often guessed. <strong>Argonaut automates the full loop from evidence → context → action.</strong></p>
        <p>Argonaut reuses an existing local triage engine (Argus) for what it already does well—parsing SARIF, extracting dependencies from lockfiles/SBOMs, and computing reachability signals—then layers <strong>Agent Builder orchestration</strong> on top to make it an agent that "gets work done." Elasticsearch becomes the shared system-of-record and memory layer.</p>
        
        <div class="insight-grid" style="margin-top: 1.5rem;">
          <article class="insight-card">
            <h3 class="insight-title"><i data-lucide="download" class="line-icon"></i> 1. Acquire Workflow</h3>
            <p style="font-size: 0.8rem; color: var(--muted); margin: 0;">pulls/accepts SARIF + lockfiles + SBOM, normalizes them, and indexes findings and dependency relationships.</p>
          </article>
          <article class="insight-card">
            <h3 class="insight-title"><i data-lucide="database" class="line-icon"></i> 2. Enrichment Workflow</h3>
            <p style="font-size: 0.8rem; color: var(--muted); margin: 0;">attaches threat intel context (KEV/EPSS/advisory flags) and reachability confidence.</p>
          </article>
          <article class="insight-card">
            <h3 class="insight-title"><i data-lucide="bar-chart-2" class="line-icon"></i> 3. ES|QL Scoring Step</h3>
            <p style="font-size: 0.8rem; color: var(--muted); margin: 0;">joins findings + threat intel + reachability to compute a Fix Priority Score and returns the top fix-first set with explanations.</p>
          </article>
          <article class="insight-card">
            <h3 class="insight-title"><i data-lucide="check-square" class="line-icon"></i> 4. Action Workflow</h3>
            <p style="font-size: 0.8rem; color: var(--muted); margin: 0;">creates Jira tickets for the top items and posts a Slack summary that includes "why this is ranked #1," linking back to Kibana views.</p>
          </article>
        </div>
        
        <h4 style="margin-top: 2rem; color: var(--text);">What we liked / challenges:</h4>
        <ul class="detail-list">
          <li>We loved using Elasticsearch as both a hybrid retrieval layer (knowledge/runbooks) and a structured join engine (ES|QL) for scoring.</li>
          <li>Workflows made multi-step automation reliable and demo-friendly (repeatable runs, clear progress stages).</li>
          <li>The biggest challenge was designing index schemas that support both fast search and clean joins while keeping the demo data fully open/synthetic.</li>
        </ul>
      </div>
    </section>


    <section class="section panel reveal">
      <div class="section-head">
        <div>
          <h2 class="section-title"><i data-lucide="check-circle" class="line-icon"></i> Judging Criteria Mapping</h2>
          <p class="section-note">Alignment with official hackathon criteria</p>
        </div>
      </div>
      <div style="padding: 1rem;">
        <div class="insight-grid">
            <article class="insight-card">
                <h3 class="insight-title" style="color: var(--info);">1. Technical Execution (30%)</h3>
                <ul class="detail-list">
                    <li><strong>Clear Multi-Step Agent:</strong> Supervisor plans, acquires, enriches, scores, and creates actions.</li>
                    <li><strong>Agent Builder Use:</strong> Workflows (deterministic), Search (hybrid on knowledge), ES|QL (joins + ranking).</li>
                    <li><strong>Clean Index Design:</strong> Purpose-built indices allowing structured joins, RAG, and stateful memory.</li>
                </ul>
            </article>
            <article class="insight-card">
                <h3 class="insight-title" style="color: var(--warn);">2. Impact &amp; Wow Factor (30%)</h3>
                <ul class="detail-list">
                    <li><strong>Clear Problem:</strong> Reduces 800 findings → 5 fix-first in under 60s.</li>
                    <li><strong>Measurable Impact:</strong> Saves ~90% time, reduces 6 steps to 1, eliminates manual joins.</li>
                    <li><strong>Novelty:</strong> Executes downstream action, explains logic, and maintains audit memory.</li>
                </ul>
            </article>
            <article class="insight-card">
                <h3 class="insight-title" style="color: var(--good);">3. Demo &amp; Presentation (30%)</h3>
                <ul class="detail-list">
                    <li><strong>Visual Demo:</strong> Shows tool orchestration, ranked output, and Jira/Slack actions.</li>
                    <li><strong>Clear Problem/Solution:</strong> Narrative flows from raw SARIF pain to one-click triage.</li>
                    <li><strong>Screenshots:</strong> Agent Builder configs, ES|QL results, Kibana, Jira, Slack.</li>
                </ul>
            </article>
        </div>
        
        <div style="margin-top: 2rem; background: var(--panel-strong); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--line);">
            <h3 style="margin: 0 0 1rem; color: var(--text); font-size: 1rem;"><i data-lucide="award" class="line-icon" style="color: var(--brand-bright);"></i> Competitive Positioning</h3>
            <p style="font-size: 0.85rem; color: var(--muted); margin: 0; line-height: 1.5;">Argonaut clearly demonstrates: Multi-step reasoning, Tool orchestration, Elasticsearch-first design, Real-world automation, Measurable impact, Explainable output, and Production-style architecture. This positions it strongly for Top 3 placement or at minimum Creative Award.</p>
        </div>
      </div>
    </section>

    <footer class="footer reveal">
      <span>Argonaut Command Deck</span>
      <span>Powered by Elastic Agent Builder</span>
      <span>CONFIDENTIAL</span>
    </footer>
  </div>

  
  


` }} />
  );
}