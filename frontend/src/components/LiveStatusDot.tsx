// src/components/LiveStatusDot.tsx
// Sprint 6C: tiny connection indicator for the Live Activity panel.
import React from 'react';

interface LiveStatusDotProps {
  connected: boolean;
}

export const LiveStatusDot: React.FC<LiveStatusDotProps> = ({ connected }) => {
  return (
    <span
      className={`flex items-center gap-1.5 text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full ${
        connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/60 text-slate-400'
      }`}
      title={connected ? 'Realtime updates connected' : 'Realtime updates offline'}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
        }`}
      />
      {connected ? 'LIVE' : 'OFFLINE'}
    </span>
  );
};

export default LiveStatusDot;
