"use client";

import React, { useMemo } from "react";

interface HeatmapGridProps {
  isActive: boolean;
}

export const HeatmapGrid: React.FC<HeatmapGridProps> = ({ isActive }) => {
  const COLS = 100;
  const ROWS = 30;
  const TOTAL_CELLS = COLS * ROWS;

  const cellData = useMemo(() => {
    return Array.from({ length: TOTAL_CELLS }).map(() => ({
      offset: Math.random(),
      speed: 0.5 + Math.random(),
      // FX Logic:
      // 20% chance of being "Hazy" (Blurry)
      blur: Math.random() > 0.8 ? 2 + Math.random() * 4 : 0,
      // 10% chance of strong "Glow" (Light bleed)
      glow: Math.random() > 0.9,
    }));
  }, []);

  const styles = `
    @keyframes pulse-1 { 0%,100% { opacity: 0.2; } 50% { opacity: 0.8; } }
    @keyframes pulse-2 { 0%,100% { opacity: 0.1; } 50% { opacity: 0.6; } }
    @keyframes pulse-3 { 0%,100% { opacity: 0.3; } 50% { opacity: 0.9; } }
  `;

  return (
    <>
      <style>{styles}</style>
      <div className="relative w-screen h-[350px] bg-[#020205] overflow-hidden flex items-center justify-center">

        {/* Soft Vignette */}
        <div className="absolute inset-0 z-10 pointer-events-none bg-[radial-gradient(circle,transparent_25%,#000000_90%)]" />

        {/* The Grid Matrix */}
        <div
          className="grid gap-[1px] bg-black p-1 shrink-0"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 12px)`,
            gridTemplateRows: `repeat(${ROWS}, 12px)`,
          }}
        >
          {cellData.map((data, i) => (
            <HeatCell key={i} index={i} cols={COLS} rows={ROWS} isActive={isActive} data={data} />
          ))}
        </div>
      </div>
    </>
  );
};

const HeatCell = ({ index, cols, rows, isActive, data }: { index: number, cols: number, rows: number, isActive: boolean, data: any }) => {

  // Geometry
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = col / (cols - 1);
  const y = row / (rows - 1);

  // Shape: "Wide Bar" Core with soft organic falloff
  const distX = Math.abs(x - 0.5) * 0.9;
  const distY = Math.abs(y - 0.5) * 2.2;
  const distFromCenter = Math.sqrt(distX * distX + distY * distY);

  // High-fidelity falloff: fades to black at edges more aggressively
  const edgeClarity = Math.cos((x - 0.5) * Math.PI) * Math.cos((y - 0.5) * Math.PI);
  const baseHeat = Math.max(0, (1.0 - distFromCenter * 1.6) * edgeClarity);

  // Palette (Proprietary Brand Colors) - Darker and moodier shifts
  let bg = "#02040a"
  if (baseHeat > 0.92) bg = "#ffffff";      // Tiny occasional highlights
  else if (baseHeat > 0.8) bg = "#facc15";   // Small glow spots
  else if (baseHeat > 0.6) bg = "#ea580c";   // Heat transitions
  else if (baseHeat > 0.3) bg = "#871A11";   // Primary Brand Red (moody)
  else if (baseHeat > 0.05) bg = "#0A0A36";  // Deep structural blue
  else bg = "transparent";                   // Dead edges for organic look

  const animType = Math.floor(data.offset * 3) + 1;
  const duration = 3000 + (data.speed * 6000);
  const delay = data.offset * -10000;

  // Apply FX
  const filter = data.blur > 0 ? `blur(${data.blur}px)` : 'none';
  const boxShadow = data.glow ? `0 0 8px ${bg}` : 'none';
  const zIndex = data.glow ? 5 : 1; // Bring glowing cells above neighbors

  return (
    <div
      style={{
        backgroundColor: bg,
        animation: `pulse-${animType} ${duration}ms infinite ${delay}ms ease-in-out`,
        opacity: 0.3 + (baseHeat * 0.7),
        filter,
        boxShadow,
        zIndex,
      }}
      className="rounded-[1px] relative" // relative for z-index
    />
  );
};
