import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Inbox } from 'lucide-react';
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
        <main className="argonaut-shell flex flex-col h-screen overflow-hidden">
            {/* Header section with Breadcrumb */}
            <header className="mb-6 argonaut-panel p-8 reveal is-visible shrink-0">
                <div className="flex justify-between items-start">
                    <div>
                        <Link href={`/runs/${runId}`} className="text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1 mb-6">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Run
                        </Link>
                        <p className="eyebrow">Findings Triage</p>
                        <div className="flex flex-wrap items-center gap-4 mb-3">
                            <h1 className="text-4xl font-bold tracking-tight text-white">{run.runId}</h1>
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
                        </div>
                    </div>
                    <div className="hidden lg:flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                            <Inbox className="w-5 h-5 text-accent-blue" />
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content - flex col to take remaining height */}
            <div className="flex-1 min-h-0 relative px-8 pb-8 reveal is-visible" style={{ transitionDelay: '50ms' }}>
                <FindingsGridClient runId={runId} />
            </div>
        </main>
    );
}
