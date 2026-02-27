// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import {
  Frown,
  Smile,
  ArrowRight,
  GitCompare,
  Globe,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Zap,
  ShieldCheck,
  Search,
  FileText,
  Download,
  Database,
  BarChart2,
  CheckSquare
} from 'lucide-react';

export default function WhyPage() {
  useEffect(() => {
    // Initial reveal logic
    const initPage = () => {
      try {
        const revealElements = document.querySelectorAll('.reveal');
        if (revealElements.length === 0) return false;

        const io = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
            }
          });
        }, { threshold: 0 });

        revealElements.forEach(el => io.observe(el));

        // Immediate reveal check
        revealElements.forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            el.classList.add('is-visible');
          }
        });

        return true;
      } catch (err) {
        return true;
      }
    };

    initPage();
  }, []);

  return (
    <div className="shell min-h-screen pb-12">
      <header className="masthead argonaut-panel p-12 mb-8 reveal">
        <div className="brand-row flex items-start justify-between gap-4 flex-wrap">
          <div className="hero-content max-w-4xl">
            <p className="eyebrow mb-2 text-xl">The Why?</p>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">Why We Built Argonaut</h1>
          </div>
        </div>
      </header>

      <section className="section argonaut-panel p-10 mb-8 reveal text-2xl leading-relaxed">
        <div className="space-y-8 text-white/90 font-light">
          <p>
            Security teams typically juggle SARIF outputs from multiple scanners, dependency lockfiles, SBOMs,
            threat intelligence feeds, and manual ticket creation across Jira/Slack. That workflow is brittle:
            the same vulnerability appears in multiple tools, reachability is unclear, and urgency is often guessed.
            <strong className="text-accent-blue font-semibold"> Argonaut automates the full loop from evidence → context → action.</strong>
          </p>
          <p>
            Argonaut uses a purpose built triage engine, layers
            <strong className="text-accent-green font-semibold"> Agent Builder orchestration</strong> on top with
            Elasticsearch as the shared system-of-record and memory layer to make it an agent system that gets work done;
            with the right Human In The Loop intervention to ensure there is verifiability and provenance.
          </p>
        </div>

        <div className="insight-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mt-16">
          <article className="argonaut-panel p-8 border-accent-blue/20 hover:border-accent-blue/50 transition-all group relative overflow-hidden">
            <div className="absolute -inset-full bg-gradient-radial from-accent-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-3 group-hover:text-accent-blue transition-colors">
              <span className="w-10 h-10 rounded-lg bg-accent-blue/10 flex items-center justify-center text-accent-blue">
                <Download className="w-5 h-5" />
              </span>
              1. Acquire
            </h3>
            <p className="text-lg text-neutral-400">Pulls/accepts SARIF + lockfiles + SBOM, normalizes them, and indexes findings and dependency relationships.</p>
          </article>

          <article className="argonaut-panel p-8 border-accent-pink/20 hover:border-accent-pink/50 transition-all group relative overflow-hidden">
            <div className="absolute -inset-full bg-gradient-radial from-accent-pink/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-3 group-hover:text-accent-pink transition-colors">
              <span className="w-10 h-10 rounded-lg bg-accent-pink/10 flex items-center justify-center text-accent-pink">
                <Database className="w-5 h-5" />
              </span>
              enrichment
            </h3>
            <p className="text-lg text-neutral-400">Attaches threat intel context (KEV/EPSS/advisory flags) and reachability confidence.</p>
          </article>

          <article className="argonaut-panel p-8 border-accent-yellow/20 hover:border-accent-yellow/50 transition-all group relative overflow-hidden">
            <div className="absolute -inset-full bg-gradient-radial from-accent-yellow/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-3 group-hover:text-accent-yellow transition-colors">
              <span className="w-10 h-10 rounded-lg bg-accent-yellow/10 flex items-center justify-center text-accent-yellow">
                <BarChart2 className="w-5 h-5" />
              </span>
              3. Scoring
            </h3>
            <p className="text-lg text-neutral-400">Joins findings + threat intel + reachability via Elasticsearch to compute Fix Priority Score and return the top set.</p>
          </article>

          <article className="argonaut-panel p-8 border-accent-green/20 hover:border-accent-green/50 transition-all group relative overflow-hidden">
            <div className="absolute -inset-full bg-gradient-radial from-accent-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-3 group-hover:text-accent-green transition-colors">
              <span className="w-10 h-10 rounded-lg bg-accent-green/10 flex items-center justify-center text-accent-green">
                <CheckSquare className="w-5 h-5" />
              </span>
              4. Action
            </h3>
            <p className="text-lg text-neutral-400">Posts Slack alerts with ranked findings, generates fix bundles, and produces run report summaries with deep links.</p>
          </article>
        </div>
      </section>

      {/* MIGRATED JOURNEY CONTENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mb-12 max-w-7xl mx-auto px-4">
        {/* BEFORE CARD */}
        <div className="reveal flex">
          <JourneyCard
            type="before"
            title="Before Argonaut"
            subtitle="Manual, Fragmented, Multi-System Triage"
            icon={<Frown className="w-7 h-7 text-red-400" />}
            accentColor="border-red-500/30"
            bgColor="bg-red-500/5"
            trigger="CI pipeline completes. GitHub + SCA tool push new findings. Engineer receives SARIF alerts, Snyk notifications, emails, and Slack pings."
            steps={[
              {
                title: "Tool Hopping",
                duration: "20-40m",
                description: "Opening 8+ tools, downloading files, checking CVE pages manually. Cognitive overload."
              },
              {
                title: "Manual Correlation",
                duration: "30-60m",
                description: "Grepping codebase, inspecting dependency tree, checking exploit reports. Heuristic guesswork."
              },
              {
                title: "Prioritization Guesswork",
                duration: "20m",
                description: "Narrowing 800 findings down to 12. Subjective, not deterministic."
              },
              {
                title: "Action Creation",
                duration: "20-30m",
                description: "Manually creating tickets, linking CVEs, posting to Slack."
              }
            ]}
            summary={{
              time: "1.5 to 3 hours",
              emotional: "Cognitive overload, fatigue",
              timeColor: "text-red-400"
            }}
          />
        </div>

        {/* AFTER CARD */}
        <div className="reveal flex">
          <JourneyCard
            type="after"
            title="After Argonaut"
            subtitle="Agent-Orchestrated, Context-Driven, Action-Complete"
            icon={<Smile className="w-7 h-7 text-accent-green" />}
            accentColor="border-accent-green/30"
            bgColor="bg-accent-green/5"
            trigger='Security scanning tool outputs scan results via upload, API call, or MCP server.'
            triggerMono
            steps={[
              {
                title: "Acquisition",
                duration: "<10s",
                description: "Ingests SARIF, lockfile, SBOM. Normalizes findings automatically."
              },
              {
                title: "Enrichment",
                duration: "<15s",
                description: "Matches CVEs to intel (KEV/EPSS), runs reachability, adds blast radius metadata."
              },
              {
                title: "Deterministic Scoring",
                duration: "<5s",
                description: "ES|QL joins findings + intel + reachability. Ranks 800 findings → 5 fix-first automatically."
              },
              {
                title: "Action",
                duration: "1 Click",
                description: "Engineer clicks 'Generate Fix'. Argonaut generates fix bundles and posts Slack summary with ranked findings."
              }
            ]}
            summary={{
              time: "< 2 minutes",
              emotional: "Confidence, clarity, no guesswork",
              timeColor: "text-accent-green"
            }}
          />
        </div>
      </div>

      <section className="section argonaut-panel p-10 mb-8 reveal">
        <div className="section-head mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Side-by-Side Comparison</h2>
          <p className="text-xl text-neutral-400 font-light mt-1">Direct metrics showing the Argonaut advantage.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 uppercase text-xs font-mono tracking-widest text-neutral-400">
                <th className="pb-4 px-4 font-normal">Stage</th>
                <th className="pb-4 px-4 font-normal">Before</th>
                <th className="pb-4 px-4 font-normal text-accent-blue">After Argonaut</th>
              </tr>
            </thead>
            <tbody className="text-lg">
              <ComparisonRow label="Tools opened" before="5–8" after="1" isGood />
              <ComparisonRow label="Manual joins" before="Yes" after="No (ES|QL)" isGood />
              <ComparisonRow label="Reachability check" before="Manual grep" after="Automated" isGood />
              <ComparisonRow label="Threat intel lookup" before="Manual" after="Automated" isGood />
              <ComparisonRow label="Ticket creation" before="Manual" after="Automated" isGood />
              <ComparisonRow label="Time" before="1.5–3 hours" after="< 2 minutes" isGood />
              <ComparisonRow label="Confidence" before="Heuristic" after="Evidence-backed" isGood />
              <ComparisonRow label="Audit trail" before="Scattered" after="Centralized" isGood last />
            </tbody>
          </table>
        </div>
      </section>

      <section className="section argonaut-panel p-10 mb-8 reveal overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-pink/5 rounded-full blur-3xl -ml-32 -mb-32"></div>

        <div className="section-head mb-8 relative z-10">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-accent-blue" />
            <h2 className="text-3xl font-bold text-white">System-Level Impact</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
          <div>
            <h4 className="text-red-400 font-bold mb-6 uppercase tracking-wider text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Before
            </h4>
            <ul className="space-y-4 text-neutral-400 text-lg border-l border-red-500/20 pl-6">
              <li>Triage knowledge lives in individuals.</li>
              <li>Prioritization varies between engineers.</li>
              <li>High cognitive load.</li>
              <li>Repeated manual steps every build.</li>
            </ul>
          </div>
          <div>
            <h4 className="text-accent-green font-bold mb-6 uppercase tracking-wider text-sm flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" /> After
            </h4>
            <ul className="space-y-4 text-white text-lg border-l border-accent-green/20 pl-6 font-medium">
              <li>Triage becomes standardized.</li>
              <li>Prioritization is deterministic.</li>
              <li>Every decision is explainable.</li>
              <li>Action is integrated into workflow.</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 text-center px-4 relative z-10">
          <p className="text-accent-blue font-light italic text-2xl max-w-4xl mx-auto leading-relaxed">
            "Before Argonaut, triage required manually correlating SARIF, lockfiles, CVE feeds, and Slack threads. After Argonaut, one bundle triggers structured ingestion, deterministic scoring, and automated Slack actions — all in under a minute."
          </p>
        </div>
      </section>

      <footer className="mt-12 py-8 border-t border-white/10 flex justify-center items-center text-sm font-mono tracking-widest text-neutral-400 uppercase">
        <span className="text-accent-blue font-bold">Powered by Elastic Agent Builder</span>
      </footer>
    </div>
  );
}

