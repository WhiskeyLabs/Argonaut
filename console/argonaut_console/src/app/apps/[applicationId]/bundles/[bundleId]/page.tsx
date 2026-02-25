import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getKibanaDiscoverUrl } from '@/lib/kibanaLinks';

interface Bundle {
    bundleId: string;
    applicationId?: string;
    applicationName?: string;
    repo: string;
    buildId: string;
    createdAt: string;
    status: string;
    runId?: string;
    lastRunId?: string;
    activeRunId?: string;
    processingLock?: {
        runId?: string;
        lockedAt?: string;
        lockedBy?: string;
    };
    artifactCounts?: {
        sarif: number;
        sbom: number;
        lock: number;
        other: number;
    };
}

async function getBundle(bundleId: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/bundles/${bundleId}`, {
        cache: 'no-store'
    });

    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch bundle');
    }

    return res.json();
}

export default async function BundleDetail({ params }: { params: Promise<{ applicationId: string, bundleId: string }> }) {
    const { applicationId, bundleId } = await params;
    const data = await getBundle(bundleId);

    if (!data || !data.bundle) {
        notFound();
    }

    const bundle: Bundle = data.bundle;

    // Task 7.4.2 Routing Policy
    if (bundle.lastRunId) {
        redirect(`/runs/${bundle.lastRunId}`);
    } else if (bundle.status === 'PROCESSING' && bundle.activeRunId) {
        redirect(`/runs/${bundle.activeRunId}`);
    }

    const status = bundle.status || 'PROCESSED';
    const isNew = status === 'NEW';

    // Fallback to repo if applicationId/applicationName are missing
    const appName = bundle.applicationName || bundle.repo;
    const appId = bundle.applicationId || bundle.repo;

    // Link to view the raw documents for this bundle in Kibana
    const effectiveRunId = bundle.lastRunId || bundle.processingLock?.runId || bundle.runId;
    const kibanaLink = getKibanaDiscoverUrl('argonaut-*', `bundleId:"${bundle.bundleId}"`);

    return (
        <main className="argonaut-shell">
            {/* Breadcrumb */}
            <div className="mb-8 border-b border-white/5 pb-6">
                <nav className="flex text-[11px] font-bold tracking-widest uppercase text-neutral-400 gap-2 mb-6">
                    <Link href="/" className="hover:text-white transition-colors">Applications</Link>
                    <span className="text-neutral-600">/</span>
                    <Link href={`/apps/${applicationId}`} className="hover:text-white transition-colors">
                        {appName}
                    </Link>
                </nav>

                <div className="flex items-start justify-between mt-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Build {bundle.buildId}</h1>
                            <span className={`inline-flex items-center rounded-sm px-2.5 py-0.5 mt-[-8px] text-[10px] uppercase font-bold tracking-wider ring-1 ring-inset ${isNew ? 'bg-blue-500/20 text-blue-400 ring-blue-500/30' :
                                status === 'FAILED' ? 'bg-red-500/20 text-red-400 ring-red-500/30' :
                                    'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                }`}>
                                {status}
                            </span>
                        </div>
                        <p className="text-neutral-500 font-mono text-[11px] uppercase tracking-widest mb-4">ID: {bundle.bundleId}</p>
                    </div>

                    <div className="flex gap-3">
                        {effectiveRunId && (
                            <Link
                                href={`/runs/${effectiveRunId}`}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[11px] uppercase font-bold tracking-wider transition-all duration-200"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                Open Active Run
                            </Link>
                        )}
                        <a
                            href={kibanaLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-white/5 border border-white/10 rounded-md text-[11px] uppercase font-bold tracking-wider transition-all duration-200"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h10" /><path d="M9 4v16" /><path d="m3 9 3 3-3 3" /></svg>
                            View in Kibana
                        </a>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Main Context Column */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="argonaut-panel p-6">
                        <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-neutral-400 border-b border-white/5 pb-3 mb-5">Metadata</h2>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                            <div>
                                <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Application</dt>
                                <dd className="mt-1 text-sm text-neutral-200">{appName}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Repository</dt>
                                <dd className="mt-1 text-sm text-neutral-200 font-mono">{bundle.repo}</dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Received On</dt>
                                <dd className="mt-1 text-sm text-neutral-200 font-mono" suppressHydrationWarning>
                                    {new Date(bundle.createdAt).toLocaleString()}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Run ID</dt>
                                <dd className="mt-1 text-sm text-neutral-200 font-mono">
                                    {effectiveRunId ? (
                                        <Link href={`/runs/${effectiveRunId}`} className="text-emerald-400 hover:underline">
                                            {effectiveRunId}
                                        </Link>
                                    ) : (
                                        <span className="text-neutral-600 italic">Not Assigned</span>
                                    )}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Right Sidebar - Active Run Status */}
                <div className="space-y-6">
                    <div className={`argonaut-panel p-6 ${isNew ? 'bg-blue-500/5 border-blue-500/20' : ''}`}>
                        <h2 className="text-[11px] uppercase tracking-[0.2em] font-bold text-neutral-400 border-b border-white/5 pb-3 mb-5">Analysis Run Status</h2>

                        {isNew ? (
                            <div className="text-center py-6">
                                <div className="mx-auto w-12 h-12 rounded-full border border-blue-500/30 bg-blue-500/10 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                </div>
                                <h3 className="text-white font-medium mb-1 tracking-wide">Waiting to Start</h3>
                                <p className="text-[11px] text-neutral-400 mt-2">This bundle is queued for analysis. Processing should begin automatically.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Current Phase</span>
                                    <span className={`text-[10px] uppercase font-bold tracking-wider ${effectiveRunId ? 'text-emerald-400' : 'text-neutral-500'}`}>
                                        {effectiveRunId ? 'Completed' : 'Historical Data'}
                                    </span>
                                </div>
                                <div className={`p-4 rounded-md border ${effectiveRunId ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-white/5 border-white/10'}`}>
                                    <p className="text-xs text-neutral-300 mb-3">
                                        {effectiveRunId
                                            ? 'The analysis for this bundle has been processed successfully.'
                                            : 'This bundle was processed before the current tracking system was active.'}
                                    </p>
                                    {effectiveRunId && (
                                        <Link
                                            href={`/runs/${effectiveRunId}`}
                                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-white/5 border border-white/10 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all duration-200"
                                        >
                                            View Full Timeline
                                        </Link>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </main>
    );
}
