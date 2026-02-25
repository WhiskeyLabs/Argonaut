"use client";

import { useState, useRef, useEffect } from "react";
import { HeatmapGrid } from "@/components/chat/HeatmapGrid";
import { ArrowRight, ChevronDown, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePrivacySettings } from "@/hooks/usePrivacySettings";

interface Message {
    role: "user" | "assistant" | "system";
    content: string;
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [hasStarted, setHasStarted] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // -- CONTROLS --
    const [thinkingMode, setThinkingMode] = useState<"fast" | "research">("fast");
    const [selectedModel, setSelectedModel] = useState("Qwen/Qwen2.5-Coder-7B-Instruct");
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const { policy } = usePrivacySettings();

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const models = [
        { id: "Qwen/Qwen2.5-Coder-7B-Instruct", name: "Qwen 2.5 Coder" },
        { id: "deepseek-coder", name: "DeepSeek Coder V2" },
        { id: "llama-3", name: "Llama 3" },
    ];

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        if (!hasStarted) setHasStarted(true);

        const userMsg: Message = { role: "user", content: input };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setInput("");
        setIsTyping(false);
        setIsLoading(true);

        try {
            if (!policy.canUseCloudAI) {
                setMessages(prev => [...prev, {
                    role: "system",
                    content: "PRIVACY POLICY BLOCK: Hosted AI assistance is disabled by Privacy & Data Controls."
                }]);
                return;
            }

            // -- REAL AI CALL --
            const response = await fetch('/api/ai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-argus-privacy-intent': 'ai-cloud-assistance',
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: newHistory.map(m => ({ role: m.role, content: m.content })),
                    temperature: thinkingMode === 'research' ? 0.7 : 0.4,
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const aiContent = data.choices?.[0]?.message?.content || data.response || "No response data.";

            setMessages(prev => [...prev, { role: "assistant", content: aiContent }]);

        } catch (error: any) {
            console.error(error);
            const detail = error instanceof Error ? error.message : String(error);
            setMessages(prev => [...prev, {
                role: "system",
                content: `CONNECTION LOST: GPU NODE UNREACHABLE.\nDETAILS: ${detail}`
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="relative w-screen h-screen bg-black overflow-hidden font-sans text-neutral-200 flex flex-col">

            {/* 1. BACKGROUND GRID (Fixed Top Overlay, Z-Index 20) */}
            <div className="absolute top-0 left-0 w-full h-[35vh] z-20 pointer-events-none bg-gradient-to-b from-black via-black/95 to-transparent">
                <div className="w-full h-full flex flex-col items-center justify-center relative">
                    <div className="absolute inset-0 opacity-80 flex items-center justify-center">
                        <HeatmapGrid isActive={isTyping || isLoading} />
                    </div>
                    <div className="relative z-30 flex flex-col items-center mt-4">
                        <h1 className="text-6xl md:text-8xl font-bold tracking-[0.2em] text-[#D5D1D1] uppercase mb-2 drop-shadow-[0_4px_4px_rgba(0,0,0,1)]">
                            ARGUS
                        </h1>
                        <span className="block text-center text-xs md:text-sm font-bold tracking-[0.4em] text-[#D5D1D1] uppercase drop-shadow-sm">
                            Security Intelligence
                        </span>
                    </div>
                </div>
            </div>

            {/* 2. SCROLLABLE SENSOR LOG (Middle Layer, Z-Index 10) */}
            <div className="absolute inset-0 z-10 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent pt-[35vh] pb-40 px-4">
                <div className="w-full max-w-4xl mx-auto flex flex-col justify-end min-h-full">
                    <AnimatePresence>
                        {messages.map((msg, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex flex-col mb-4 ${msg.role === 'user' ? 'items-end text-right' : 'items-start text-left'}`}
                            >
                                {/* Text-Based Message (No Boxes) */}
                                <div className="font-mono text-sm md:text-base leading-relaxed">
                                    <span className={`uppercase font-bold tracking-wider mr-3 ${msg.role === 'user' ? 'text-[#871A11]' :
                                        msg.role === 'system' ? 'text-[#facc15]' : // Yellow from Matrix
                                            'text-[#D5D1D1]' // Grey
                                        }`}>
                                        {msg.role === 'user' ? 'YOU' : msg.role === 'system' ? 'SYSTEM ALERT' : 'ARGUS'}:
                                    </span>
                                    <span className={`${msg.role === 'user' ? 'text-[#871A11]' :
                                        msg.role === 'system' ? 'text-[#facc15]' :
                                            'text-[#D5D1D1]'
                                        } whitespace-pre-wrap`}>
                                        {msg.content}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                        {isLoading && (
                            <motion.div key="loading-indicator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col mb-4">
                                <div className="font-mono text-sm md:text-base leading-relaxed">
                                    <span className="uppercase font-bold tracking-wider mr-3 text-[#D5D1D1]">ARGUS:</span>
                                    <span className="animate-pulse text-[#D5D1D1] font-bold">&gt;</span>
                                </div>
                            </motion.div>
                        )}
                        <div ref={messagesEndRef} />
                    </AnimatePresence>
                </div>
            </div>

            {/* 3. INPUT COMMAND CENTER (Fixed Bottom, Z-Index 40) */}
            <div className="absolute bottom-0 left-0 w-full z-40 bg-black p-6 pb-8">
                <div className="max-w-4xl mx-auto w-full">
                    {/* Controls Row */}
                    <div className="flex justify-between items-end mb-3">
                        {/* MODEL */}
                        <div className="relative">
                            <button
                                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                className="flex items-center gap-2 text-neutral-500 hover:text-[#D5D1D1] text-xs font-bold font-mono uppercase tracking-wider transition-colors"
                            >
                                <Bot size={14} />
                                {models.find(m => m.id === selectedModel)?.name}
                                <ChevronDown size={12} className={`transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isModelDropdownOpen && (
                                <div className="absolute bottom-full left-0 mb-2 w-48 bg-neutral-900 border border-neutral-800 rounded shadow-xl overflow-hidden z-50">
                                    {models.map((model) => (
                                        <button
                                            key={model.id}
                                            onClick={() => {
                                                setSelectedModel(model.id);
                                                setIsModelDropdownOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-3 text-xs font-bold font-mono uppercase tracking-wider hover:bg-neutral-800 transition-colors ${selectedModel === model.id ? "text-[#871A11]" : "text-neutral-500"
                                                }`}
                                        >
                                            {model.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* MODE */}
                        <div className="flex gap-4">
                            <button
                                onClick={() => setThinkingMode("fast")}
                                className={`text-xs font-bold font-mono uppercase tracking-wider transition-colors ${thinkingMode === "fast" ? "text-[#D5D1D1]" : "text-neutral-600 hover:text-neutral-400"
                                    }`}
                            >
                                Fast
                            </button>
                            <button
                                onClick={() => setThinkingMode("research")}
                                className={`text-xs font-bold font-mono uppercase tracking-wider transition-colors ${thinkingMode === "research" ? "text-[#871A11]" : "text-neutral-600 hover:text-neutral-400"
                                    }`}
                            >
                                Research
                            </button>
                        </div>
                    </div>

                    {/* Input Field */}
                    <form onSubmit={handleSubmit} className="relative w-full shadow-[0_0_20px_rgba(135,26,17,0.15)]">
                        <input
                            className="block w-full bg-black border-2 border-neutral-800 focus:border-[#D5D1D1] text-[#D5D1D1] 
                                        font-mono text-lg px-6 py-4 rounded-sm
                                        placeholder-neutral-700 outline-none
                                        transition-all duration-300"
                            placeholder=""
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                setIsTyping(e.target.value.length > 0);
                            }}
                            // disabled={isLoading}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#871A11] hover:text-white transition-colors disabled:opacity-50"
                        >
                            <ArrowRight size={24} strokeWidth={2} />
                        </button>
                    </form>
                </div>
            </div>

        </div >
    );
}
