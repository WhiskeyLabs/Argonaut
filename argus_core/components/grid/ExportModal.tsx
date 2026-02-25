'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    FileArchive,
    FileText,
    ChevronRight,
    Loader2,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { ExportScope, ExportModel } from '@/lib/types/export';
import { reportingService } from '@/lib/services/reportingService';
import { UniversalFinding } from '@/lib/types/finding';
import { cn } from '@/lib/utils';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string;
    currentViewState: {
        filters: any;
        sort: any;
        findings: UniversalFinding[];
    };
}

type ExportStep = 'CONFIG' | 'GENERATING' | 'SUCCESS' | 'ERROR';
type ExportFormat = 'ZIP' | 'PDF_EXEC' | 'PDF_ENG';

export function ExportModal({ isOpen, onClose, sessionId, currentViewState }: ExportModalProps) {
    const [step, setStep] = useState<ExportStep>('CONFIG');
    const [scope, setScope] = useState<ExportScope>('CURRENT_VIEW');
    const [format, setFormat] = useState<ExportFormat>('ZIP');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset state when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setStep('CONFIG');
            setError(null);
        }
    }, [isOpen]);

    const handleExport = async () => {
        setIsGenerating(true);
        setStep('GENERATING');
        setError(null);

        try {
            // 1. Build Model
            const model = await reportingService.buildExportModel(sessionId, scope, currentViewState);

            let blob: Blob;
            let filename: string;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

            // 2. Generate Format
            if (format === 'ZIP') {
                blob = await reportingService.exportSarifBundle(model);
                filename = `argus-export-${sessionId.slice(0, 8)}-${timestamp}.zip`;
            } else {
                const pdfType = format === 'PDF_EXEC' ? 'EXECUTIVE' : 'ENGINEER';
                blob = await reportingService.exportPdfReport(model, pdfType);
                filename = `argus-report-${pdfType === 'EXECUTIVE' ? 'exec' : 'eng'}-${timestamp}.pdf`;
            }

            // 3. Trigger Download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setStep('SUCCESS');
        } catch (err: any) {
            console.error('Export failed', err);
            setError(err.message || 'An unknown error occurred during export.');
            setStep('ERROR');
        } finally {
            setIsGenerating(false);
        }
    };

    const reset = () => {
        setStep('CONFIG');
        setError(null);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        Export Findings
                    </DialogTitle>
                    <DialogDescription>
                        Generate verifiable, deterministic reports and bundles for compliance.
                    </DialogDescription>
                </DialogHeader>

                {step === 'CONFIG' && (
                    <div className="space-y-6 py-4">
                        {/* Scope Selection */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Export Scope</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setScope('CURRENT_VIEW')}
                                    className={cn(
                                        "flex flex-col items-start p-3 rounded-lg border text-left transition-all",
                                        scope === 'CURRENT_VIEW'
                                            ? "bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500"
                                            : "bg-gray-50 border-gray-200 hover:border-blue-300 dark:bg-white/5 dark:border-white/10"
                                    )}
                                >
                                    <span className="text-sm font-bold">Current View</span>
                                    <span className="text-[10px] text-gray-500">{currentViewState.findings.length} findings (filtered)</span>
                                </button>
                                <button
                                    onClick={() => setScope('SESSION')}
                                    className={cn(
                                        "flex flex-col items-start p-3 rounded-lg border text-left transition-all",
                                        scope === 'SESSION'
                                            ? "bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500"
                                            : "bg-gray-50 border-gray-200 hover:border-blue-300 dark:bg-white/5 dark:border-white/10"
                                    )}
                                >
                                    <span className="text-sm font-bold">Full Session</span>
                                    <span className="text-[10px] text-gray-500">Entire dataset</span>
                                </button>
                            </div>
                        </div>

                        {/* Format Selection */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Artifact Format</label>
                            <div className="space-y-2">
                                <button
                                    onClick={() => setFormat('ZIP')}
                                    className={cn(
                                        "flex items-center gap-3 w-full p-3 rounded-lg border text-left transition-all",
                                        format === 'ZIP'
                                            ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20 dark:border-emerald-500"
                                            : "bg-gray-50 border-gray-200 hover:border-emerald-300 dark:bg-white/5 dark:border-white/10"
                                    )}
                                >
                                    <FileArchive className="h-5 w-5 text-emerald-600" />
                                    <div className="flex-1">
                                        <span className="text-sm font-bold block">Hardened SARIF Bundle (ZIP)</span>
                                        <span className="text-[10px] text-gray-500 truncate">Source SARIF + Overlay + Manifest + Audit Summary</span>
                                    </div>
                                    {format === 'ZIP' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                                </button>

                                <button
                                    onClick={() => setFormat('PDF_EXEC')}
                                    className={cn(
                                        "flex items-center gap-3 w-full p-3 rounded-lg border text-left transition-all",
                                        format === 'PDF_EXEC'
                                            ? "bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500"
                                            : "bg-gray-50 border-gray-200 hover:border-blue-300 dark:bg-white/5 dark:border-white/10"
                                    )}
                                >
                                    <FileText className="h-5 w-5 text-blue-600" />
                                    <div className="flex-1">
                                        <span className="text-sm font-bold block">Executive Summary (PDF)</span>
                                        <span className="text-[10px] text-gray-500">Funnel Metrics & Risk Posture (Leadership ready)</span>
                                    </div>
                                    {format === 'PDF_EXEC' && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                                </button>

                                <button
                                    onClick={() => setFormat('PDF_ENG')}
                                    className={cn(
                                        "flex items-center gap-3 w-full p-3 rounded-lg border text-left transition-all",
                                        format === 'PDF_ENG'
                                            ? "bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500"
                                            : "bg-gray-50 border-gray-200 hover:border-blue-300 dark:bg-white/5 dark:border-white/10"
                                    )}
                                >
                                    <FileText className="h-5 w-5 text-blue-600" />
                                    <div className="flex-1">
                                        <span className="text-sm font-bold block">Engineering Detail (PDF)</span>
                                        <span className="text-[10px] text-gray-500">Full Findings Table (Capped at 2k entries)</span>
                                    </div>
                                    {format === 'PDF_ENG' && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'GENERATING' && (
                    <div className="py-12 flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                        <div className="text-center">
                            <p className="font-bold text-gray-900 dark:text-gray-100 italic">Assembling Hardened Metrics...</p>
                            <p className="text-xs text-gray-500 mt-1">Verifying SARIF integrity and computing SHA-256 hashes</p>
                        </div>
                    </div>
                )}

                {step === 'SUCCESS' && (
                    <div className="py-12 flex flex-col items-center justify-center space-y-4">
                        <div className="h-16 w-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                        </div>
                        <div className="text-center">
                            <p className="font-bold text-gray-900 dark:text-gray-100">Export Ready!</p>
                            <p className="text-xs text-gray-500 mt-1">Your artifact has been generated and download should have started.</p>
                        </div>
                        <Button onClick={onClose} variant="outline" className="mt-4">Close</Button>
                    </div>
                )}

                {step === 'ERROR' && (
                    <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
                        <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center">
                            <AlertCircle className="h-10 w-10 text-red-500" />
                        </div>
                        <div className="px-6">
                            <p className="font-bold text-gray-900 dark:text-gray-100">Export Failed</p>
                            <p className="text-xs text-red-500 mt-2">{error}</p>
                        </div>
                        <DialogFooter className="w-full flex gap-2 justify-center mt-4">
                            <Button onClick={reset} variant="outline">Try Again</Button>
                            <Button onClick={onClose} variant="ghost">Cancel</Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 'CONFIG' && (
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={handleExport}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
                        >
                            Generate Artifact
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
