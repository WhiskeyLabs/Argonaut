import { useLiveQuery } from 'dexie-react-hooks';
import { db, RecentArtifact } from '@/lib/db';
import { History, FileText, Clock, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RecentLockfilesWidgetProps {
    onSelect: (content: string, filename: string) => void;
    onDelete?: (filename: string) => void;
    className?: string;
    hideHeader?: boolean;
}

export function RecentLockfilesWidget({ onSelect, onDelete, className = '', hideHeader = false }: RecentLockfilesWidgetProps) {
    const recentLockfiles = useLiveQuery(async () => {
        return await db.recent_artifacts
            .where('artifactType')
            .equals('NPM_LOCKFILE')
            .reverse()
            .sortBy('lastUsedAt');
    });

    if (!recentLockfiles || recentLockfiles.length === 0) {
        return null; // Don't show if empty
    }

    const handleSelect = async (artifact: RecentArtifact) => {
        let contentStr = '';
        if (typeof artifact.content === 'string') {
            contentStr = artifact.content;
        } else if (artifact.content instanceof Blob) {
            contentStr = await artifact.content.text();
        }
        onSelect(contentStr, artifact.filename);
    };

    const handleDelete = async (artifact: RecentArtifact) => {
        const confirmed = window.confirm(
            `Delete recent context "${artifact.filename}"?\n\nThis removes the cached lockfile from local recent context history.`
        );
        if (!confirmed) return;
        await db.recent_artifacts.delete(artifact.recentId);
        onDelete?.(artifact.filename);
    };

    return (
        <div className={`w-full max-w-lg ${className}`}>
            {!hideHeader && (
                <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                    <History className="h-4 w-4" />
                    <span>Recent Lockfiles</span>
                </div>
            )}

            <div className="bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm">
                {recentLockfiles.map((artifact) => (
                    <div
                        key={artifact.recentId}
                        className="w-full flex items-center gap-2 p-2 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0 group"
                    >
                        <button
                            onClick={() => handleSelect(artifact)}
                            className="flex-1 min-w-0 flex items-center gap-4 p-1 text-left"
                        >
                            <div className="h-8 w-8 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                                <FileText className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {artifact.filename}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span className="truncate max-w-[120px] font-mono opacity-70">
                                        {artifact.contentHash.substring(0, 8)}...
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {formatDistanceToNow(artifact.lastUsedAt, { addSuffix: true })}
                                    </span>
                                </div>
                            </div>

                            <div className="text-xs font-semibold text-primary-600 dark:text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                Use File
                            </div>
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleDelete(artifact);
                            }}
                            className="h-8 w-8 mr-1 rounded-md border border-transparent hover:border-red-400/40 hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center"
                            title="Delete recent context"
                            aria-label={`Delete ${artifact.filename}`}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
