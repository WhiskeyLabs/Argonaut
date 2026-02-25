import { Settings, Bell, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ThemeSwitch } from '@/components/shared/ThemeSwitch';
import { SettingsOverlay } from '@/components/settings/SettingsOverlay';

interface TopNavProps {
    closeHref?: string;
}

export function TopNav({ closeHref }: TopNavProps) {
    const [settingsOpen, setSettingsOpen] = useState(false);

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-gray-200 dark:border-white/5 bg-white/80 dark:bg-gray-950/80 px-4 backdrop-blur-md transition-colors">
                {/* Left: Logo & Branding */}
                <div className="flex items-center gap-3">
                    <Link href="/dashboard" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
                        <img
                            src="/ARGUS_Logo.png"
                            alt="Argus Logo"
                            className="h-8 w-8 object-contain"
                        />
                        <span className="font-display text-lg font-bold tracking-[0.1em] text-gray-900 dark:text-white">
                            ARGUS
                        </span>
                    </Link>
                </div>

                {/* Center: Primary Navigation */}
                {/* Center: Primary Navigation - Removed for cleaner flow */}
                <div className="hidden md:block" />

                {/* Right: Actions */}
                <div className="flex items-center gap-4">
                    {/* Theme Switch */}
                    <ThemeSwitch />

                    {/* Icons */}
                    <button className="relative rounded-full p-2 text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white">
                        <Bell className="h-5 w-5" />
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary-500 shadow-[0_0_8px_rgba(226,59,46,0.6)]" />
                    </button>

                    {/* Settings */}
                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="relative rounded-full p-2 text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white"
                        title="Settings"
                    >
                        <Settings className="h-5 w-5" />
                    </button>

                    {/* User Avatar */}
                    <div className="h-8 w-8 rounded-full bg-red-500 ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center text-xs font-bold text-white uppercase">
                        AW
                    </div>

                    {closeHref && (
                        <Link
                            href={closeHref}
                            className="rounded-full p-2 text-gray-500 dark:text-gray-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                            title="Close Research View"
                        >
                            <X className="h-5 w-5" />
                        </Link>
                    )}
                </div>
            </header>

            <SettingsOverlay open={settingsOpen} onOpenChange={setSettingsOpen} />
        </>
    );
}
