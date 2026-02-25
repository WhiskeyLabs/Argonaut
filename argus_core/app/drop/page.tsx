'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useDropzone, FileRejection, DropEvent } from 'react-dropzone';
import { useRouter } from 'next/navigation';
import {
    Upload,
    FileJson,
    AlertCircle,
    Loader2,
    FileCode,
    ShieldCheck,
    ArrowRight,
    Package,
    X,
    CheckCircle2,
    Database,
    FileText,
    UploadCloud,
    Check,
    ChevronDown,
    Folder
} from 'lucide-react';
import { reachabilityService } from '@/lib/services/reachabilityService';
import { RecentLockfilesWidget } from '@/components/dashboard/RecentLockfilesWidget';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { BottomHud } from '@/components/dashboard/BottomHud';
import { ProjectService } from '@/lib/services/projectService';
import { Project } from '@/lib/types/finding';
import { buildStructuredInputError, toUiInputError, UiInputError } from '@/lib/errors/inputErrorGuidance';
import { setLastActiveSessionId } from '@/lib/navigation/navMemory';

export default function DropZonePage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [error, setError] = useState<UiInputError | null>(null);

    // State for the lockfile (either dropped or selected from history)
    const [pendingLockfile, setPendingLockfile] = useState<{ content: string; filename: string } | null>(null);

    // Epic 5: Project Context
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
    const projectMenuRef = useRef<HTMLDivElement | null>(null);

    // Load projects on mount
    React.useEffect(() => {
        ProjectService.getAllProjects().then(setProjects).catch(console.error);
    }, []);

    React.useEffect(() => {
        const onMouseDown = (event: MouseEvent) => {
            if (!projectMenuRef.current) return;
            if (event.target instanceof Node && !projectMenuRef.current.contains(event.target)) {
                setIsProjectMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);

    const compactTechnicalDetail = (detail?: string): string | undefined => {
        if (!detail) return undefined;
        const singleLine = detail.split('\n').map(s => s.trim()).filter(Boolean).join(' ');
        return singleLine.length > 240 ? `${singleLine.slice(0, 240)}...` : singleLine;
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;
        try {
            const newProject = await ProjectService.createProject(newProjectName);
            setProjects(prev => [...prev, newProject]);
            setSelectedProjectId(newProject.id);
            setIsCreatingProject(false);
            setNewProjectName('');
            setIsProjectMenuOpen(false);
        } catch (e) {
            console.error('Failed to create project', e);
            setError(
                toUiInputError({
                    ...buildStructuredInputError('UNKNOWN'),
                    userMessage: 'Failed to create project.',
                    technicalDetail: e instanceof Error ? e.message : String(e),
                })
            );
        }
    };

    const handleSelectProject = (projectId: string) => {
        if (projectId === 'NEW') {
            setIsCreatingProject(true);
            setIsProjectMenuOpen(false);
            return;
        }
        setSelectedProjectId(projectId);
        setIsProjectMenuOpen(false);
    };

    const handleDeleteProject = async (project: Project) => {
        const confirmed = window.confirm(
            `Delete project "${project.name}"?\n\nThis will permanently remove the project and all linked local sessions/findings/context data. This cannot be undone.`
        );
        if (!confirmed) return;

        try {
            await ProjectService.deleteProjectCascade(project.id);
            const refreshed = await ProjectService.getAllProjects();
            setProjects(refreshed);
            if (selectedProjectId === project.id) {
                setSelectedProjectId('');
            }
            setIsProjectMenuOpen(false);
        } catch (e) {
            setError(
                toUiInputError({
                    ...buildStructuredInputError('UNKNOWN'),
                    userMessage: 'Failed to delete project.',
                    technicalDetail: e instanceof Error ? e.message : String(e),
                })
            );
        }
    };

    // ─── 1. Main Scan Drop Zone ──────────────────────────────────────

    const onDropScan = useCallback(async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
        setError(null);

        if (fileRejections.length > 0) {
            const msgs = fileRejections.map(r => `${r.file.name}: ${r.errors.map(e => e.message).join(', ')}`);
            setError(
                toUiInputError({
                    ...buildStructuredInputError('WRONG_FILE_TYPE'),
                    userMessage: 'One or more scan files were rejected.',
                    technicalDetail: `Invalid scan files: ${msgs.join('; ')}`,
                })
            );
            return;
        }

        if (acceptedFiles.length === 0) return;

        // Filter valid scan files (exclude generic JSON that might be lockfiles if valid)
        // Note: useDropzone accept prop handles extensions, but we double check
        const scanFiles = acceptedFiles.filter(f =>
            (f.name.endsWith('.sarif') || f.name.endsWith('.json')) &&
            !f.name.endsWith('package-lock.json')
        );

        if (scanFiles.length === 0) {
            setError(
                toUiInputError({
                    ...buildStructuredInputError('WRONG_FILE_TYPE'),
                    userMessage: 'Please drop at least one valid .sarif or .json findings file.',
                })
            );
            return;
        }

        if (!selectedProjectId && !isCreatingProject) {
            setError(
                toUiInputError({
                    ...buildStructuredInputError('UNKNOWN'),
                    userMessage: 'Please select or create a project context first.',
                })
            );
            return;
        }

        await processFiles(scanFiles[0]); // Process the first valid scan file
    }, [pendingLockfile, selectedProjectId, isCreatingProject, newProjectName]); // Depends on pendingLockfile to include it

    const {
        getRootProps: getScanRootProps,
        getInputProps: getScanInputProps,
        isDragActive: isScanDragActive
    } = useDropzone({
        onDrop: onDropScan,
        accept: {
            'application/json': ['.json', '.sarif'],
            'application/sarif+json': ['.sarif']
        },
        maxFiles: 1, // Start with single file support for simplicity
        multiple: false
    });

    // ─── 2. Lockfile Drop Zone ───────────────────────────────────────

    const onDropLockfile = useCallback(async (acceptedFiles: File[]) => {
        setError(null);
        const file = acceptedFiles[0];
        if (file) {
            const isJson = file.name.endsWith('.json');
            if (isJson) {
                try {
                    const content = await file.text();
                    let parsed: unknown;
                    try {
                        parsed = JSON.parse(content);
                    } catch {
                        setError(
                            toUiInputError({
                                ...buildStructuredInputError('LOCKFILE_PARSE_FAIL'),
                                userMessage: 'The file does not appear to be a valid npm lockfile.',
                                technicalDetail: 'Invalid JSON content in lockfile.',
                            })
                        );
                        return;
                    }

                    const asObj = parsed as Record<string, unknown> | null;
                    const hasPackages = !!asObj && typeof asObj === 'object' && !!asObj.packages && typeof asObj.packages === 'object';
                    const hasDependencies = !!asObj && typeof asObj === 'object' && !!asObj.dependencies && typeof asObj.dependencies === 'object';
                    const hasLockfileVersion = !!asObj && typeof asObj === 'object' && typeof asObj.lockfileVersion === 'number';
                    const isLockfile = (hasLockfileVersion && hasPackages) || hasDependencies;

                    if (!isLockfile) {
                        setError(
                            toUiInputError({
                                ...buildStructuredInputError('LOCKFILE_PARSE_FAIL'),
                                userMessage: 'The file does not appear to be a valid npm lockfile.',
                                technicalDetail: 'Missing expected lockfile structure (packages/dependencies).',
                            })
                        );
                        return;
                    }

                    setPendingLockfile({ content, filename: file.name });
                    await reachabilityService.cacheLockfile(content, file.name);
                } catch (err) {
                    console.error('Failed to read lockfile', err);
                    setError(
                        toUiInputError({
                            ...buildStructuredInputError('LOCKFILE_PARSE_FAIL'),
                            userMessage: 'Failed to process lockfile content.',
                            technicalDetail: err instanceof Error ? err.message : String(err),
                        })
                    );
                }
            } else {
                setError(
                    toUiInputError({
                        ...buildStructuredInputError('LOCKFILE_PARSE_FAIL'),
                        userMessage: 'Please drop a valid .json package-lock file.',
                    })
                );
            }
        }
    }, []);

    const {
        getRootProps: getLockRootProps,
        getInputProps: getLockInputProps,
        isDragActive: isLockDragActive
    } = useDropzone({
        onDrop: onDropLockfile,
        accept: { 'application/json': ['.json'] },
        maxFiles: 1,
        multiple: false
    });

    const handleRecentSelect = (content: string, filename: string) => {
        setPendingLockfile({ content, filename });
        setError(null);
    };

    const handleRecentDelete = (filename: string) => {
        if (pendingLockfile?.filename === filename) {
            setPendingLockfile(null);
        }
    };

    const clearLockfile = (e: React.MouseEvent) => {
        e.stopPropagation();
        setPendingLockfile(null);
    };

    // ─── Processing ──────────────────────────────────────────────────

    const processFiles = async (scanFile: File) => {
        setIsLoading(true);
        setStatusMessage('Initializing session...');

        try {
            // 1. Ensure Project First
            let finalProjectId = selectedProjectId;
            if (isCreatingProject && newProjectName) {
                const newProject = await ProjectService.createProject(newProjectName);
                finalProjectId = newProject.id;
                // Update local state implicitly
                setProjects(prev => [...prev, newProject]);
                setSelectedProjectId(newProject.id);
                setIsCreatingProject(false);
                setNewProjectName('');
            } else if (!finalProjectId) {
                throw new Error("No project selected.");
            }

            // 1b. Prepare Session
            const { v4: uuidv4 } = await import('uuid');
            const { db } = await import('@/lib/db');

            const sessionId = uuidv4();
            await db.sessions.add({
                id: sessionId,
                timestamp: Date.now(),
                filename: scanFile.name,
                findingCount: 0,
                tool: 'pending',
                state: 'IMPORTING' as const,
                schemaVersion: 2,
                projectId: finalProjectId // Fixed: Link session to project
            });

            // 2. Read Findings
            const scanContent = await scanFile.text();

            // 3. Worker Ingest
            setStatusMessage('Parsing findings...');
            const worker = new Worker(new URL('../../workers/ingest.worker.ts', import.meta.url));

            worker.onmessage = async (event) => {
                const payload = event.data;
                const { type, stats } = payload;

                if (type === 'SUCCESS') {
                    console.log('Ingest Success:', stats);

                    // 4. Attach Lockfile (if present)
                    if (pendingLockfile) {
                        setStatusMessage('Processing lockfile...');
                        await reachabilityService.setLockfile(
                            sessionId,
                            pendingLockfile.content,
                            pendingLockfile.filename
                        );
                    }

                    // 4b. Rehydrate State (Restore previous triage)
                    // We do this BEFORE marking READY so the user sees correct state immediately
                    if (finalProjectId) {
                        setStatusMessage('Restoring previous state...');
                        const { RehydrationService } = await import('@/lib/services/rehydrationService');
                        await RehydrationService.rehydrateSession(sessionId, finalProjectId);
                    }

                    // 5. Finalize
                    await db.sessions.update(sessionId, {
                        state: 'READY',
                        findingCount: stats.count,
                        tool: 'detected-in-worker'
                    });

                    setLastActiveSessionId(sessionId);
                    router.push(`/dashboard/${sessionId}`);
                    worker.terminate();

                } else if (type === 'ERROR') {
                    const mappedError = toUiInputError(payload);
                    console.error('Worker Error:', mappedError);
                    await db.sessions.update(sessionId, { state: 'FAILED' });
                    setError(mappedError);
                    setIsLoading(false);
                    worker.terminate();
                }
            };

            worker.onerror = (e) => {
                console.error('Worker Script Error:', e);
                setError(
                    toUiInputError({
                        ...buildStructuredInputError('WORKER_SCRIPT_ERROR'),
                        technicalDetail: e.message || 'Worker script failed to load.',
                    })
                );
                setIsLoading(false);
                worker.terminate();
            };

            worker.postMessage({
                type: 'PARSE',
                fileContent: scanContent,
                fileName: scanFile.name,
                sessionId,
                projectId: finalProjectId
            });

        } catch (err: unknown) {
            console.error('Session Init Error:', err);
            const detail = err instanceof Error ? err.message : String(err);
            setError(
                toUiInputError({
                    ...buildStructuredInputError('UNKNOWN'),
                    userMessage: detail || 'Failed to initialize session',
                    technicalDetail: detail,
                })
            );
            setIsLoading(false);
        }
    };

    // ─── Render ──────────────────────────────────────────────────────

    return (
        <DashboardShell>
            <div className="flex flex-1 flex-col items-center justify-center p-6 pb-48 relative min-h-[calc(100vh-4rem)]">

                <div className="w-full max-w-3xl flex flex-col gap-8">

                    {/* Header */}
                    <div className="text-center space-y-2">
                        <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500">
                            Research Workspace
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400">
                            Import scan results to begin analysis
                        </p>
                    </div>

                    {/* Error Banner */}
                    {error && (
                        <div className="w-full p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2">
                            <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                            <div className="flex-1 text-sm text-red-700 dark:text-red-200">
                                <p className="font-semibold">{error.title}</p>
                                <p className="mt-0.5">{error.userMessage}</p>
                                {error.recoverySteps.length > 0 && (
                                    <ul className="mt-2 list-disc list-inside space-y-0.5 text-xs text-red-700/90 dark:text-red-200/90">
                                        {error.recoverySteps.slice(0, 3).map((step, idx) => (
                                            <li key={`${error.code}-${idx}`}>{step}</li>
                                        ))}
                                    </ul>
                                )}
                                {compactTechnicalDetail(error.technicalDetail) && (
                                    <details className="mt-2">
                                        <summary className="cursor-pointer text-xs font-medium">Technical details</summary>
                                        <p className="mt-1 text-[11px] text-red-700/80 dark:text-red-200/80 break-all">
                                            {compactTechnicalDetail(error.technicalDetail)}
                                        </p>
                                    </details>
                                )}
                            </div>
                            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* 0. Project Context Selection */}
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="h-8 w-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                                <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Project Context</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Select which project these findings belong to.</p>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-4">
                            {!isCreatingProject ? (
                                <div ref={projectMenuRef} className="flex-1 relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsProjectMenuOpen(v => !v)}
                                        className="w-full h-12 rounded-xl border border-gray-300 dark:border-white/10 bg-white/80 dark:bg-black/40 text-gray-900 dark:text-white px-4 flex items-center justify-between hover:border-blue-400/60 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                            <span className="truncate">
                                                {selectedProjectId
                                                    ? (projects.find(p => p.id === selectedProjectId)?.name || 'Select a Project...')
                                                    : 'Select a Project...'}
                                            </span>
                                        </div>
                                        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isProjectMenuOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isProjectMenuOpen && (
                                        <div className="absolute z-40 mt-2 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#111317] shadow-xl overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => handleSelectProject('')}
                                                className="w-full px-3 py-2 text-left text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                                            >
                                                Select a Project...
                                            </button>
                                            {projects.map(p => (
                                                <div
                                                    key={p.id}
                                                    className="flex items-center gap-2 px-2 py-1.5 border-t border-gray-100 dark:border-white/5"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectProject(p.id)}
                                                        className={`flex-1 min-w-0 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${selectedProjectId === p.id
                                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                                                                : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5'
                                                            }`}
                                                    >
                                                        <span className="truncate block">
                                                            {p.name} (Last updated: {new Date(p.updatedAt).toLocaleDateString()})
                                                        </span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDeleteProject(p)}
                                                        className="h-8 w-8 rounded-md border border-transparent hover:border-red-400/40 hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center"
                                                        title={`Delete ${p.name}`}
                                                        aria-label={`Delete ${p.name}`}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => handleSelectProject('NEW')}
                                                className="w-full px-3 py-2 text-left text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors border-t border-gray-100 dark:border-white/5"
                                            >
                                                + Create New Project
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex-1 flex gap-2 animate-in fade-in slide-in-from-left-2">
                                    <input
                                        type="text"
                                        placeholder="Enter project name..."
                                        value={newProjectName}
                                        onChange={(e) => setNewProjectName(e.target.value)}
                                        className="flex-1 h-12 rounded-xl border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleCreateProject}
                                        disabled={!newProjectName.trim()}
                                        className="h-12 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Create
                                    </button>
                                    <button
                                        onClick={() => { setIsCreatingProject(false); setNewProjectName(''); }}
                                        className="h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Main Drop Zone */}
                    <div
                        {...getScanRootProps()}
                        className={`
                            relative group cursor-pointer
                            h-64 w-full rounded-3xl border-2 border-dashed transition-all duration-300 ease-out
                            flex flex-col items-center justify-center gap-4 text-center overflow-hidden
                            ${isScanDragActive
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 scale-[1.02] shadow-xl'
                                : 'border-gray-300 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] hover:bg-white/80 dark:hover:bg-white/[0.04] hover:border-primary-400 dark:hover:border-white/20'
                            }
                            ${isLoading ? 'opacity-50 pointer-events-none' : ''}
                        `}
                    >
                        <input {...getScanInputProps()} />

                        {isLoading ? (
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 className="h-10 w-10 text-primary-500 animate-spin" />
                                <div className="space-y-1">
                                    <p className="font-semibold text-gray-900 dark:text-white">{statusMessage}</p>
                                    <p className="text-xs text-gray-500">Please wait...</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className={`
                                    h-16 w-16 rounded-2xl bg-gradient-to-br from-gray-100 to-white dark:from-gray-800 dark:to-gray-900 
                                    flex items-center justify-center shadow-inner border border-gray-200 dark:border-white/5
                                    group-hover:scale-110 transition-transform duration-300
                                    ${isScanDragActive ? 'animate-bounce' : ''}
                                `}>
                                    <FileJson className="h-8 w-8 text-gray-400 group-hover:text-primary-500 transition-colors" />
                                </div>

                                <div className="space-y-1 relative z-10 max-w-sm">
                                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                                        {isScanDragActive ? 'Drop scan file now' : 'Drop SARIF or JSON findings'}
                                    </p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Drag & drop your security scan results here to start a new analysis session.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Secondary Zone: Lockfile Context */}
                    <div className={`transition-opacity duration-500 ${isLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-600">
                                Optional Context
                            </span>
                            <div className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Lockfile Drop */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <Package className="h-3.5 w-3.5" />
                                    Add a New Context
                                </label>

                                {!pendingLockfile ? (
                                    <div
                                        {...getLockRootProps()}
                                        className={`
                                            relative cursor-pointer group
                                            h-full min-h-[120px] rounded-xl border border-dashed transition-all duration-200
                                            flex flex-col items-center justify-center gap-2 text-center p-4
                                            ${isLockDragActive
                                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
                                                : 'border-gray-300 dark:border-white/10 bg-white/30 dark:bg-white/[0.02] hover:bg-white/50 dark:hover:bg-white/[0.04] hover:border-emerald-500/50'
                                            }
                                        `}
                                    >
                                        <input {...getLockInputProps()} />
                                        <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                            <FileCode className="h-4 w-4 text-gray-500 group-hover:text-emerald-500 transition-colors" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Drop a Lock file
                                            </p>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-500 px-2 leading-tight">
                                                Drag & drop your package-lock to use for this analysis.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full min-h-[120px] rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 flex flex-col items-center justify-center relative p-4 animate-in fade-in zoom-in-95">
                                        <button
                                            onClick={clearLockfile}
                                            className="absolute top-2 right-2 p-1.5 hover:bg-emerald-500/20 rounded-full text-emerald-600 dark:text-emerald-400 transition-colors"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>

                                        <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mb-2">
                                            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 text-center break-all px-2">
                                            {pendingLockfile.filename}
                                        </p>
                                        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                                            Ready for analysis
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Recent Lockfiles History */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                    <Database className="h-3.5 w-3.5" />
                                    Use a Recent Context
                                </label>
                                <div className="h-full min-h-[120px] rounded-xl border border-gray-200 dark:border-white/10 bg-white/30 dark:bg-white/[0.02] overflow-hidden">
                                    <RecentLockfilesWidget
                                        onSelect={handleRecentSelect}
                                        onDelete={handleRecentDelete}
                                        className="mt-0 w-full"
                                        hideHeader={true}
                                    />
                                </div>
                            </div>

                        </div>
                    </div>

                </div>

                <div className="absolute bottom-6 left-0 right-0 px-6">
                    <BottomHud />
                </div>
            </div>
        </DashboardShell>
    );
}
