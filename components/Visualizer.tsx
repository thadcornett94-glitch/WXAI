
import React, { useEffect, useState } from 'react';

export const Visualizer: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  const [bars, setBars] = useState<number[]>(new Array(40).fill(2));

  useEffect(() => {
    if (!isPlaying) {
      setBars(new Array(40).fill(2));
      return;
    }

    const interval = setInterval(() => {
      setBars(prev => prev.map(() => Math.floor(Math.random() * 24) + 4));
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className="flex items-end justify-center gap-1 h-32 w-full overflow-hidden bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
      {bars.map((height, i) => (
        <div
          key={i}
          className="w-1 transition-all duration-100 ease-in-out"
          style={{ 
            height: `${height * 4}%`, 
            opacity: isPlaying ? 1 : 0.3,
            backgroundColor: isPlaying 
              ? (i % 2 === 0 ? '#6366f1' : '#22d3ee') // Indigo-500 and Cyan-400
              : '#475569' // Slate-600
          }}
        />
      ))}
    </div>
  );
};
