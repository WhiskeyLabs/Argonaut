import {
    ArrowLeft,
    Activity,
    LayoutDashboard,
    FileText,
    Shield,
    Clock,
    History,
    Zap,
    ExternalLink,
    Terminal
} from 'lucide-react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buildKibanaRunDashboardUrl, buildKibanaRunLogsDiscoverUrl } from '@/lib/kibanaLinks';
import RunTimelineClient from './RunTimelineClient';
import BackButton from '@/components/BackButton';

// Helper to fetch the run directly from the route or service
async function getRun(runId: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/runs/${runId}`, {
        cache: 'no-store'
    });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch run');
    }
    const data = await res.json();
    return data.run;
}

async function getBundle(bundleId: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/bundles/${bundleId}`, {
        cache: 'no-store'
    });
    if (!res.ok) {
        if (res.status === 404) return null;
        console.warn(`Failed to fetch bundle ${bundleId} for run page`);
        return null;
    }
    const data = await res.json();
    return data.bundle;
}


export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
    const { runId } = await params;

    // Server-side fetch initial data
    const run = await getRun(runId);

    if (!run) {
        notFound();
    }

    const bundle = await getBundle(run.bundleId);

    // Links
    const kibanaLogsLink = buildKibanaRunLogsDiscoverUrl(runId);     // Discover (tasklogs-only)
    const kibanaRunLink = buildKibanaRunDashboardUrl(runId);        // Dashboard (run-scoped)

    // Execution Mode
    const executionModeStr = (run.executionMode === 'es' || run.executionMode === 'cloud')
        ? 'Executed on Elastic Cloud (ES-backed)'
        : 'Executed in Memory (Simulator)';

    return (
        <main className="argonaut-shell min-h-screen pb-12">
            {/* Header section with Breadcrumb */}
            <header className="mb-12 argonaut-panel p-8 reveal is-visible">
                <div className="flex justify-between items-start">
                    <div>
                        <BackButton label="Back" />
                        <p className="eyebrow">Active Execution</p>
                        <div className="flex flex-wrap items-center gap-4 mb-3">
                            <h1 className="text-4xl font-bold tracking-tight text-white">{run.runId}</h1>
                            <span className={`badge-neon ${run.status === 'RUNNING' ? 'badge-blue' :
                                run.status === 'FAILED' ? 'badge-pink' :
                                    'badge-green'
                                }`}>
                                {run.status}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-6 text-[11px] uppercase tracking-[0.15em] font-mono text-neutral-500">
                            <div className="flex items-center gap-2">
                                <span className="opacity-50">App:</span>
                                <span className="text-accent-blue font-bold">{run.applicationId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="opacity-50">Bundle:</span>
                                <span className="text-neutral-300">{run.bundleId}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="opacity-50">Build:</span>
                                <span className="text-neutral-300">{run.buildId || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    <div className="hidden lg:flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-accent-blue" />
                        </div>
                    </div>
                </div>
            </header>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center gap-4 mb-10 reveal is-visible" style={{ transitionDelay: '50ms' }}>
                <Link href={`/runs/${runId}/findings`} className="argonaut-panel px-6 py-4 flex items-center gap-3 text-sm font-bold text-accent-blue hover:scale-[1.02] active:scale-[0.98] border-accent-blue/30 bg-accent-blue/5">
                    <Zap className="w-5 h-5" />
                    Review Findings
                </Link>
                <a href={kibanaRunLink} target="_blank" rel="noopener noreferrer" className="argonaut-panel px-6 py-4 flex items-center gap-3 text-sm font-bold text-neutral-300 hover:text-white hover:border-white/20 transition-all">
                    <LayoutDashboard className="w-5 h-5" />
                    Kibana Runs Dashboard
                </a>
                <a href={kibanaLogsLink} target="_blank" rel="noopener noreferrer" className="argonaut-panel px-6 py-4 flex items-center gap-3 text-sm font-bold text-neutral-300 hover:text-white hover:border-white/20 transition-all">
                    <Terminal className="w-5 h-5" />
                    Elastic Search Logs
                </a>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left Sidebar - Run Context & Provenance */}
                <div className="lg:col-span-1 space-y-6 reveal is-visible" style={{ transitionDelay: '100ms' }}>
                    <div className="argonaut-panel p-6">
                        <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-neutral-400 border-b border-white/5 pb-3 mb-4 flex items-center gap-2">
                            <Clock className="w-3 h-3 text-accent-blue" />
                            Run Context
                        </h2>
                        <ul className="space-y-5">
                            <li>
                                <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Execution Mode</span>
                                <span className="text-sm text-neutral-300 font-medium">{executionModeStr}</span>
                            </li>
                            <li>
                                <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Pipeline Version</span>
                                <span className="text-xs text-accent-yellow font-mono bg-accent-yellow/5 px-2 py-0.5 rounded border border-accent-yellow/10">
                                    {run.pipelineVersion || 'latest'}
                                </span>
                            </li>
                            <li className="pt-2 border-t border-white/5">
                                <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Timing</span>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-muted uppercase">Started</span>
                                        <span className="text-xs text-neutral-300 font-mono" suppressHydrationWarning>
                                            {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                    </div>
                                    {run.completedAt && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-muted uppercase">Ended</span>
                                            <span className="text-xs text-neutral-300 font-mono" suppressHydrationWarning>
                                                {new Date(run.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className="argonaut-panel p-6">
                        <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-neutral-400 border-b border-white/5 pb-3 mb-4 flex items-center gap-2">
                            <History className="w-3 h-3 text-accent-pink" />
                            Bundle Summary
                        </h2>
                        <ul className="space-y-4">
                            <li>
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-[10px] uppercase tracking-wider text-neutral-500">Total Artifacts</span>
                                    <span className="text-lg text-white font-bold font-mono leading-none">
                                        {bundle ? (bundle.artifactCounts ? Object.values(bundle.artifactCounts).reduce((a: any, b: any) => a + b, 0) : bundle.artifactCount) : '—'}
                                    </span>
                                </div>
                            </li>
                            {bundle && bundle.artifactCounts && (
                                <li className="grid grid-cols-2 gap-2">
                                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                                        <span className="block text-[9px] text-neutral-400 font-bold font-barlow uppercase tracking-wider">SARIF</span>
                                        <span className="text-xs text-white font-mono">{bundle.artifactCounts.sarif || 0}</span>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                                        <span className="block text-[9px] text-neutral-400 font-bold font-barlow uppercase tracking-wider">SBOM</span>
                                        <span className="text-xs text-white font-mono">{bundle.artifactCounts.sbom || 0}</span>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                                        <span className="block text-[9px] text-neutral-400 font-bold font-barlow uppercase tracking-wider">LOCK</span>
                                        <span className="text-xs text-white font-mono">{bundle.artifactCounts.lock || 0}</span>
                                    </div>
                                    <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                                        <span className="block text-[9px] text-neutral-400 font-bold font-barlow uppercase tracking-wider">MISC</span>
                                        <span className="text-xs text-white font-mono">{bundle.artifactCounts.other || 0}</span>
                                    </div>
                                </li>
                            )}
                            <li className="pt-2 border-t border-white/5">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-barlow font-bold">Package Size</span>
                                    <span className="text-xs text-neutral-300 font-mono">
                                        {bundle?.totalBytes ? (bundle.totalBytes / 1024).toFixed(1) + ' KB' : '—'}
                                    </span>
                                </div>
                            </li>
                        </ul>
                        {bundle && (
                            <div className="mt-6">
                                <Link href={`/apps/${bundle.applicationId || bundle.repo}/bundles/${bundle.bundleId}`} className="w-full py-2 flex items-center justify-center gap-2 text-[10px] font-bold text-accent-blue border border-accent-blue/20 bg-accent-blue/5 rounded-lg hover:bg-accent-blue/10 transition-colors uppercase tracking-widest font-barlow">
                                    Bundle Details
                                    <ExternalLink className="w-3 h-3" />
                                </Link>
                            </div>
                        )}
                    </div>

                    <div className="argonaut-panel p-6 border-accent-blue/20 bg-accent-blue/5">
                        <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-accent-blue border-b border-accent-blue/10 pb-3 mb-4 flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5" />
                            Provenance
                        </h2>
                        <div id="provenance-container" className="text-xs text-neutral-300 space-y-3 leading-relaxed">
                            <span className="text-[11px] text-neutral-500 italic flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-accent-blue animate-pulse" />
                                Determining proving agent...
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right Column - Client Side Timeline and Stream */}
                <div className="lg:col-span-3 reveal is-visible" style={{ transitionDelay: '150ms' }}>
                    <RunTimelineClient initialRun={run} runId={runId} />
                </div>
            </div>
        </main>
    );
}
