import { FindingsView } from '../../../components/grid/FindingsView';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { BottomHud } from '@/components/dashboard/BottomHud';

interface PageProps {
    params: Promise<{ sessionId: string }>;
}

export default async function GridTestPage({ params }: PageProps) {
    const { sessionId } = await params;

    return (
        <DashboardShell>
            <div className="flex flex-col h-[calc(100vh-3.5rem)]">
                {/* Findings View (Takes remaining height) */}
                <div className="flex-1 overflow-hidden p-6 pb-52">
                    <FindingsView sessionId={sessionId} />
                </div>

                {/* Pulse Deck (HUD) */}
                <BottomHud sessionId={sessionId} />
            </div>
        </DashboardShell>
    );
}
