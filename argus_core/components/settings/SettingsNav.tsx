'use client';

import React from 'react';
import {
    LockKeyhole,
    Palette,
    ShieldAlert,
    BrainCircuit,
    HelpCircle,
    Info,
} from 'lucide-react';

export type SettingsSection = 'privacy' | 'appearance' | 'threat-intel' | 'ai-llm' | 'help' | 'about';

interface NavItem {
    id: SettingsSection;
    label: string;
    icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
    { id: 'privacy', label: 'Privacy', icon: LockKeyhole },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'threat-intel', label: 'Threat Intel', icon: ShieldAlert },
    { id: 'ai-llm', label: 'AI / LLM', icon: BrainCircuit },
    { id: 'help', label: 'Help', icon: HelpCircle },
    { id: 'about', label: 'About', icon: Info },
];

interface SettingsNavProps {
    activeSection: SettingsSection;
    onSectionChange: (section: SettingsSection) => void;
}

export function SettingsNav({ activeSection, onSectionChange }: SettingsNavProps) {
    return (
        <nav className="w-[180px] shrink-0 border-r border-gray-200 dark:border-white/10 py-3 px-2 flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                const Icon = item.icon;

                return (
                    <button
                        key={item.id}
                        onClick={() => onSectionChange(item.id)}
                        className={`
                            flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left
                            text-[13px] font-medium transition-all duration-150
                            ${isActive
                                ? 'bg-primary-50 dark:bg-white/10 text-primary-600 dark:text-white'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200'
                            }
                        `}
                    >
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary-500 dark:text-primary-400' : ''}`} />
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
}
