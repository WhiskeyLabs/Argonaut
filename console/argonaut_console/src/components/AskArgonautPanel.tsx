'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Bot, User, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

interface ChatMessage {
    role: 'user' | 'agent';
    content: string;
    timestamp: Date;
    citations?: Array<{ type: string; findingId?: string }>;
}

interface AskArgonautPanelProps {
    isOpen: boolean;
    onClose: () => void;
    runId?: string;
    findingId?: string | null;
    findingIds?: string[];
}

export default function AskArgonautPanel({
    isOpen,
    onClose,
    runId,
    findingId,
    findingIds,
}: AskArgonautPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Reset when runId changes
    useEffect(() => {
        setMessages([]);
        setConversationId(null);
    }, [runId]);

    const sendMessage = useCallback(async () => {
        if (!input.trim() || loading || !runId) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    runId,
                    message: userMessage.content,
                    conversationId,
                    context: {
                        findingId: findingId || undefined,
                        findingIds: findingIds?.length ? findingIds : undefined,
                    },
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setConversationId(data.conversationId);
                const agentMessage: ChatMessage = {
                    role: 'agent',
                    content: data.answer,
                    timestamp: new Date(),
                    citations: data.citations,
                };
                setMessages(prev => [...prev, agentMessage]);
            } else {
                const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
                const errMessage: ChatMessage = {
                    role: 'agent',
                    content: `Error: ${errData.error || 'Failed to get response'}`,
                    timestamp: new Date(),
                };
                setMessages(prev => [...prev, errMessage]);
            }
        } catch (err: any) {
            const errMessage: ChatMessage = {
                role: 'agent',
                content: `Connection error: ${err.message}`,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errMessage]);
        } finally {
            setLoading(false);
        }
    }, [input, loading, runId, conversationId, findingId, findingIds]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/40 z-[200] transition-opacity"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed inset-y-0 right-0 w-[480px] max-w-[90vw] z-[201] flex flex-col bg-[#070711] border-l border-indigo-500/20 shadow-2xl shadow-indigo-500/5 transform transition-transform duration-300">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 to-purple-950/30 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white tracking-wide">ASK ARGONAUT</h2>
                            <p className="text-[10px] text-indigo-400/70 font-mono uppercase tracking-widest">Elastic Agent Builder AI</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Context Pills */}
                <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5 shrink-0 bg-black/20">
                    {runId ? (
                        <>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                Run: {runId.slice(0, 12)}…
                            </span>
                            {findingId && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    Finding: {findingId.slice(0, 10)}…
                                </span>
                            )}
                            {findingIds && findingIds.length > 0 && !findingId && (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                    Selection: {findingIds.length} findings
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="text-[10px] text-neutral-500 italic">
                            Open a run to ask run-scoped questions.
                        </span>
                    )}
                </div>

                {/* Messages */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
                >
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 flex items-center justify-center mb-4 border border-indigo-500/10">
                                <Bot className="w-8 h-8 text-indigo-400" />
                            </div>
                            <p className="text-sm text-neutral-400 mb-2">Ask me about this run</p>
                            <div className="space-y-1.5 text-[11px] text-neutral-600">
                                <p>"What are the top reachable KEVs?"</p>
                                <p>"Summarize this run in 5 bullets"</p>
                                <p>"Why is finding X ranked higher than Y?"</p>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            {msg.role === 'agent' && (
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-600/20 flex items-center justify-center shrink-0 mt-0.5 border border-indigo-500/20">
                                    <Bot className="w-3.5 h-3.5 text-indigo-400" />
                                </div>
                            )}
                            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-indigo-600/20 text-indigo-100 border border-indigo-500/20'
                                    : 'bg-white/[0.03] text-neutral-300 border border-white/5'
                                }`}>
                                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                                {msg.citations && msg.citations.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-1">
                                        {msg.citations.map((c, j) => (
                                            <span
                                                key={j}
                                                className="inline-flex text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400/80 border border-indigo-500/10"
                                            >
                                                {c.findingId?.slice(0, 12)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {msg.role === 'user' && (
                                <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0 mt-0.5 border border-white/10">
                                    <User className="w-3.5 h-3.5 text-neutral-400" />
                                </div>
                            )}
                        </div>
                    ))}

                    {loading && (
                        <div className="flex gap-3 justify-start">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-600/20 flex items-center justify-center shrink-0 mt-0.5 border border-indigo-500/20">
                                <Bot className="w-3.5 h-3.5 text-indigo-400" />
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                                <span className="text-sm text-neutral-500 italic">Analyzing run data…</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="shrink-0 border-t border-indigo-500/20 p-4 bg-black/30">
                    {!runId ? (
                        <div className="flex items-center gap-2 text-neutral-500 text-xs justify-center py-2">
                            <AlertCircle className="w-4 h-4" />
                            <span>Navigate to a run to start asking questions.</span>
                        </div>
                    ) : (
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about this run…"
                                disabled={loading}
                                rows={1}
                                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 resize-none focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-all disabled:opacity-50"
                                style={{ minHeight: '44px', maxHeight: '120px' }}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={loading || !input.trim()}
                                className="h-[44px] w-[44px] flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white hover:from-indigo-400 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
