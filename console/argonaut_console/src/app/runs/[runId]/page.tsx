import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getKibanaDiscoverUrl, getKibanaDashboardUrl } from '@/lib/kibanaLinks';
import RunTimelineClient from './RunTimelineClient';

// Helper to fetch the run directly from the route or service
async function getRun(runId: string) {
    const res = await fetch(`http://localhost:3000/api/runs/${runId}`, {
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
    // Links
    const kibanaLogsLink = getKibanaDiscoverUrl('argonaut-*', `runId:"${runId}"`);
    const kibanaRunLink = getKibanaDiscoverUrl('argonaut-*', `runId:"${runId}"`);

    // Execution Mode
    const executionModeStr = (run.executionMode === 'es' || run.executionMode === 'cloud')
        ? 'Executed on Elastic Cloud (ES-backed)'
        : 'Executed in Memory (Simulator)';

    return (
        <main className="argonaut-shell">
            {/* Header section with Breadcrumb */}
            <header className="mb-12 border-b border-white/5 pb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <Link href={`/apps/${run.applicationId}/bundles/${run.bundleId}`} className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1 mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                            Back to Bundle
                        </Link>
                        <p className="text-[11px] tracking-[0.22em] uppercase text-emerald-500 font-bold mb-1">Active Run</p>
                        <div className="flex items-center gap-4 mb-2">
                            <h1 className="text-4xl font-bold tracking-tight text-white">{run.runId}</h1>
                            <span className={`inline-flex items-center rounded-sm px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider ring-1 ring-inset ${run.status === 'RUNNING' ? 'bg-blue-500/20 text-blue-400 ring-blue-500/30' :
                                run.status === 'FAILED' ? 'bg-red-500/20 text-red-500 ring-red-500/30' :
                                    'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                }`}>
                                {run.status}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] uppercase tracking-widest font-mono text-neutral-500">
                            <span>App: <span className="text-neutral-300">{run.applicationId}</span></span>
                            <span>Bundle: <span className="text-neutral-300">{run.bundleId}</span></span>
                            <span>Build: <span className="text-neutral-300">{run.buildId || 'N/A'}</span></span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center gap-4 mb-10">
                <Link href={`/runs/${runId}/findings`} className="argonaut-panel px-6 py-3 flex items-center gap-3 text-sm font-bold text-blue-400 hover:text-blue-300 transition-all hover:scale-[1.02] active:scale-[0.98] border-blue-500/20 bg-blue-500/5 shadow-lg shadow-blue-500/5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></svg>
                    Review Findings
                </Link>
                <a href={kibanaRunLink} target="_blank" rel="noopener noreferrer" className="argonaut-panel px-6 py-3 flex items-center gap-3 text-sm font-bold text-neutral-300 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-white/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                    Kibana Runs Dashboard
                </a>
                <a href={kibanaLogsLink} target="_blank" rel="noopener noreferrer" className="argonaut-panel px-6 py-3 flex items-center gap-3 text-sm font-bold text-neutral-300 hover:text-white transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-white/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
                    Elastic Search Logs
                </a>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left Sidebar - Run Context & Provenance */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="argonaut-panel p-5">
                        <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-neutral-400 border-b border-white/5 pb-3 mb-4">Run Context</h2>
                        <ul className="space-y-4">
                            <li>
                                <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Execution Mode</span>
                                <span className="text-sm text-neutral-300">{executionModeStr}</span>
                            </li>
                            <li>
                                <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Pipeline Version</span>
                                <span className="text-sm text-neutral-300 font-mono">{run.pipelineVersion || 'latest'}</span>
                            </li>
                            <li>
                                <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Started</span>
                                <span className="text-sm text-neutral-300" suppressHydrationWarning>
                                    {new Date(run.createdAt).toLocaleString()}
                                </span>
                            </li>
                            {run.completedAt && (
                                <li>
                                    <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Ended</span>
                                    <span className="text-sm text-neutral-300" suppressHydrationWarning>
                                        {new Date(run.completedAt).toLocaleString()}
                                    </span>
                                </li>
                            )}
                        </ul>
                    </div>

                    <div className="argonaut-panel p-5">
                        <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-neutral-400 border-b border-white/5 pb-3 mb-4">Bundle Summary</h2>
                        <ul className="space-y-4">
                            <li>
                                <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Total Artifacts</span>
                                <span className="text-sm text-neutral-300 font-mono">
                                    {bundle ? (bundle.artifactCounts ? Object.values(bundle.artifactCounts).reduce((a: any, b: any) => a + b, 0) : bundle.artifactCount) : 'Unknown'}
                                </span>
                            </li>
                            {bundle && bundle.artifactCounts && (
                                <li className="pl-4 border-l border-white/10 space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-neutral-500">SARIF</span>
                                        <span className="text-neutral-300 font-mono">{bundle.artifactCounts.sarif || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-neutral-500">SBOM</span>
                                        <span className="text-neutral-300 font-mono">{bundle.artifactCounts.sbom || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-neutral-500">Lockfiles</span>
                                        <span className="text-neutral-300 font-mono">{bundle.artifactCounts.lock || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-neutral-500">Other</span>
                                        <span className="text-neutral-300 font-mono">{bundle.artifactCounts.other || 0}</span>
                                    </div>
                                </li>
                            )}
                            <li>
                                <span className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Bundle Size</span>
                                <span className="text-sm text-neutral-300 font-mono">
                                    {bundle?.totalBytes ? (bundle.totalBytes / 1024).toFixed(1) + ' KB' : 'Unknown'}
                                </span>
                            </li>
                        </ul>
                        {bundle && (
                            <div className="mt-4 pt-4 border-t border-white/5">
                                <Link href={`/apps/${bundle.applicationId || bundle.repo}/bundles/${bundle.bundleId}`} className="text-[10px] uppercase tracking-wider font-bold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2">
                                    View Bundle Details
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                                </Link>
                            </div>
                        )}
                    </div>

                    <div className="argonaut-panel p-5 border-blue-500/20 bg-blue-500/5">
                        <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-blue-400 border-b border-blue-500/10 pb-3 mb-4 flex items-center justify-between">
                            Provenance
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
                        </h2>
                        <div id="provenance-container" className="text-sm text-neutral-300 space-y-3">
                            <span className="text-[11px] text-neutral-500 italic">Determining proving agent...</span>
                        </div>
                    </div>
                </div>

                {/* Right Column - Client Side Timeline and Stream */}
                <div className="lg:col-span-3">
                    <RunTimelineClient initialRun={run} runId={runId} />
                </div>
            </div>
        </main>
    );
}
