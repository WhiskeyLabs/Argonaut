import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, AlertTriangle, FileCode, CheckCircle, XCircle } from 'lucide-react';
import { PatchBundle } from '@/lib/types/patch';
import { patchService } from '@/lib/services/patchService';

interface PatchReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    patch: PatchBundle | null;
}

export function PatchReviewModal({ isOpen, onClose, patch }: PatchReviewModalProps) {
    const [isDownloading, setIsDownloading] = useState(false);

    if (!patch) return null;

    const validation = patchService.validatePatch(patch);
    const isValid = validation.isValid;

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const blob = await patchService.createBundle([patch]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `argus-fix-${patch.patch_id.substring(0, 8)}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            onClose();
        } catch (error) {
            console.error('Failed to generate bundle', error);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 bg-[#09090b] text-white border-white/10">
                <DialogHeader className="p-6 border-b border-white/10">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            Review Patch Bundle
                            <Badge variant={patch.type === 'dependency_update' ? 'default' : 'secondary'} className="ml-2">
                                {patch.type.replace('_', ' ')}
                            </Badge>
                        </DialogTitle>
                    </div>
                    <DialogDescription className="text-gray-400 mt-1">
                        {patch.summary}
                    </DialogDescription>

                    {/* Validation Status */}
                    <div className="mt-4 flex items-center gap-2">
                        {isValid ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                                <CheckCircle className="h-4 w-4" />
                                <span>Validation Passed</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                <XCircle className="h-4 w-4" />
                                <span>Validation Failed</span>
                            </div>
                        )}

                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${patch.risk.level === 'low' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                                patch.risk.level === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                    'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                            <AlertTriangle className="h-4 w-4" />
                            <span>{patch.risk.level.toUpperCase()} Risk</span>
                        </div>
                    </div>

                    {!isValid && (
                        <Alert variant="destructive" className="mt-3 bg-red-900/20 border-red-900/50">
                            <AlertTitle>Issues Detected</AlertTitle>
                            <AlertDescription>
                                <ul className="list-disc pl-4 text-xs">
                                    {validation.errors.map((err, i) => <li key={i}>{err}</li>)}
                                </ul>
                            </AlertDescription>
                        </Alert>
                    )}
                </DialogHeader>

                <ScrollArea className="flex-1 p-6">
                    <div className="space-y-6">
                        {/* Risk Notes */}
                        {patch.risk.notes.length > 0 && (
                            <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-amber-400 mb-2">Risk Assessment</h4>
                                <ul className="list-disc pl-4 space-y-1 text-sm text-gray-300">
                                    {patch.risk.notes.map((note, i) => (
                                        <li key={i}>{note}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* File Changes */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                <FileCode className="h-4 w-4" />
                                Files Changed ({patch.changes.length})
                            </h4>

                            {patch.changes.map((change, idx) => (
                                <div key={idx} className="rounded-lg border border-white/10 overflow-hidden bg-black/20">
                                    <div className="bg-white/5 px-3 py-2 text-xs font-mono text-gray-400 border-b border-white/5">
                                        {change.path}
                                    </div>
                                    <div className="p-3 bg-black/40 overflow-x-auto">
                                        <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
                                            {change.diff}
                                        </pre>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="p-4 border-t border-white/10 bg-white/5">
                    <Button variant="ghost" onClick={onClose} >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleDownload}
                        disabled={isDownloading || !isValid}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    >
                        {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Download Patch Bundle
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
