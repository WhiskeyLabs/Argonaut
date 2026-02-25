import Link from 'next/link';
import { ShieldCheck, Eye, ArrowRight } from 'lucide-react';

export default function LoginPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-tertiary-50 dark:bg-gray-950 relative overflow-hidden transition-colors">
            {/* Background Grid & Vignette */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[size:24px_24px]
                    bg-[linear-gradient(to_right,rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.05)_1px,transparent_1px)]
                    dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)]" />
                <div className="absolute inset-0 
                    bg-gradient-to-b from-tertiary-50 via-transparent to-tertiary-50/80
                    dark:bg-gradient-to-b dark:from-gray-950 dark:via-transparent dark:to-gray-950/80" />
                <div className="absolute inset-0 
                    bg-[radial-gradient(circle_at_center,transparent_0%,#f7f7f7_100%)] opacity-80
                    dark:bg-[radial-gradient(circle_at_center,transparent_0%,#070707_100%)]" />
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md">

                <div className="w-full overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-gray-900/60 shadow-2xl backdrop-blur-xl transition-all">
                    {/* Header */}
                    <div className="border-b border-gray-100 dark:border-white/5 bg-white/50 dark:bg-white/5 p-8 text-center">
                        <div className="mx-auto mb-4 flex items-center justify-center gap-4">
                            <img
                                src="/ARGUS_Logo.png"
                                alt="Argus Logo"
                                className="h-10 w-10 object-contain"
                            />
                            <span className="text-3xl font-bold tracking-[0.2em] text-gray-900 dark:text-white font-display">
                                ARGUS
                            </span>
                        </div>
                        <h2 className="mb-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white font-display">
                            Context over <span className="bg-gradient-to-r from-primary-500 to-indigo-500 bg-clip-text text-transparent">Counts.</span>
                        </h2>
                        <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
                            <p>Noise reduction in vulnerability management.</p>
                            <p>Triage vulnerabilities securely and locally with optional AI enrichment</p>
                        </div>
                    </div>

                    {/* Form */}
                    <div className="p-8">
                        <form className="flex flex-col gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                                    Login
                                </label>
                                <input
                                    type="email"
                                    placeholder="user@argus.io"
                                    className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:border-primary-500 focus:bg-white dark:focus:bg-primary-500/5 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                                    Password
                                </label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        placeholder="••••••••••••"
                                        className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:border-primary-500 focus:bg-white dark:focus:bg-primary-500/5 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-white transition-colors"
                                    >
                                        <Eye className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <Link href="/drop" className="group mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-4 py-3.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(226,59,46,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(226,59,46,0.5)] active:scale-[0.98]">
                                Sign In
                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </Link>
                        </form>
                    </div>


                </div>
            </div>
        </div>
    );
}
