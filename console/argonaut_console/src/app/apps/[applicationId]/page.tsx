import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Bundle {
    bundleId: string;
    applicationId?: string;
    applicationName?: string;
    repo: string;
    buildId: string;
    createdAt: string;
    status: string;
}

async function getBundles(applicationId: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/apps/${applicationId}/bundles`, {
        cache: 'no-store'
    });

    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch bundles');
    }

    return res.json();
}

export default async function ApplicationInbox({ params }: { params: Promise<{ applicationId: string }> }) {
    const { applicationId } = await params;
    const data = await getBundles(applicationId);

    if (!data) {
        notFound();
    }

    const bundles: Bundle[] = data.bundles || [];

    // Try to find the app name from the first bundle
    const appName = bundles.length > 0 ? (bundles[0].applicationName || bundles[0].repo) : applicationId;

    return (
        <main className="argonaut-shell">
            <header className="mb-12 border-b border-white/5 pb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <Link href="/" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1 mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                            Back to Applications
                        </Link>
                        <p className="text-[11px] tracking-[0.22em] uppercase text-red-500 font-bold mb-1">Bundles Inbox</p>
                        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">{appName}</h1>
                    </div>
                    <div className="mt-8 text-right">
                        <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-mono">ID: {applicationId}</span>
                    </div>
                </div>
            </header>

            {/* Inbox List */}
            <div className="argonaut-panel overflow-hidden">
                {bundles.length === 0 ? (
                    <div className="p-12 text-center text-neutral-400">
                        <p>No bundles found for this application.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-white/5">
                        {bundles.map((bundle) => {
                            const isNew = bundle.status === 'NEW';
                            return (
                                <li key={bundle.bundleId} className={`group hover:bg-white/5 transition-colors relative ${isNew ? 'bg-blue-500/5' : ''}`}>
                                    {/* Hover glow for list item */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 max-w-[50%] opacity-0 group-hover:opacity-10 pointer-events-none transition-opacity" />

                                    <Link href={`/apps/${applicationId}/bundles/${bundle.bundleId}`} className="block p-4 sm:p-5 relative z-10">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                {isNew && (
                                                    <span className="flex h-2 w-2 rounded-full bg-blue-500 ring-2 ring-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.8)]"></span>
                                                )}
                                                {!isNew && (
                                                    <span className="flex h-2 w-2 rounded-full bg-transparent"></span>
                                                )}
                                                <div>
                                                    <div className="flex items-center gap-3">
                                                        <p className={`text-sm font-semibold truncate ${isNew ? 'text-white' : 'text-neutral-300'}`}>
                                                            Build {bundle.buildId}
                                                        </p>
                                                        <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider ring-1 ring-inset ${isNew ? 'bg-blue-500/20 text-blue-400 ring-blue-500/30' :
                                                            bundle.status === 'FAILED' ? 'bg-red-500/20 text-red-400 ring-red-500/30' :
                                                                'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                                            }`}>
                                                            {bundle.status}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500 font-mono uppercase">
                                                        <span>{bundle.bundleId}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right ml-4 flex-shrink-0">
                                                <p className={`text-[11px] font-mono ${isNew ? 'text-neutral-300 font-medium' : 'text-neutral-500'}`} suppressHydrationWarning>
                                                    {new Date(bundle.createdAt).toLocaleDateString()} {new Date(bundle.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </main>
    );
}
