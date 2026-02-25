import Link from 'next/link';

interface AppSummary {
  applicationId: string;
  applicationName: string;
  totalBundles: number;
  statusCounts: {
    NEW: number;
    PROCESSED: number;
    FAILED: number;
  };
  latestBundle: {
    createdAt: string;
    status: string;
  } | null;
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
      <header className="mb-12 border-b border-white/5 pb-6">
        <p className="text-[11px] tracking-[0.22em] uppercase text-red-500 font-bold mb-1">Applications Landing</p>
        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Argonaut Console</h1>
        <p className="text-neutral-400 text-sm max-w-[70ch] mt-2">
          Select an integrated application to view the latest automated security triage bundles.
        </p>
      </header>

      {apps.length === 0 ? (
        <div className="argonaut-panel p-12 text-center text-neutral-400">
          <p>No applications found in the registry.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {apps.map((app) => (
            <Link
              href={`/apps/${app.applicationId}`}
              key={app.applicationId}
              className="group block"
            >
              <div className="argonaut-panel p-6 h-full transition-all duration-250 hover:-translate-y-1 hover:border-red-500/50 hover:bg-white/5 relative overflow-hidden">
                {/* Glow effect on hover matching system aesthetic */}
                <div className="absolute -inset-10 bg-gradient-radial from-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none blur-2xl" />

                <div className="flex justify-between items-start mb-4 relative z-10">
                  <h2 className="text-xl font-semibold text-white truncate pr-4" title={app.applicationName}>
                    {app.applicationName}
                  </h2>
                  {app.statusCounts.NEW > 0 && (
                    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-blue-400 ring-1 ring-inset ring-blue-500/20 uppercase">
                      {app.statusCounts.NEW} NEW
                    </span>
                  )}
                </div>

                <div className="space-y-3 relative z-10">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400 text-xs uppercase tracking-widest font-bold">Total Bundles</span>
                    <span className="text-white font-mono font-semibold text-lg">{app.totalBundles}</span>
                  </div>

                  <div className="flex gap-2 font-mono text-[10px] uppercase text-neutral-500">
                    ID: {app.applicationId}
                  </div>
                </div>

                {app.latestBundle && (
                  <div className="mt-6 pt-4 border-t border-white/5 relative z-10">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 font-bold">Latest Activity</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-bold tracking-wider uppercase ${app.latestBundle.status === 'NEW' ? 'text-blue-400' :
                        app.latestBundle.status === 'FAILED' ? 'text-red-400' : 'text-emerald-400'
                        }`}>
                        {app.latestBundle.status}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-400" suppressHydrationWarning>
                        {new Date(app.latestBundle.createdAt).toLocaleDateString()} {new Date(app.latestBundle.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
