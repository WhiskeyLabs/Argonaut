'use client';

import React from 'react';

/**
 * PulsatingArtifact
 * A central visual element representing "Argus AI".
 * Uses CSS keyframes to create a breathing, 3D-like glow effect.
 */
export function PulsatingArtifact() {
  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {/* Outer Glow Ring (Breathing) */}
      <div className="absolute inset-0 rounded-full bg-primary-500/20 blur-3xl animate-pulse-slow"></div>

      {/* Rotating Ring 1 */}
      <div className="absolute w-48 h-48 border-2 border-primary-500/30 rounded-full animate-spin-slow"></div>

      {/* Rotating Ring 2 (Counter-rotate) */}
      <div className="absolute w-40 h-40 border border-white/20 rounded-full animate-reverse-spin"></div>

      {/* Core Orb */}
      <div className="relative z-10 w-24 h-24 rounded-full bg-gradient-to-br from-gray-900 to-black border border-white/10 shadow-[0_0_30px_rgba(var(--primary-rgb),0.5)] flex items-center justify-center overflow-hidden">
        {/* Inner Glint */}
        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/10 to-transparent"></div>

        {/* Core Jewel */}
        <div className="w-8 h-8 rounded-full bg-primary-500 blur-md animate-pulse"></div>
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes reverse-spin {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
        .animate-reverse-spin {
          animation: reverse-spin 8s linear infinite;
        }
        .animate-pulse-slow {
          animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}
