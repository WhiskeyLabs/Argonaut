import Link from 'next/link';

interface Bundle {
  bundleId: string;
  buildId: string;
  createdAt: string;
  status: string;
  lastRunId?: string;
  activeRunId?: string;
}

interface AppSummary {
  applicationId: string;
  applicationName: string;
  totalBundles: number;
  statusCounts: {
    NEW: number;
    PROCESSED: number;
    FAILED: number;
  };
  latestBundle: Bundle | null;
  recentBundles: Bundle[];
}

async function getApplications() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/apps`, {
    cache: 'no-store'
  });

  if (!res.ok) {
    throw new Error('Failed to fetch applications');
  }

  return res.json();
}

export default async function Home() {
  const data = await getApplications();
  const apps: AppSummary[] = data.apps || [];

  return (
    <main className="argonaut-shell">
      <header className="mb-12 border-b border-white/5 pb-8">
        <h1 className="text-5xl font-bold tracking-tight text-white mb-2">Argonaut Console</h1>
        <p className="text-accent-blue/80 text-sm font-bold uppercase tracking-[0.2em]">Applications & Builds</p>
      </header>

      {apps.length === 0 ? (
        <div className="argonaut-panel p-16 text-center text-neutral-400 border-dashed border-white/10">
          <p className="text-lg">No applications found in the registry.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {apps.map((app) => (
            <div
              key={app.applicationId}
              className="argonaut-panel p-8 h-[540px] flex flex-col relative overflow-hidden group border-white/[0.06]"
            >
              {/* Neon Glow on hover */}
              <div className="absolute -inset-[100%] bg-gradient-radial from-accent-blue/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none blur-3xl" />

              <div className="flex justify-between items-start mb-10 relative z-10 shrink-0">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2 group-hover:text-accent-blue transition-colors duration-300">
                    {app.applicationName}
                  </h2>
                  <div className="flex gap-4 font-mono text-[10px] uppercase text-neutral-400 tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5 inline-block">
                    ID: {app.applicationId}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 text-right">
                  <div className="flex gap-2 items-center">
                    {app.statusCounts.NEW > 0 && (
                      <span className="badge-neon badge-blue">
                        {app.statusCounts.NEW} NEW
                      </span>
                    )}
                    <span className="text-white font-mono font-bold text-2xl leading-none">
                      {app.totalBundles}
                    </span>
                  </div>
                  <span className="text-neutral-400 text-[10px] uppercase tracking-widest font-bold font-barlow">Total Bundles</span>
                </div>
              </div>

              {/* Bundles Table - Scrollable Area */}
              <div className="relative z-10 flex-1 flex flex-col min-h-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-4 font-bold flex items-center gap-2 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
                  Recent Inbox
                </p>
                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar max-h-[320px]">
                  {app.recentBundles && app.recentBundles.length > 0 ? (
                    app.recentBundles.map((bundle) => {
                      const effectiveRunId = bundle.lastRunId || bundle.activeRunId;
                      const targetUrl = effectiveRunId ? `/runs/${effectiveRunId}` : `/apps/${app.applicationId}/bundles/${bundle.bundleId}`;

                      return (
                        <Link
                          key={bundle.bundleId}
                          href={targetUrl}
                          className="flex items-center justify-between p-4 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.03] hover:border-white/10 rounded-xl transition-all duration-200 group/row"
                        >
                          <div className="flex items-center gap-5">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-white group-hover/row:text-accent-blue transition-colors">
                                Build {bundle.buildId}
                              </span>
                              <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-tighter">
                                {bundle.bundleId}
                              </span>
                            </div>
                            <span className={`badge-neon text-[9px] py-0.5 px-2 ${bundle.status === 'NEW' ? 'badge-blue animate-pulse' :
                              bundle.status === 'FAILED' ? 'badge-pink' : 'badge-green'
                              }`}>
                              {bundle.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-right flex flex-col items-end">
                              <span className="text-[10px] font-mono text-neutral-300">
                                {new Date(bundle.createdAt).toLocaleDateString()}
                              </span>
                              <span className="text-[9px] font-mono text-neutral-400 uppercase">
                                {new Date(bundle.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                              </span>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover/row:bg-accent-blue/20 group-hover/row:scale-110 transition-all">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover/row:text-accent-blue">
                                <path d="m9 18 6-6-6-6" />
                              </svg>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    <p className="text-xs text-neutral-400 italic py-4 font-barlow">No recent bundles found.</p>
                  )}
                </div>
              </div>

              {/* Action Footer */}
              <div className="mt-8 pt-6 border-t border-white/5 relative z-10 flex justify-between items-center shrink-0">
                <Link
                  href={`/apps/${app.applicationId}`}
                  className="text-[10px] font-bold text-accent-blue/80 hover:text-accent-blue uppercase tracking-widest transition-colors"
                >
                  View All {app.totalBundles} Bundles
                </Link>
                <div className="h-1 w-12 bg-neutral-800 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
