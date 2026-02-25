import React from 'react';
import { Flame, Activity, ShieldCheck, HelpCircle, CheckCircle2, Clock } from 'lucide-react';
import { useThreatIntel } from '@/hooks/useThreatIntel';
import { UrgencyService } from '@/lib/services/urgencyService';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { THREAT_STALENESS } from '@/lib/services/threatIntelService';
import { formatDistanceToNow } from 'date-fns';

interface ThreatIntelCardProps {
    cveId: string | undefined;
}

export const ThreatIntelCard: React.FC<ThreatIntelCardProps> = ({ cveId }) => {
    const { data: threat, loading } = useThreatIntel(cveId);
    const urgency = UrgencyService.calculateUrgency(threat);
    const urgencyColor = UrgencyService.getUrgencyColor(urgency);
    const urgencyLabel = UrgencyService.getUrgencyLabel(urgency);

    if (!cveId) return null;

    if (loading) {
        return (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-4 backdrop-blur-md shadow-sm animate-pulse space-y-3">
                <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-800 rounded"></div>
                <div className="h-8 w-full bg-gray-200 dark:bg-gray-800 rounded"></div>
            </div>
        );
    }

    if (!threat) {
        return (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-4 backdrop-blur-md shadow-sm flex flex-col items-center justify-center text-center space-y-2">
                <HelpCircle className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                <p className="text-xs text-gray-500">No threat intelligence data available for {cveId}</p>
            </div>
        );
    }

    // Staleness check
    const age = Date.now() - threat.lastUpdated;
    const isStale = age > THREAT_STALENESS.STALE;
    const isAging = age > THREAT_STALENESS.AGING;

    return (
        <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 p-4 backdrop-blur-md shadow-sm space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Threat Intelligence
                </h3>
                <div className="flex items-center gap-2">
                    {/* Staleness Badge */}
                    {(isStale || isAging) && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border 
                                        ${isStale
                                            ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                                            : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'}`}
                                    >
                                        {isStale ? 'Expired' : 'Stale'}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Data is {formatDistanceToNow(threat.lastUpdated)} old. Refresh recommended.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${urgencyColor}`}>
                                    {urgencyLabel} Urgency
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Based on CISA KEV status and EPSS probability.</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {/* KEV Status */}
            {threat.kev ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-3">
                    <div className="bg-red-100 dark:bg-red-800 p-1.5 rounded-full shrink-0">
                        <Flame className="w-4 h-4 text-red-600 dark:text-red-200" />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-red-900 dark:text-red-100">CISA KEV Confirmed</h4>
                        <p className="text-xs text-red-700 dark:text-red-300 mt-0.5 leading-relaxed">
                            This vulnerability is listed in the Known Exploited Vulnerabilities catalog.
                        </p>
                        {threat.kevDateAdded && (
                            <p className="text-[10px] text-red-600 dark:text-red-400 mt-1 font-mono opacity-80">
                                Added: {threat.kevDateAdded}
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-lg p-3 flex items-center gap-3 opacity-75">
                    <CheckCircle2 className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500 font-medium">Not currently in CISA KEV</span>
                </div>
            )}

            {/* EPSS Score */}
            <div className="space-y-1.5">
                <div className="flex justify-between items-end">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        EPSS Probability
                    </label>
                    <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                        {(threat.epssScore * 100).toFixed(2)}%
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${threat.epssScore > 0.1 ? 'bg-red-500' :
                            threat.epssScore > 0.01 ? 'bg-orange-500' :
                                'bg-blue-500'
                            }`}
                        style={{ width: `${Math.min(threat.epssScore * 100 * 5, 100)}%` }} // Scaling for visibility
                    />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Probability of exploitation in next 30 days</span>
                    <span>{threat.epssPercentile ? `${(threat.epssPercentile * 100).toFixed(0)}th %` : 'N/A'}</span>
                </div>
            </div>

            {/* Provenance Footer */}
            <div className="pt-2 border-t border-gray-100 dark:border-white/5 flex flex-col gap-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Source: {threat.source.replace('_', ' ')}</span>
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(threat.lastUpdated).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                        })}
                    </span>
                </div>
                {/* Future: Show Catalog Version if available */}
            </div>
        </div>
    );
};
