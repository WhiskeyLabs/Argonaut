import { notFound } from 'next/navigation';
import Link from 'next/link';
import FindingsGridClient from './FindingsGridClient';

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

export default async function FindingsPage({ params }: { params: Promise<{ runId: string }> }) {
    const { runId } = await params;
    const run = await getRun(runId);

    if (!run) {
        notFound();
    }

    return (
        <main className="argonaut-shell flex flex-col h-screen">
            {/* Header section with Breadcrumb */}
            <header className="mb-6 border-b border-white/5 pb-6 shrink-0">
                <div className="flex justify-between items-start">
                    <div>
                        <Link href={`/runs/${runId}`} className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1 mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                            Back to Run
                        </Link>
                        <p className="text-[11px] tracking-[0.22em] uppercase text-emerald-500 font-bold mb-1">Findings Triage</p>
                        <div className="flex items-center gap-4 mb-2">
                            <h1 className="text-4xl font-bold tracking-tight text-white">{run.runId}</h1>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] uppercase tracking-widest font-mono text-neutral-500">
                            <span>App: <span className="text-neutral-300">{run.applicationId}</span></span>
                            <span>Bundle: <span className="text-neutral-300">{run.bundleId}</span></span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content - flex col to take remaining height */}
            <div className="flex-1 min-h-0 relative">
                <FindingsGridClient runId={runId} />
            </div>
        </main>
    );
}
