import React, { useState } from 'react';
import { Zap, ShieldCheck, Copy, Check, Wrench, AlertTriangle, Loader2, Bot } from 'lucide-react';
import { FixRecommendation } from '@/lib/types/research';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';

interface AISuggestedFixCardProps {
    fix: FixRecommendation;
    onApply?: () => Promise<void>;
    isApplying?: boolean;
    className?: string;
    showLoadingAI?: boolean;
    hideFooter?: boolean;
    contextFilePath?: string | null;
    onGeneratePatch?: () => Promise<void>;
    isGeneratingPatch?: boolean;
}

export function AISuggestedFixCard({
    fix,
    onApply,
    isApplying,
    className,
    showLoadingAI,
    hideFooter,
    contextFilePath,
    onGeneratePatch,
    isGeneratingPatch
}: AISuggestedFixCardProps) {
    const [copied, setCopied] = useState(false);

    const isAI = fix.source.type === 'GENERAI_MODEL';
    const sourceLabel = isAI ? 'Qwen3-Coder-A35B' : (fix.source.ref || 'STATIC RULE');
    const vulnerableFileLabel = contextFilePath?.split('/').pop() || 'Model-proposed snippet';
    const vulnerableBeforeContent = fix.patch.before?.trim()
        ? fix.patch.before
        : '// No vulnerable snippet provided for this recommendation.';

    // Confidence color logic
    const confidenceColor = fix.confidence >= 90 ? 'text-emerald-500' :
        fix.confidence <= 10 ? 'text-red-500' :
            'text-amber-500';

    const handleCopy = () => {
        navigator.clipboard.writeText(fix.patch.after);
        setCopied(true);
        toast.success("Fix copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={cn("rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-sm overflow-hidden flex flex-col transition-all duration-300", className)}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isAI ? (
                        <Zap className="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
                    ) : (
                        <ShieldCheck className="h-4 w-4 text-blue-500" />
                    )}
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                        Suggested Fix
                    </span>
                </div>

                <div className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
                    isAI
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                )}>
                    {isAI ? (
                        <>
                            <Bot className="h-3 w-3" />
                            AI
                        </>
                    ) : (
                        <>
                            <ShieldCheck className="h-3 w-3" />
                            RULE
                        </>
                    )}
                </div>
            </div>

            {/* Content Body */}
            <div className="p-0 font-mono text-xs">
                <div className="border-b border-gray-100 dark:border-white/5">
                    <div className="px-4 py-1.5 bg-red-50/50 dark:bg-red-900/10 text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3" />
                        Vulnerable Code <span className="text-gray-400 dark:text-gray-500 font-normal normal-case ml-auto opacity-70">{vulnerableFileLabel}</span>
                    </div>
                    <div className="p-4 bg-red-50/20 dark:bg-red-950/10 text-gray-600 dark:text-gray-400 overflow-x-auto relative">
                        {/* Line styling effect */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/50"></div>
                        <pre className="whitespace-pre-wrap">{vulnerableBeforeContent}</pre>
                    </div>
                </div>

                {/* Suggested Fix (Green) */}
                <div className="relative group">
                    <div className="px-4 py-1.5 bg-emerald-50/50 dark:bg-emerald-900/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                        <Check className="h-3 w-3" />
                        Suggested Fix
                    </div>
                    <div className="p-4 bg-emerald-50/20 dark:bg-emerald-950/10 text-gray-800 dark:text-gray-200 overflow-x-auto relative min-h-[80px]">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/50"></div>
                        <pre className="whitespace-pre-wrap">{fix.patch.after}</pre>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2 h-7 w-7 p-0 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors opacity-0 group-hover:opacity-100"
                            onClick={handleCopy}
                            title="Copy to clipboard"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
                        </Button>
                    </div>
                </div>
            </div>

            {/* AI Loading Indicator (Subtle) */}
            {showLoadingAI && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50/50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 animate-pulse">
                    <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
                    <span className="text-[10px] text-gray-400 font-medium italic">
                        Argus AI designing full fix...
                    </span>
                </div>
            )}

            {/* Footer Metadata */}
            {!hideFooter && (
                <div className="px-4 py-2 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-white/10 flex items-center justify-between text-[10px] text-gray-500">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0" title="Source of this recommendation">
                            <span className="uppercase tracking-wider opacity-70">SOURCE:</span>
                            <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[110px] sm:max-w-[150px]">
                                {sourceLabel}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="uppercase tracking-wider opacity-70">CONFIDENCE:</span>
                            <span className={cn("font-medium", confidenceColor)}>
                                {fix.confidence}%
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                        {onGeneratePatch && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onGeneratePatch}
                                disabled={isGeneratingPatch}
                                className="h-6 px-2 text-[10px] uppercase tracking-wider whitespace-nowrap gap-1 border-emerald-400 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-400 dark:hover:bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
                            >
                                {isGeneratingPatch && <Loader2 className="h-3 w-3 animate-spin" />}
                                GENERATE PATCH
                            </Button>
                        )}

                        {onApply && (
                            <Button
                                size="sm"
                                onClick={onApply}
                                disabled={isApplying}
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                            >
                                {isApplying ? (
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                ) : (
                                    <Wrench className="h-3.5 w-3.5" />
                                )}
                                MARK AS FIXED
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
