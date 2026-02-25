'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { SettingsNav, type SettingsSection } from './SettingsNav';
import { ThreatIntelPanel } from './panels/ThreatIntelPanel';
import { AILlmPanel } from './panels/AILlmPanel';
import { AppearancePanel } from './panels/AppearancePanel';
import { HelpPanel } from './panels/HelpPanel';
import { AboutPanel } from './panels/AboutPanel';
import { PlaceholderPanel } from './panels/PlaceholderPanel';
import { PrivacyControlsPanel } from './panels/PrivacyControlsPanel';

interface SettingsOverlayProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const SECTION_TITLES: Record<SettingsSection, string> = {
    privacy: 'Privacy & Data Controls',
    appearance: 'Appearance',
    'threat-intel': 'Threat Intel',
    'ai-llm': 'AI / LLM',
    help: 'Help',
    about: 'About',
};

const SECTION_SUBTITLES: Record<SettingsSection, string> = {
    privacy: 'Secure-by-default egress controls and data-handling policy',
    appearance: 'Customize the look and feel of Argus',
    'threat-intel': 'Manage threat intelligence feeds and data freshness',
    'ai-llm': 'Configure AI analysis and model settings',
    help: 'Documentation and support resources',
    about: 'Version, license, and system information',
};

export function SettingsOverlay({ open, onOpenChange }: SettingsOverlayProps) {
    const [activeSection, setActiveSection] = useState<SettingsSection>('privacy');

    const renderPanel = () => {
        switch (activeSection) {
            case 'privacy':
                return <PrivacyControlsPanel />;
            case 'appearance':
                return <AppearancePanel />;
            case 'threat-intel':
                return <ThreatIntelPanel />;
            case 'ai-llm':
                return <AILlmPanel />;
            case 'help':
                return <HelpPanel />;
            case 'about':
                return <AboutPanel />;
            default:
                return (
                    <PlaceholderPanel
                        title={SECTION_TITLES[activeSection]}
                        subtitle={SECTION_SUBTITLES[activeSection]}
                    />
                );
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogPortal>
                {/* Custom overlay with heavy blur */}
                <DialogOverlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

                {/* Wide centered panel */}
                <DialogPrimitive.Content
                    className="fixed left-[50%] top-[50%] z-50 w-[90vw] max-w-[750px] translate-x-[-50%] translate-y-[-50%]
                               h-[70vh] max-h-[600px]
                               bg-white dark:bg-gray-900
                               border border-gray-200 dark:border-white/10
                               rounded-2xl shadow-2xl
                               duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out
                               data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                               data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]
                               flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10 shrink-0">
                        <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">
                            Settings
                        </DialogTitle>
                        <DialogPrimitive.Close className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30">
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </DialogPrimitive.Close>
                    </div>

                    {/* Hidden description for accessibility */}
                    <DialogDescription className="sr-only">
                        Application settings and configuration
                    </DialogDescription>

                    {/* Body: Nav + Content */}
                    <div className="flex flex-1 min-h-0">
                        {/* Left Nav */}
                        <SettingsNav
                            activeSection={activeSection}
                            onSectionChange={setActiveSection}
                        />

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="mb-5">
                                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {SECTION_TITLES[activeSection]}
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {SECTION_SUBTITLES[activeSection]}
                                </p>
                            </div>
                            {renderPanel()}
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
