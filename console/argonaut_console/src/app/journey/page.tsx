'use client';

import React, { useEffect, useState } from 'react';
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
  FileText
} from 'lucide-react';

interface JourneyStep {
  title: string;
  duration: string;
  description: string;
}

interface JourneySummary {
  time: string;
  emotional: string;
  timeColor: string;
}

interface JourneyCardProps {
  type: 'before' | 'after';
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: string;
  bgColor: string;
  trigger: string;
  triggerMono?: boolean;
  steps: JourneyStep[];
  summary: JourneySummary;
}

interface ComparisonRowProps {
  label: string;
  before: string;
  after: string;
  isGood?: boolean;
  last?: boolean;
}

export default function JourneyPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="shell min-h-screen pb-12">
      <header className="masthead argonaut-panel p-8 mb-8 reveal">
        <div className="brand-row">
          <div className="hero-content">
            <p className="eyebrow mb-2">User Journey</p>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Argonaut User Journey</h1>
            <p className="text-xl text-neutral-400 font-light max-w-2xl">
              Before vs. After Argonaut: Eradicating Manual Triage Pain and Human-Error Latency.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-8 items-center mb-12">
        {/* BEFORE CARD */}
        <div className="lg:col-span-3 reveal">
          <JourneyCard
            type="before"
            title="Before Argonaut"
            subtitle="Manual, Fragmented, Multi-System Triage"
            icon={<Frown className="w-6 h-6 text-red-400" />}
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

        {/* TRANSFORMATION ARROW */}
        <div className="lg:col-span-1 flex flex-col items-center justify-center gap-4 reveal opacity-80">
          <div className="w-16 h-16 rounded-full border border-accent-blue/20 flex items-center justify-center bg-accent-blue/5">
            <ArrowRight className="w-8 h-8 text-accent-blue" />
          </div>
          <span className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-accent-blue">Transformation</span>
        </div>

        {/* AFTER CARD */}
        <div className="lg:col-span-3 reveal">
          <JourneyCard
            type="after"
            title="After Argonaut"
            subtitle="Agent-Orchestrated, Context-Driven, Action-Complete"
            icon={<Smile className="w-6 h-6 text-accent-green" />}
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

      <section className="section argonaut-panel p-8 mb-8 reveal">
        <div className="section-head mb-8">
          <h2 className="text-2xl font-bold text-white">Side-by-Side Comparison</h2>
          <p className="text-neutral-400 font-light mt-1">Direct metrics showing the Argonaut advantage.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 uppercase text-[10px] font-mono tracking-widest text-neutral-400">
                <th className="pb-4 px-4 font-normal">Stage</th>
                <th className="pb-4 px-4 font-normal">Before</th>
                <th className="pb-4 px-4 font-normal text-accent-blue">After Argonaut</th>
              </tr>
            </thead>
            <tbody className="text-sm">
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

      <section className="section argonaut-panel p-8 mb-8 reveal overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-pink/5 rounded-full blur-3xl -ml-32 -mb-32"></div>

        <div className="section-head mb-8 relative z-10">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-accent-blue" />
            <h2 className="text-2xl font-bold text-white">System-Level Impact</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
          <div>
            <h4 className="text-red-400 font-bold mb-4 uppercase tracking-wider text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Before
            </h4>
            <ul className="space-y-3 text-neutral-400 text-sm border-l border-red-500/20 pl-6">
              <li>Triage knowledge lives in individuals.</li>
              <li>Prioritization varies between engineers.</li>
              <li>High cognitive load.</li>
              <li>Repeated manual steps every build.</li>
            </ul>
          </div>
          <div>
            <h4 className="text-accent-green font-bold mb-4 uppercase tracking-wider text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> After
            </h4>
            <ul className="space-y-3 text-white text-sm border-l border-accent-green/20 pl-6 font-medium">
              <li>Triage becomes standardized.</li>
              <li>Prioritization is deterministic.</li>
              <li>Every decision is explainable.</li>
              <li>Action is integrated into workflow.</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 text-center px-4 relative z-10">
          <p className="text-accent-blue font-light italic text-lg max-w-4xl mx-auto leading-relaxed">
            "Before Argonaut, triage required manually correlating SARIF, lockfiles, CVE feeds, and Slack threads. After Argonaut, one bundle triggers structured ingestion, deterministic scoring, and automated Slack actions — all in under a minute."
          </p>
        </div>
      </section>

      <footer className="mt-12 py-8 border-t border-white/10 flex justify-center items-center text-[10px] font-sans font-bold tracking-widest text-neutral-400 uppercase">
        <span className="text-accent-blue">Powered by Elastic Agent Builder</span>
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
}: JourneyCardProps) {
  return (
    <div className={`argonaut-panel h-full border-t-2 ${accentColor} flex flex-col`}>
      <div className="p-6 border-b border-white/5">
        <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center mb-4`}>
          {icon}
        </div>
        <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
        <p className={`text-[10px] font-bold uppercase tracking-wider ${type === 'before' ? 'text-red-400' : 'text-accent-green'}`}>
          {subtitle}
        </p>
      </div>

      <div className="p-6 flex-grow space-y-6">
        <div>
          <h4 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest mb-3">Trigger Event</h4>
          <p className={`text-sm ${triggerMono ? 'font-mono bg-white/5 p-3 rounded-lg border border-white/5 text-accent-blue' : 'text-neutral-400'}`}>
            {trigger}
          </p>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Process Steps</h4>
          {steps.map((step: JourneyStep, idx: number) => (
            <div key={idx} className="group">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-white group-hover:text-accent-blue transition-colors">
                  Step {idx + 1}: {step.title}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">{step.duration}</span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed pl-2 border-l border-white/10">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className={`p-6 bg-white/2 border-t border-white/5 rounded-b-2xl mt-auto space-y-3`}>
        <div className="flex justify-between items-center">
          <span className="text-xs text-neutral-400">Total Time:</span>
          <strong className={`text-sm ${summary.timeColor}`}>{summary.time}</strong>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-neutral-400">Emotional State:</span>
          <strong className={`text-sm text-white`}>{summary.emotional}</strong>
        </div>
      </div>
    </div>
  );
}

function ComparisonRow({ label, before, after, isGood, last }: ComparisonRowProps) {
  return (
    <tr className={`${!last ? 'border-b border-white/5' : ''} hover:bg-white/[0.02] transition-colors`}>
      <td className="py-4 px-4 text-neutral-400 font-medium">{label}</td>
      <td className="py-4 px-4 text-red-300 font-mono">{before}</td>
      <td className={`py-4 px-4 font-bold font-mono ${isGood ? 'text-accent-green' : 'text-white'}`}>
        {after}
      </td>
    </tr>
  );
}