import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ShieldCheck, Scale, FileCheck2, ArrowRightLeft } from 'lucide-react';

const cc6Controls = [
    {
        control: 'CC6.1',
        requirement: 'Restrict system access',
        implementation: 'Local-only default; no external access without explicit opt-in',
        evidence: 'Privacy settings, runtime policy guard, route intent headers',
    },
    {
        control: 'CC6.2',
        requirement: 'Least privilege',
        implementation: 'Each outbound capability is separately toggled and scoped',
        evidence: 'Privacy toggle matrix + effective policy resolver',
    },
    {
        control: 'CC6.3',
        requirement: 'Role separation',
        implementation: 'No hidden admin bypass for privacy floor',
        evidence: 'No privileged override path in client settings',
    },
    {
        control: 'CC6.6',
        requirement: 'Authentication for integrations',
        implementation: 'External integrations are explicit, opt-in surfaces',
        evidence: 'Settings ownership boundaries (Phase 6.5/6.6)',
    },
    {
        control: 'CC6.7',
        requirement: 'Prevent unauthorized transmission',
        implementation: 'Network routes require declared privacy intent and policy allowance',
        evidence: 'Runtime checks in AI/TI clients and API route guards',
    },
];

const cc7Controls = [
    {
        control: 'CC7.1',
        requirement: 'Detect system misuse',
        implementation: 'EvidenceLog captures critical analysis events',
        evidence: 'Session event records (`events` table)',
    },
    {
        control: 'CC7.2',
        requirement: 'Monitor external dependencies',
        implementation: 'TI and AI network behaviors are policy-gated and off by default',
        evidence: 'Privacy defaults + settings persistence',
    },
    {
        control: 'CC7.3',
        requirement: 'Incident response readiness',
        implementation: 'Local-only mode limits blast radius and data exposure',
        evidence: 'Policy mode + zero-egress baseline',
    },
    {
        control: 'CC7.4',
        requirement: 'Change management',
        implementation: 'Versioned schema and architectural decision records',
        evidence: 'DB schema versioning + ADR documentation',
    },
    {
        control: 'CC7.5',
        requirement: 'Data minimization',
        implementation: 'Metadata-first enrichment with optional snippet sharing gate',
        evidence: 'Prompt shaping policy + snippet toggle',
    },
];

const postureComparison = [
    { area: 'Default posture', typical: 'Cloud-first', argus: 'Local-first' },
    { area: 'AI usage', typical: 'Always-on', argus: 'Explicit opt-in' },
    { area: 'CSP enforcement', typical: 'Weak', argus: 'Hardened + runtime policy gates' },
    { area: 'Data contracts', typical: 'Loose', argus: 'Versioned and constrained' },
    { area: 'Demo safety', typical: 'Risky', argus: 'Deterministic policy behavior' },
];

function ControlTable({
    title,
    subtitle,
    rows,
}: {
    title: string;
    subtitle: string;
    rows: Array<{ control: string; requirement: string; implementation: string; evidence: string }>;
}) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white/85 shadow-sm dark:border-white/10 dark:bg-gray-900/70">
            <div className="border-b border-gray-200 bg-gray-50/70 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                    <thead>
                        <tr className="border-b border-gray-200/80 dark:border-white/10">
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Control</th>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Requirement</th>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Argus Implementation</th>
                            <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Evidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.control} className="border-b border-gray-100 last:border-0 dark:border-white/5">
                                <td className="px-4 py-3 align-top">
                                    <span className="rounded border border-emerald-300/70 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                                        {row.control}
                                    </span>
                                </td>
                                <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">{row.requirement}</td>
                                <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-200">{row.implementation}</td>
                                <td className="px-4 py-3 align-top text-gray-500 dark:text-gray-300">{row.evidence}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function Soc2CompliancePage() {
    return (
        <DashboardShell>
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pb-14 pt-8">
                <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-gray-900/75">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(16,185,129,0.16),transparent_40%),radial-gradient(circle_at_85%_25%,rgba(37,99,235,0.16),transparent_42%),radial-gradient(circle_at_50%_85%,rgba(135,26,17,0.14),transparent_42%)]" />
                    <div className="relative">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Audit Ready
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-300/70 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300">
                                <Scale className="h-3.5 w-3.5" />
                                CC6 / CC7 Aligned
                            </span>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">SOC 2 Control Mapping</h1>
                        <p className="mt-1.5 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
                            Concrete mapping from Argus architecture and runtime controls to SOC 2 logical access and system operations expectations.
                        </p>
                    </div>
                </section>

                <ControlTable
                    title="SOC 2 — CC6: Logical Access Controls"
                    subtitle="Access restrictions, least privilege, and unauthorized transmission prevention."
                    rows={cc6Controls}
                />

                <ControlTable
                    title="SOC 2 — CC7: System Operations & Monitoring"
                    subtitle="Operational monitoring, dependency governance, and data minimization posture."
                    rows={cc7Controls}
                />

                <section className="rounded-2xl border border-gray-200 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-gray-900/70">
                    <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                        <FileCheck2 className="h-4 w-4 text-primary-500" />
                        Explicit Auditor Call-Out
                    </h2>
                    <blockquote className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm leading-relaxed text-gray-700 dark:border-white/10 dark:bg-gray-950/60 dark:text-gray-200">
                        “The system is designed to operate with zero external data transmission by default. All third-party integrations and AI-based enrichments are explicitly opt-in, technically constrained, and auditable. Sensitive customer data such as source code, file paths, and repository contents never leave the local execution environment unless the customer deliberately enables a local-only workflow.”
                    </blockquote>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white/90 shadow-sm dark:border-white/10 dark:bg-gray-900/70">
                    <div className="border-b border-gray-200 bg-gray-50/70 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                            <ArrowRightLeft className="h-4 w-4 text-primary-500" />
                            Where Argus Is Better Than Typical Tools
                        </h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[660px] text-left text-xs">
                            <thead>
                                <tr className="border-b border-gray-200/80 dark:border-white/10">
                                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Area</th>
                                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Typical AppSec Tool</th>
                                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Argus</th>
                                </tr>
                            </thead>
                            <tbody>
                                {postureComparison.map((row) => (
                                    <tr key={row.area} className="border-b border-gray-100 last:border-0 dark:border-white/5">
                                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{row.area}</td>
                                        <td className="px-4 py-3 text-gray-500 dark:text-gray-300">{row.typical}</td>
                                        <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-300">{row.argus}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </DashboardShell>
    );
}
