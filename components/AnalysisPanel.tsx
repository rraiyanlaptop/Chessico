
import React from 'react';
import { AnalysisResult } from '../types';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  isLoading: boolean;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis, isLoading }) => {
  if (isLoading) {
    return (
      <div className="p-4 bg-[#262421] rounded border border-white/5 animate-pulse space-y-2">
        <div className="h-3 bg-white/5 rounded w-1/3"></div>
        <div className="h-10 bg-white/5 rounded"></div>
        <div className="h-3 bg-white/5 rounded w-1/2"></div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="p-4 bg-[#262421] rounded border border-white/5 shadow-inner space-y-3 animate-slide-in">
      <div className="flex justify-between items-center border-b border-white/5 pb-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-[#81b64c]">Coach Analysis</h3>
        <span className="text-xs font-mono font-bold text-white bg-black/20 px-2 rounded">
          {analysis.evaluation}
        </span>
      </div>

      <div>
        <p className="text-[11px] text-slate-400 leading-relaxed italic">
          "{analysis.explanation}"
        </p>
      </div>

      <div className="flex gap-2 items-center pt-1">
        <span className="text-[10px] font-black text-slate-500 uppercase">Best:</span>
        <span className="text-xs font-mono font-bold text-[#81b64c]">{analysis.bestMove}</span>
      </div>
    </div>
  );
};
