import React from 'react';

interface EvidencePeekCellProps {
    evidencePeek?: {
        kind: string;
        text: string;
    };
}

const KIND_STYLES: Record<string, string> = {
    'snippet': 'bg-slate-700/60 text-slate-300',
    'dependency': 'bg-indigo-800/40 text-indigo-300',
    'source-sink': 'bg-violet-800/40 text-violet-300',
    'trace': 'bg-sky-800/40 text-sky-300',
    'config': 'bg-amber-800/40 text-amber-300',
};

export const EvidencePeekCell: React.FC<EvidencePeekCellProps> = ({ evidencePeek }) => {
    if (!evidencePeek) {
        return <span className="text-gray-500 text-xs">—</span>;
    }

    const kindStyle = KIND_STYLES[evidencePeek.kind] || 'bg-gray-700/40 text-gray-400';

    return (
        <div
            className="flex items-center gap-1.5 min-w-0 overflow-hidden"
            title={evidencePeek.text}
        >
            <span className={`shrink-0 text-[9px] font-mono uppercase px-1 py-0.5 rounded ${kindStyle}`}>
                {evidencePeek.kind}
            </span>
            <span className="text-xs text-gray-400 truncate">
                {evidencePeek.text}
            </span>
        </div>
    );
};
