
import React from 'react';
import { useThreatIntel } from '@/hooks/useThreatIntel';
import { Badge } from '@/components/shared/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Flame } from 'lucide-react';
import { THREAT_STALENESS } from '@/lib/services/threatIntelService';
import { formatDistanceToNow } from 'date-fns';

interface ThreatContextCellProps {
    cveId: string | undefined;
    threat?: {
        kev?: boolean;
        epss?: number;
        source?: string;
        lastUpdated?: number;
    };
}

export const ThreatContextCell: React.FC<ThreatContextCellProps> = ({ cveId, threat }) => {
    const shouldFetch = !threat && !!cveId && cveId.startsWith('CVE-');
    const { data: hookData, loading } = useThreatIntel(shouldFetch ? cveId : undefined);

    const kev = threat?.kev ?? hookData?.kev ?? false;
    const epss = threat?.epss ?? hookData?.epssScore ?? 0;
    const lastUpdated = threat?.lastUpdated ?? hookData?.lastUpdated;
    const hasThreatData = threat || hookData;

    if (!cveId || !cveId.startsWith('CVE-')) return <span className="text-gray-500 text-xs">—</span>;
    if (!hasThreatData && loading) return <span className="animate-pulse bg-gray-200/10 h-4 w-10 rounded inline-block" />;
    if (!hasThreatData) return <span className="text-gray-500 text-xs">—</span>;

    const tokens: string[] = [];
    if (kev) tokens.push('KEV');
    if (epss > 0) tokens.push((epss * 100).toFixed(0) + '%');
    if (tokens.length === 0) return <span className="text-gray-500 text-xs">—</span>;

    // Staleness Logic
    let stalenessDot = null;
    let stalenessText = '';

    if (lastUpdated) {
        const age = Date.now() - lastUpdated;
        if (age > THREAT_STALENESS.STALE) {
            stalenessDot = 'bg-red-500';
            stalenessText = `Expired (${formatDistanceToNow(lastUpdated)} old)`;
        } else if (age > THREAT_STALENESS.AGING) {
            stalenessDot = 'bg-amber-500';
            stalenessText = `Stale (${formatDistanceToNow(lastUpdated)} old)`;
        } else if (age > THREAT_STALENESS.FRESH) {
            stalenessDot = 'bg-gray-400'; // Subtle indicator for aging but valid
            stalenessText = `Updated ${formatDistanceToNow(lastUpdated)} ago`;
        }
    }

    return (
        <div className="flex items-center gap-1.5 group">
            {/* Staleness Dot */}
            {stalenessDot && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                            <div className={`w-1.5 h-1.5 rounded-full ${stalenessDot}`} />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{stalenessText}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            {kev && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                            <Badge className="bg-red-600 hover:bg-red-700 text-white border-none flex items-center gap-0.5 px-1.5 py-0.5 text-[10px]">
                                <Flame size={9} /> KEV
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Known Exploited Vulnerability</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
            {epss > 0 && (
                <span
                    className={`text-xs font-mono ${epss >= 0.5 ? 'text-orange-400 font-bold' : 'text-gray-400'}`}
                    title={`EPSS: ${(epss * 100).toFixed(2)}%`}
                >
                    {(epss * 100).toFixed(0)}%
                </span>
            )}
        </div>
    );
};
