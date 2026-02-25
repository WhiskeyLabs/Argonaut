'use client';

import { useEffect, useRef } from 'react';

interface HypnoticGridProps {
    isActive: boolean; // True when thinking/generating
    className?: string;
}

export function HypnoticGrid({ isActive, className = '' }: HypnoticGridProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let time = 0;

        // Configuration
        const cellSize = 30; // Larger cells for better visibility
        const gap = 2; // Gap between cells

        // DEBUG PALETTE: Green/Magenta
        const getCellColor = (value: number) => {
            const normalized = (value + 1) / 2;

            if (normalized < 0.2) {
                // Return a visible dark color, not black
                return `rgb(20, 0, 40)`; // Dark Indigo
            } else if (normalized < 0.6) {
                // Green / Teal
                const t = (normalized - 0.2) / 0.4;
                const g = Math.floor(100 + t * 155);
                return `rgb(0, ${g}, 150)`;
            } else {
                // Magenta / White
                const t = (normalized - 0.6) / 0.4;
                const r = Math.floor(150 + t * 105);
                const g = Math.floor(t * 255);
                const b = 255;
                return `rgb(${r}, ${g}, ${b})`;
            }
        };

        const render = () => {
            // Safety check
            if (!canvas || !container) return;

            const width = canvas.width;
            const height = canvas.height;

            // If dimensions are lost, try to recover
            if (width === 0 || height === 0) {
                const rect = container.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    canvas.width = rect.width;
                    canvas.height = rect.height;
                }
                animationFrameId = requestAnimationFrame(render);
                return;
            }

            const cols = Math.ceil(width / (cellSize + gap));
            const rows = Math.ceil(height / (cellSize + gap));

            // VISIBILITY CHECK: Use Deep Purple instead of Black
            // If the user sees PURPLE, the canvas is rendering.
            ctx.fillStyle = '#1a0b2e';
            ctx.fillRect(0, 0, width, height);

            // Speed multiplier
            const speed = isActive ? 0.2 : 0.08;
            time += speed;

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const dx = x * 0.15;
                    const dy = y * 0.15;

                    // Wave functions
                    const v1 = Math.sin(dx + time) * Math.cos(dy + time * 0.5);
                    const v2 = Math.sin(dx * 1.5 - time * 0.7) * Math.cos(dy * 0.8 + time * 0.3);
                    const v3 = Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.8 - time * 1.2);

                    const value = (v1 + v2 + v3) / 2.5;

                    ctx.fillStyle = getCellColor(value);
                    ctx.fillRect(
                        x * (cellSize + gap),
                        y * (cellSize + gap),
                        cellSize,
                        cellSize
                    );
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };

        // Use ResizeObserver to handle container resizing (CSS transitions)
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    canvas.width = width;
                    canvas.height = height;
                }
            }
        });

        resizeObserver.observe(container);

        // Explicitly set initial size
        const rect = container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        // Also call render immediately to ensure frame 1
        render();

        return () => {
            resizeObserver.disconnect();
            cancelAnimationFrame(animationFrameId);
        };
    }, [isActive]);

    return (
        <div ref={containerRef} className={`w-full h-full ${className}`}>
            <canvas
                ref={canvasRef}
                className="w-full h-full block"
            />
        </div>
    );
}
