// @ts-nocheck
'use client';

import { useEffect, useRef } from 'react';
import './journey.css';

export default function JourneyPage() {

  useEffect(() => {
    console.log('JourneyPage: useEffect mounting');

    const initPage = () => {
      try {
        const revealElements = document.querySelectorAll('.reveal');
        console.log(`JourneyPage: found ${revealElements.length} reveal elements`);

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

        return true;
      } catch (err) {
        console.error('JourneyPage: Initialization error:', err);
        return true;
      }
    };

    // Polling initialization
    let pollCount = 0;
    const pollInit = setInterval(() => {
      console.log(`JourneyPage: polling ${pollCount}`);
      if (initPage() || pollCount > 60) {
        if (pollCount > 60) {
          console.warn('JourneyPage: Polling timed out. Forcing reveal.');
          document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
        }
        clearInterval(pollInit);
      }
      pollCount++;
    }, 100);

    return () => {
      console.log('JourneyPage: clearing interval');
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
          <p class="eyebrow">User Journey</p>
          <h1 class="hero-title">Argonaut User Journey</h1>
          <p class="hero-copy">Before vs. After Argonaut: Eradicating Manual Triage Pain</p>
        </div>
      </div>
    </header>

    <div class="insight-grid">
      <!-- BEFORE -->
      <article class="insight-card" style="grid-column: span 1; border-color: rgba(239, 68, 68, 0.4);">
        <div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: rgba(239, 68, 68, 0.15); color: var(--danger); margin-bottom: 1rem;">
          <i data-lucide="frown" style="width: 24px; height: 24px;"></i>
        </div>
        <h2 style="margin: 0 0 0.5rem; color: var(--text); font-size: 1.2rem;">Before Argonaut</h2>
        <p style="color: var(--danger); font-weight: 600; font-size: 0.8rem; margin: 0 0 1rem; text-transform: uppercase;">Manual, Fragmented, Multi-System Triage</p>
        
        <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line);">
          <h4 style="font-size: 0.8rem; color: var(--muted); margin: 0 0 0.5rem; text-transform: uppercase;">Trigger Event</h4>
          <p style="font-size: 0.85rem; margin: 0;">CI pipeline completes. GitHub + SCA tool push new findings. Engineer receives SARIF alerts, Snyk notifications, emails, and Slack pings.</p>
        </div>

        <ul class="detail-list">
          <li><strong>Step 1: Tool Hopping (20-40m)</strong><span>Opening 8+ tools, downloading files, checking CVE pages manually. Cognitive overload.</span></li>
          <li><strong>Step 2: Manual Correlation (30-60m)</strong><span>Grepping codebase, inspecting dependency tree, checking exploit reports. Heuristic guesswork.</span></li>
          <li><strong>Step 3: Prioritization Guesswork (20m)</strong><span>Narrowing 800 findings down to 12. Subjective, not deterministic.</span></li>
          <li><strong>Step 4: Action Creation (20-30m)</strong><span>Manually creating Jira tickets, linking CVEs, posting to Slack.</span></li>
        </ul>
        
        <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border: 1px dashed rgba(239, 68, 68, 0.3);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-size: 0.8rem; color: var(--muted);">Total Time:</span>
            <strong style="color: var(--text);">1.5 to 3 hours</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 0.8rem; color: var(--muted);">Emotional State:</span>
            <strong style="color: var(--danger);">Cognitive overload, fatigue</strong>
          </div>
        </div>
      </article>

      <!-- ARROW INDICATOR (Desktop only normally, handled by grid layout here) -->
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; opacity: 0.6;">
        <i data-lucide="arrow-right" style="width: 48px; height: 48px; color: var(--text);"></i>
        <div style="font-family: 'IBM Plex Mono', monospace; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--info);">Transformation</div>
      </div>
      
      <!-- AFTER -->
      <article class="insight-card" style="grid-column: span 1; border-color: rgba(16, 185, 129, 0.4);">
        <div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: rgba(16, 185, 129, 0.15); color: var(--good); margin-bottom: 1rem;">
          <i data-lucide="smile" style="width: 24px; height: 24px;"></i>
        </div>
        <h2 style="margin: 0 0 0.5rem; color: var(--text); font-size: 1.2rem;">After Argonaut</h2>
        <p style="color: var(--good); font-weight: 600; font-size: 0.8rem; margin: 0 0 1rem; text-transform: uppercase;">Agent-Orchestrated, Context-Driven, Action-Complete</p>
        
        <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line);">
          <h4 style="font-size: 0.8rem; color: var(--muted); margin: 0 0 0.5rem; text-transform: uppercase;">Trigger Event</h4>
          <p style="font-size: 0.85rem; margin: 0; font-family: 'IBM Plex Mono', monospace; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 6px;">"Argonaut, triage payment-service build 128."</p>
        </div>

        <ul class="detail-list">
          <li><strong>Step 1: Acquisition (&lt;10s)</strong><span>Ingests SARIF, lockfile, SBOM. Normalizes findings automatically.</span></li>
          <li><strong>Step 2: Enrichment (&lt;15s)</strong><span>Matches CVEs to intel (KEV/EPSS), runs reachability, adds blast radius metadata.</span></li>
          <li><strong>Step 3: Deterministic Scoring (&lt;5s)</strong><span>ES|QL joins findings + intel + reachability. Ranks 800 findings → 5 fix-first automatically.</span></li>
          <li><strong>Step 4: Action (1 Click)</strong><span>Engineer clicks "Create Tickets". Argonaut creates Jira tickets and posts Slack summary.</span></li>
        </ul>
        
        <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border: 1px dashed rgba(16, 185, 129, 0.3);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-size: 0.8rem; color: var(--muted);">Total Time:</span>
            <strong style="color: var(--good);">&lt; 2 minutes</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 0.8rem; color: var(--muted);">Emotional State:</span>
            <strong style="color: var(--good);">Confidence, clarity, no guesswork</strong>
          </div>
        </div>
      </article>
    </div>

    <section class="section panel reveal">
      <div class="section-head">
        <div>
          <h2 class="section-title"><i data-lucide="git-compare" class="line-icon"></i> Side-by-Side Comparison</h2>
        </div>
      </div>
      <div style="padding: 1rem; overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
          <thead style="border-bottom: 1px solid var(--line); color: var(--muted); text-transform: uppercase; font-size: 0.75rem; font-family: 'IBM Plex Mono', monospace;">
            <tr>
              <th style="padding: 0.75rem; font-weight: 600;">Stage</th>
              <th style="padding: 0.75rem; font-weight: 600;">Before</th>
              <th style="padding: 0.75rem; font-weight: 600; color: var(--brand-bright);">After Argonaut</th>
            </tr>
          </thead>
          <tbody style="color: var(--text);">
            <tr style="border-bottom: 1px solid var(--line-strong);">
              <td style="padding: 0.75rem;">Tools opened</td>
              <td style="padding: 0.75rem; color: var(--danger);">5–8</td>
              <td style="padding: 0.75rem; color: var(--good); font-weight: bold;">1</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--line-strong);">
              <td style="padding: 0.75rem;">Manual joins</td>
              <td style="padding: 0.75rem; color: var(--danger);">Yes</td>
              <td style="padding: 0.75rem; color: var(--good); font-weight: bold;">No (ES|QL)</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--line-strong);">
              <td style="padding: 0.75rem;">Reachability check</td>
              <td style="padding: 0.75rem; color: var(--danger);">Manual grep</td>
              <td style="padding: 0.75rem; color: var(--good); font-weight: bold;">Automated</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--line-strong);">
              <td style="padding: 0.75rem;">Threat intel lookup</td>
              <td style="padding: 0.75rem; color: var(--danger);">Manual</td>
              <td style="padding: 0.75rem; color: var(--good); font-weight: bold;">Automated</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--line-strong);">
              <td style="padding: 0.75rem;">Ticket creation</td>
              <td style="padding: 0.75rem; color: var(--danger);">Manual</td>
              <td style="padding: 0.75rem; color: var(--good); font-weight: bold;">Automated</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--line-strong);">
              <td style="padding: 0.75rem;">Time</td>
              <td style="padding: 0.75rem; color: var(--danger);">1.5–3 hours</td>
              <td style="padding: 0.75rem; color: var(--good); font-weight: bold;">&lt; 2 minutes</td>
            </tr>
            <tr style="border-bottom: 1px solid var(--line-strong);">
              <td style="padding: 0.75rem;">Confidence</td>
              <td style="padding: 0.75rem; color: var(--warn);">Heuristic</td>
              <td style="padding: 0.75rem; color: var(--good); font-weight: bold;">Evidence-backed</td>
            </tr>
            <tr>
              <td style="padding: 0.75rem;">Audit trail</td>
              <td style="padding: 0.75rem; color: var(--warn);">Scattered</td>
              <td style="padding: 0.75rem; color: var(--good); font-weight: bold;">Centralized</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="section panel reveal" style="background: linear-gradient(135deg, rgba(29, 42, 122, 0.15) 0%, rgba(135, 26, 17, 0.15) 100%);">
      <div class="section-head">
        <div>
          <h2 class="section-title"><i data-lucide="globe" class="line-icon"></i> System-Level Impact</h2>
        </div>
      </div>
      <div style="padding: 1rem;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div>
            <h4 style="color: var(--danger); margin-top: 0;">Before</h4>
            <ul style="font-size: 0.85rem; color: var(--muted); padding-left: 1rem; line-height: 1.5;">
              <li>Triage knowledge lives in individuals.</li>
              <li>Prioritization varies between engineers.</li>
              <li>High cognitive load.</li>
              <li>Repeated manual steps every build.</li>
            </ul>
          </div>
          <div>
            <h4 style="color: var(--good); margin-top: 0;">After</h4>
            <ul style="font-size: 0.85rem; color: var(--text); padding-left: 1rem; line-height: 1.5; font-weight: 500;">
              <li>Triage becomes standardized.</li>
              <li>Prioritization is deterministic.</li>
              <li>Every decision is explainable.</li>
              <li>Action is integrated into workflow.</li>
            </ul>
          </div>
        </div>
        <div style="margin-top: 1.5rem; text-align: center;">
          <p style="font-style: italic; color: var(--info); font-size: 0.9rem;">"Before Argonaut, triage required manually correlating SARIF, lockfiles, CVE feeds, and Slack threads. After Argonaut, one request triggers structured ingestion, ES|QL joins, deterministic scoring, and automated Jira/Slack actions — all in under a minute."</p>
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