"use client";

import React, { useState } from "react";
import { Copy, Check, AlertTriangle, CheckCircle2 } from "lucide-react";
import { FixRecommendation } from "@/lib/types/research";

interface CodeDiffPanelProps {
    recommendation: FixRecommendation | null;
}

export function CodeDiffPanel({ recommendation }: CodeDiffPanelProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (recommendation) {
            navigator.clipboard.writeText(recommendation.patch.after);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!recommendation) {
        return (
            <div className="flex-1 flex items-center justify-center p-4 text-muted-foreground text-sm">
                Select a node to view code details
            </div>
        );
    }

    const sourceLabel = recommendation.source.type === "GENERAI_MODEL"
        ? "Qwen3-Coder-A35B"
        : (recommendation.source.ref || recommendation.source.type.replace(/_/g, " "));

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Vulnerable Code Section */}
            <div className="border-b border-border">
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/5 border-b border-red-500/10">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                        Vulnerable Code
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                        {recommendation.type === "Upgrade" ? "pom.xml" : "source.ts"}
                    </span>
                </div>
                <div className="bg-black/50 p-3 overflow-x-auto">
                    <pre className="text-xs font-mono">
                        {recommendation.patch.before.split("\n").map((line, idx) => (
                            <div key={idx} className="flex">
                                <span className="w-8 text-gray-600 select-none shrink-0">{idx + 12}</span>
                                <span className={line.includes("version") || line.includes("artifactId") ? "text-red-400 bg-red-500/10" : "text-gray-300"}>
                                    {line}
                                </span>
                            </div>
                        ))}
                    </pre>
                </div>
            </div>

            {/* Suggested Fix Section */}
            <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border-b border-emerald-500/10">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        Suggested Fix
                    </span>
                    <button
                        onClick={handleCopy}
                        className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied!" : "Copy"}
                    </button>
                </div>
                <div className="bg-black/50 p-3 overflow-x-auto flex-1">
                    <pre className="text-xs font-mono">
                        {recommendation.patch.after.split("\n").map((line, idx) => (
                            <div key={idx} className="flex">
                                <span className="w-8 text-gray-600 select-none shrink-0">{idx + 12}</span>
                                <span className={line.includes("version") || line.includes("artifactId") ? "text-emerald-400 bg-emerald-500/10" : "text-gray-300"}>
                                    {line}
                                </span>
                            </div>
                        ))}
                    </pre>
                </div>
            </div>

            {/* Source Attribution */}
            <div className="px-3 py-2 bg-muted/10 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
                <span>Source: {sourceLabel}</span>
                <span>Confidence: {recommendation.confidence}%</span>
            </div>
        </div>
    );
}