function JourneyCard({
  type,
  title,
  subtitle,
  icon,
  accentColor,
  bgColor,
  trigger,
  triggerMono,
  steps,
  summary
}) {
  return (
    <div className={`argonaut-panel h-full border-t-2 ${accentColor} flex flex-col w-full`}>
      <div className="p-8 border-b border-white/5">
        <div className={`w-14 h-14 rounded-xl ${bgColor} flex items-center justify-center mb-5`}>
          {icon}
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className={`text-xs font-bold uppercase tracking-widest ${type === 'before' ? 'text-red-400' : 'text-accent-green'}`}>
          {subtitle}
        </p>
      </div>

      <div className="p-8 flex-grow space-y-8">
        <div>
          <h4 className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-4">Trigger Event</h4>
          <p className={`text-lg leading-relaxed ${triggerMono ? 'font-mono bg-white/5 p-4 rounded-lg border border-white/5 text-accent-blue' : 'text-neutral-400'}`}>
            {trigger}
          </p>
        </div>

        <div className="space-y-6">
          <h4 className="text-xs font-mono text-neutral-400 uppercase tracking-widest">Process Steps</h4>
          {steps.map((step, idx) => (
            <div key={idx} className="group">
              <div className="flex justify-between items-start mb-2">
                <span className="text-lg font-bold text-white group-hover:text-accent-blue transition-colors">
                  Step {idx + 1}: {step.title}
                </span>
                <span className="text-xs font-mono text-neutral-400">{step.duration}</span>
              </div>
              <p className="text-base text-neutral-400 leading-relaxed pl-3 border-l border-white/10">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className={`p-8 bg-white/2 border-t border-white/5 rounded-b-2xl mt-auto space-y-4`}>
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-400">Total Time:</span>
          <strong className={`text-lg ${summary.timeColor}`}>{summary.time}</strong>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-400">Emotional State:</span>
          <strong className={`text-lg text-white`}>{summary.emotional}</strong>
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({ label, before, after, isGood, last }) {
  return (
    <tr className={`${!last ? 'border-b border-white/5' : ''} hover:bg-white/[0.02] transition-colors`}>
      <td className="py-6 px-4 text-neutral-400 font-medium">{label}</td>
      <td className="py-6 px-4 text-red-300 font-mono">{before}</td>
      <td className={`py-6 px-4 font-bold font-mono ${isGood ? 'text-accent-green' : 'text-white'}`}>
        {after}
      </td>
    </tr>
  );
}