import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { Sparkles, ShieldCheck, GitBranch, Download, FileCode2 } from 'lucide-react';
import Image from 'next/image';

const quickStartSteps = [
    {
        title: 'Add package-lock context first',
        detail:
            'On the Drop page, use the bottom context box to upload a package-lock JSON file before you run analysis.',
    },
    {
        title: 'Upload the SARIF scan file',
        detail:
            'Use the center drop zone to upload a SARIF scan file so Argus can ingest findings and correlate risk.',
    },
    {
        title: 'Create or select a project',
        detail:
            'Use the project control at the top to create/select an app context so each run stays organized.',
    },
];

const valueProps = [
    'Reduce AppSec noise by prioritizing what is reachable and exploitable first.',
    'Enrich findings with threat intelligence and context rather than raw scanner output.',
    'Keep workflow fast for triage: import, correlate, prioritize, and hand off fixes.',
];

const killerFeatures = [
    'Fully local analysis workflow in-browser for ingest and triage.',
    'Reachability-aware prioritization to focus on vulnerabilities that matter.',
    'Threat context layering (severity, KEV-style signal, exploitability) for clearer risk ranking.',
    'LLM-assisted remediation guidance to speed up developer handoff.',
];

const sampleFiles = [
    {
        name: 'kev-test-small.sarif',
        description: 'Small scan fixture for quick smoke tests.',
    },
    {
        name: 'kev-test-small-package-lock.json',
        description: 'Matching lockfile context for the small SARIF.',
    },
    {
        name: 'kev-test-medium.sarif',
        description: 'Medium-sized scan fixture for realistic triage flow.',
    },
    {
        name: 'kev-test-medium-package-lock.json',
        description: 'Matching lockfile context for the medium SARIF.',
    },
    {
        name: 'kev-test-large.sarif',
        description: 'Large fixture for load and analyst workflow validation.',
    },
    {
        name: 'kev-test-large-package-lock.json',
        description: 'Matching lockfile context for the large SARIF.',
    },
];

export default function GettingStartedPage() {
    return (
        <DashboardShell>
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pb-16 pt-8">
                <section className="rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-gray-900/70">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                            <Image
                                src="/ARGUS_Logo.png"
                                alt="Argus logo"
                                width={56}
                                height={56}
                                className="h-14 w-14 rounded-xl border border-gray-200 bg-white p-2 dark:border-white/10 dark:bg-gray-800"
                            />
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600 dark:text-primary-400">
                                    Internal Beta
                                </p>
                                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                                    Argus Getting Started
                                </h1>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                    Quick setup notes for beta testers. This page is intentionally short and task-focused.
                                </p>
                            </div>
                        </div>
                        <div className="rounded-xl border border-primary-500/30 bg-primary-500/10 px-4 py-3 text-sm text-primary-700 dark:text-primary-300">
                            Scan + package context in, prioritized AppSec signal out.
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                    {valueProps.map((item) => (
                        <div
                            key={item}
                            className="rounded-xl border border-gray-200 bg-white/85 p-4 text-sm text-gray-700 shadow-sm dark:border-white/10 dark:bg-gray-900/70 dark:text-gray-200"
                        >
                            <div className="mb-2 inline-flex rounded-md bg-emerald-500/15 p-1.5 text-emerald-600 dark:text-emerald-300">
                                <ShieldCheck className="h-4 w-4" />
                            </div>
                            {item}
                        </div>
                    ))}
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-gray-900/70">
                    <div className="mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                        <GitBranch className="h-4 w-4 text-primary-500" />
                        <h2 className="text-lg font-semibold">Quick Start Steps</h2>
                    </div>
                    <ol className="space-y-3">
                        {quickStartSteps.map((step, index) => (
                            <li
                                key={step.title}
                                className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-gray-950/70"
                            >
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {index + 1}. {step.title}
                                </p>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{step.detail}</p>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-gray-900/70">
                    <div className="mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                        <Download className="h-4 w-4 text-primary-500" />
                        <h2 className="text-lg font-semibold">Sample Files</h2>
                    </div>
                    <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                        Source folder: <code className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">synthetic_files/KEV test</code>
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                        {sampleFiles.map((file) => (
                            <a
                                key={file.name}
                                href={`/api/getting-started-samples/${encodeURIComponent(file.name)}`}
                                className="group rounded-xl border border-gray-200 bg-gray-50/80 p-4 transition hover:border-primary-500/40 hover:bg-primary-500/5 dark:border-white/10 dark:bg-gray-950/70 dark:hover:border-primary-500/40 dark:hover:bg-primary-500/10"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{file.name}</p>
                                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{file.description}</p>
                                    </div>
                                    <FileCode2 className="h-4 w-4 text-gray-500 transition group-hover:text-primary-500" />
                                </div>
                            </a>
                        ))}
                    </div>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-gray-900/70">
                    <div className="mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                        <Sparkles className="h-4 w-4 text-primary-500" />
                        <h2 className="text-lg font-semibold">Killer Features to Validate</h2>
                    </div>
                    <ul className="grid gap-3 md:grid-cols-2">
                        {killerFeatures.map((feature) => (
                            <li
                                key={feature}
                                className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-700 dark:border-white/10 dark:bg-gray-950/70 dark:text-gray-200"
                            >
                                {feature}
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </DashboardShell>
    );
}
