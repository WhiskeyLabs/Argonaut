'use client';

import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
    label?: string;
    className?: string;
}

export default function BackButton({ label = "Back", className = "" }: BackButtonProps) {
    return (
        <button
            onClick={() => window.history.back()}
            className={`text-sm font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1 mb-6 cursor-pointer ${className}`}
        >
            <ArrowLeft className="w-4 h-4" />
            {label}
        </button>
    );
}
