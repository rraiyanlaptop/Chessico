
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Chess, Move } from 'chess.js';
import { Board } from './components/Board';
import { AnalysisPanel } from './components/AnalysisPanel';
import { GameMode, Difficulty, AnalysisResult, HintResult, ReviewData, MoveEvaluation } from './types';
import { GeminiChessService } from './services/geminiService';

const gemini = new GeminiChessService();

const SOUND_URLS = {
  'move-self': 'https://lichess1.org/assets/sound/standard/Move.ogg',
  'move-opponent': 'https://lichess1.org/assets/sound/standard/Move.ogg',
  'capture': 'https://lichess1.org/assets/sound/standard/Capture.ogg',
  'check': 'https://lichess1.org/assets/sound/standard/Check.ogg',
  'gameover': 'https://lichess1.org/assets/sound/standard/Victory.ogg',
  'castle': 'https://lichess1.org/assets/sound/standard/Castle.ogg',
  'promote': 'https://lichess1.org/assets/sound/standard/Promote.ogg',
  'start': 'https://lichess1.org/assets/sound/standard/GenericNotify.ogg',
  'illegal': 'https://lichess1.org/assets/sound/standard/GenericNotify.ogg'
};

const CATEGORY_COLORS: Record<string, string> = {
  'Brilliant': 'text-cyan-400',
  'Great': 'text-blue-400',
  'Best': 'text-green-400',
  'Good': 'text-emerald-400',
  'Book': 'text-amber-600',
  'Inaccuracy': 'text-yellow-400',
  'Mistake': 'text-orange-400',
  'Blunder': 'text-red-500'
};

const App: React.FC = () => {
  const [moveStack, setMoveStack] = useState<(string | { from: string; to: string; promotion?: string })[]>([]);
  const [viewIndex, setViewIndex] = useState(-1);
  const [mode, setMode] = useState<GameMode>(GameMode.AI);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [isThinking, setIsThinking] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [muted, setMuted] = useState(false);
  const [evalScore, setEvalScore] = useState(50);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [manualResult, setManualResult] = useState<{ type: 'resign' | 'draw', winner?: 'w' | 'b' } | null>(null);
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null);
  const [autoFlip, setAutoFlip] = useState(false);
  
  const [confirmResign, setConfirmResign] = useState(false);
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [drawDeclineMessage, setDrawDeclineMessage] = useState<string | null>(null);

  const [hint, setHint] = useState<HintResult | null>(null);
  const [isThinkingHint, setIsThinkingHint] = useState(false);

  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [showReviewOverlay, setShowReviewOverlay] = useState(false);

  const historyEndRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const hasAutoSavedRef = useRef(false);

  const game = useMemo(() => {
    const g = new Chess();
    for (let i = 0; i <= viewIndex; i++) {
      if (moveStack[i]) g.move(moveStack[i]);
    }
    return g;
  }, [moveStack, viewIndex]);

  const fullGameHistorySAN = useMemo(() => {
    const g = new Chess();
    moveStack.forEach(m => g.move(m));
    return g.history();
  }, [moveStack]);

  const lastMove = useMemo(() => {
    const hist = game.history({ verbose: true });
    return hist.length > 0 ? { from: hist[hist.length - 1].from, to: hist[hist.length - 1].to } : null;
  }, [game]);

  const isGameOver = game.isGameOver() || manualResult !== null;

  // Fix: Implemented getGameResult to determine the final game outcome string.
  const getGameResult = () => {
    if (manualResult) {
      if (manualResult.type === 'resign') return manualResult.winner === 'w' ? 'White Wins' : 'Black Wins';
      return 'Draw';
    }
    if (game.isCheckmate()) return game.turn() === 'w' ? 'Black Wins' : 'White Wins';
    if (game.isDraw()) return 'Draw';
    return 'Game Over';
  };

  // Fix: Implemented getResultDescription to provide more context about the game end.
  const getResultDescription = () => {
    if (manualResult?.type === 'resign') return 'Result by resignation';
    if (manualResult?.type === 'draw') return 'Result by agreement';
    if (game.isCheckmate()) return 'Result by checkmate';
    if (game.isStalemate()) return 'Result by stalemate';
    if (game.isThreefoldRepetition()) return 'Result by threefold repetition';
    if (game.isInsufficientMaterial()) return 'Result by insufficient material';
    if (game.isDraw()) return 'Result by draw';
    return 'Game concluded';
  };

  // Fix: Implemented toggleOrientation to swap the board view.
  const toggleOrientation = useCallback(() => {
    setOrientation(prev => (prev === 'w' ? 'b' : 'w'));
  }, []);

  // Fix: Implemented requestAnalysis to trigger Gemini positional analysis.
  const requestAnalysis = useCallback(async () => {
    if (isGameOver || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const result = await gemini.analyzePosition(game.fen(), game.history());
      setAnalysis(result);
    } catch (e) {
      console.error("Analysis Error:", e);
    } finally {
      setIsAnalyzing(false);
    }
  }, [game, isGameOver, isAnalyzing]);

  useEffect(() => {
    if (isGameOver && moveStack.length > 0 && !hasAutoSavedRef.current) {
      const payload = {
        moveStack,
        difficulty,
        orientation,
        manualResult,
        mode,
        timestamp: Date.now(),
        isAutoSaved: true
      };
      localStorage.setItem('chessico_saved_game', JSON.stringify(payload));
      hasAutoSavedRef.current = true;
    }
    if (!isGameOver) {
      hasAutoSavedRef.current = false;
    }
  }, [isGameOver, moveStack, difficulty, orientation, manualResult, mode]);

  useEffect(() => {
    Object.entries(SOUND_URLS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.crossOrigin = 'anonymous';
      audioRefs.current[key] = audio;
    });
  }, []);

  const playSound = useCallback((type: keyof typeof SOUND_URLS) => {
    if (muted) return;
    const audio = audioRefs.current[type];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  }, [muted]);

  const makeMove = useCallback((move: any) => {
    if (isGameOver) return false;
    const g = new Chess(game.fen());
    const turnBefore = g.turn();
    try {
      const result = g.move(move);
      if (result) {
        const newStack = moveStack.slice(0, viewIndex + 1);
        setMoveStack([...newStack, move]);
        setViewIndex(newStack.length);
        setAnalysis(null); 
        setHint(null);
        
        if (turnBefore === orientation) {
          setPremove(null);
        }

        setDrawDeclineMessage(null);
        
        // Auto-flip for local multiplayer
        if (mode === GameMode.LOCAL && autoFlip) {
          setOrientation(g.turn() === 'w' ? 'w' : 'b');
        }
        
        if (g.isGameOver()) {
          playSound('gameover');
        } else if (g.isCheck()) {
          playSound('check');
        } else if (result.captured) {
          playSound('capture');
        } else if (result.flags.includes('k') || result.flags.includes('q')) {
          playSound('castle');
        } else if (result.flags.includes('p')) {
          playSound('promote');
        } else {
          if (mode === GameMode.AI) {
            if (turnBefore === orientation) playSound('move-self');
            else playSound('move-opponent');
          } else {
            playSound('move-self');
          }
        }
        return true;
      } else {
        playSound('illegal');
        return false;
      }
    } catch (e) {
      playSound('illegal');
      return false;
    }
  }, [game, moveStack, viewIndex, mode, orientation, autoFlip, playSound, isGameOver]);

  const undoMove = useCallback(() => {
    if (moveStack.length === 0 || isThinking) return;
    setManualResult(null);
    setPremove(null);
    setHint(null);
    const undoCount = (mode === GameMode.AI && game.turn() === orientation) ? 2 : 1;
    const newStack = moveStack.slice(0, -undoCount);
    setMoveStack(newStack);
    setViewIndex(newStack.length - 1);
    playSound('move-self');
  }, [moveStack, mode, orientation, isThinking, game, playSound]);

  const handleAIMove = useCallback(async () => {
    if (isGameOver || isThinking || mode !== GameMode.AI || viewIndex !== moveStack.length - 1) return;
    setIsThinking(true);
    const moveSAN = await gemini.getAIMove(game.fen(), game.history(), difficulty);
    if (moveSAN) makeMove(moveSAN);
    setIsThinking(false);
  }, [game, difficulty, isThinking, makeMove, mode, viewIndex, moveStack.length, isGameOver]);

  useEffect(() => {
    if (mode === GameMode.AI && game.turn() !== orientation && !isGameOver && viewIndex === moveStack.length - 1) {
      const timer = setTimeout(handleAIMove, 600);
      return () => clearTimeout(timer);
    }
  }, [game, mode, orientation, handleAIMove, viewIndex, moveStack.length, isGameOver]);

  useEffect(() => {
    if (!isAnalyzing && !analysis) {
      const material = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      let score = 0;
      game.board().forEach(row => row.forEach(sq => {
        if (sq) score += (sq.color === 'w' ? 1 : -1) * material[sq.type];
      }));
      const clamped = Math.max(-10, Math.min(10, score));
      setEvalScore(50 + clamped * 5);
    }
  }, [game, isAnalyzing, analysis]);

  const requestHint = async () => {
    if (isThinkingHint || isThinking || isGameOver) return;
    setIsThinkingHint(true);
    const result = await gemini.getHint(game.fen(), game.history());
    if (result) {
      setHint(result);
      playSound('start');
    }
    setIsThinkingHint(false);
  };

  const startReview = async () => {
    if (fullGameHistorySAN.length === 0) return;
    setIsReviewing(true);
    const data = await gemini.getGameReview(fullGameHistorySAN);
    if (data) {
      setReviewData(data);
      setShowReviewOverlay(true);
    }
    setIsReviewing(false);
  };

  const saveGame = () => {
    const payload = { moveStack, difficulty, orientation, mode, timestamp: Date.now() };
    localStorage.setItem('chessico_saved_game', JSON.stringify(payload));
    alert('Game saved successfully!');
  };

  const loadGame = () => {
    const saved = localStorage.getItem('chessico_saved_game');
    if (saved) {
      try {
        const payload = JSON.parse(saved);
        setMoveStack(payload.moveStack);
        setDifficulty(payload.difficulty || Difficulty.MEDIUM);
        setOrientation(payload.orientation || 'w');
        setMode(payload.mode || GameMode.AI);
        setViewIndex(payload.moveStack.length - 1);
        playSound('start');
      } catch (e) { console.error(e); }
    }
  };

  const resetGame = () => {
    setMoveStack([]);
    setViewIndex(-1);
    setAnalysis(null);
    setHint(null);
    setReviewData(null);
    setEvalScore(50);
    setManualResult(null);
    setPremove(null);
    setShowReviewOverlay(false);
    hasAutoSavedRef.current = false;
    playSound('start');
  };

  return (
    <div className="min-h-screen bg-[#262421] text-[#bababa] selection:bg-[#81b64c]/30">
      {!hasInteracted && (
        <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center backdrop-blur-md">
          <div className="text-center space-y-6 max-w-sm px-6">
            <h1 className="text-4xl lg:text-5xl font-black text-white uppercase tracking-tighter">Chessico</h1>
            <p className="text-slate-400 text-sm font-serif italic">The Ultimate AI & Multiplayer Arena</p>
            <button 
              onClick={() => { setHasInteracted(true); playSound('start'); }}
              className="w-full py-4 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-xl font-black uppercase tracking-widest text-lg shadow-[0_10px_30px_rgba(129,182,76,0.4)] transition-all active:scale-95"
            >
              Enter Arena
            </button>
          </div>
        </div>
      )}

      {showReviewOverlay && reviewData && (
        <div className="fixed inset-0 z-[140] bg-black/90 backdrop-blur-lg flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="bg-[#21201d] max-w-2xl w-full rounded-2xl border border-white/10 p-8 shadow-2xl space-y-8 animate-in zoom-in-95">
             <div className="flex justify-between items-start">
               <div>
                 <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Analysis Review</h2>
                 <p className="text-slate-400 text-sm font-medium">Grandmaster Insight Report</p>
               </div>
               <button onClick={() => setShowReviewOverlay(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
             </div>
             <div className="grid grid-cols-2 gap-8 py-4 border-y border-white/5">
                <div className="text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">White Accuracy</span>
                  <div className="text-5xl font-black text-[#81b64c] tracking-tighter">{reviewData.accuracyWhite}%</div>
                </div>
                <div className="text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Black Accuracy</span>
                  <div className="text-5xl font-black text-slate-200 tracking-tighter">{reviewData.accuracyBlack}%</div>
                </div>
             </div>
             <p className="text-slate-300 italic text-sm leading-relaxed">"{reviewData.summary}"</p>
             <button onClick={() => setShowReviewOverlay(false)} className="w-full py-4 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-xl font-black uppercase tracking-widest text-sm shadow-xl transition-all">Explore Board</button>
          </div>
        </div>
      )}

      <main className="max-w-[1440px] mx-auto flex flex-col lg:grid lg:grid-cols-[60px_1fr_360px] xl:grid-cols-[80px_1fr_420px] gap-4 lg:gap-6 p-3 lg:p-6 h-screen overflow-hidden">
        
        <div className="hidden lg:flex flex-col h-[min(80vh,600px)] py-12 items-center">
          <div className="eval-bar-container border border-white/5 w-6 h-full shadow-lg">
            <div className="eval-bar-fill" style={{ height: `${evalScore}%`, bottom: 0, left: 0, right: 0 }} />
            <span className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-black ${evalScore > 50 ? 'top-2 text-black' : 'bottom-2 text-white'}`}>
              {Math.abs((evalScore - 50) / 5).toFixed(1)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center flex-1 lg:overflow-y-auto no-scrollbar">
          <div className="w-full max-w-[min(94vw,640px)] space-y-2">
            
            <div className="flex justify-between items-center px-3 py-1.5 bg-[#21201d] rounded-t border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-[#312e2b] flex items-center justify-center text-sm shadow-inner border border-white/5">
                  {mode === GameMode.AI ? '🤖' : (orientation === 'w' ? '👤' : '👥')}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white leading-none">
                    {mode === GameMode.AI ? 'Gemini AI' : (orientation === 'w' ? 'Player 2 (Black)' : 'Player 1 (White)')}
                  </span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest font-black">
                    {mode === GameMode.AI ? difficulty : 'Opponent'}
                  </span>
                </div>
              </div>
              <div className={`bg-[#1b1917] px-2 py-1 rounded text-xs font-mono font-bold text-white shadow-inner border border-white/5 ${game.turn() !== orientation && mode === GameMode.LOCAL ? 'ring-1 ring-[#81b64c]' : ''}`}>
                10:00
              </div>
            </div>

            <div className="board-wrapper relative aspect-square w-full">
              <Board 
                game={game} 
                onMove={makeMove} 
                lastMove={lastMove} 
                orientation={orientation}
                premove={premove}
                onPremove={setPremove}
                hint={hint}
                mode={mode}
              />
              
              {isGameOver && !showReviewOverlay && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-300 rounded overflow-hidden">
                  <div className="bg-[#262421] border border-white/10 p-6 lg:p-10 rounded shadow-2xl text-center max-w-[300px] w-full mx-4 transform animate-in zoom-in-95">
                    <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">{getGameResult()}</h2>
                    <p className="text-[#bababa] mb-6 text-xs font-serif italic">{getResultDescription()}</p>
                    <div className="space-y-3">
                      <button onClick={startReview} className="w-full py-4 bg-[#3b82f6] text-white rounded-lg font-black uppercase tracking-widest text-xs shadow-xl">🔍 Review Game</button>
                      <button onClick={resetGame} className="w-full py-3 bg-[#81b64c] text-white rounded-lg font-black uppercase tracking-widest text-xs shadow-xl">New Match</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center px-3 py-1.5 bg-[#21201d] rounded-b border-t border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-[#312e2b] flex items-center justify-center text-sm shadow-inner border border-white/5">👤</div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white leading-none">
                    {mode === GameMode.AI ? 'Guest Player' : (orientation === 'w' ? 'Player 1 (White)' : 'Player 2 (Black)')}
                  </span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Rating: 1200?</span>
                </div>
              </div>
              <div className={`bg-[#1b1917] px-2 py-1 rounded text-xs font-mono font-bold text-white shadow-inner border border-white/5 ${game.turn() === orientation ? 'ring-1 ring-[#81b64c]' : ''}`}>
                10:00
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col h-full bg-[#21201d] rounded shadow-2xl border border-white/5 mt-2 lg:mt-0 overflow-hidden">
          <div className="flex bg-[#262421] border-b border-white/5">
            <button className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-white border-b-2 border-[#81b64c] bg-[#312e2b]">Match Settings</button>
            <button onClick={requestAnalysis} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Analysis</button>
          </div>

          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden">
            {/* Render AnalysisPanel if there is active analysis or if thinking/loading. */}
            {(analysis || isAnalyzing) && (
              <AnalysisPanel analysis={analysis} isLoading={isAnalyzing} />
            )}

            <div className="space-y-3 bg-[#262421] p-4 rounded-xl border border-white/5 shadow-lg">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Play Mode</span>
              <div className="flex p-1 bg-[#1b1917] rounded-lg border border-white/5">
                <button 
                  onClick={() => setMode(GameMode.AI)} 
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all ${mode === GameMode.AI ? 'bg-[#312e2b] text-white shadow-md' : 'text-slate-500'}`}
                >
                  Vs AI
                </button>
                <button 
                  onClick={() => setMode(GameMode.LOCAL)} 
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-md transition-all ${mode === GameMode.LOCAL ? 'bg-[#312e2b] text-white shadow-md' : 'text-slate-500'}`}
                >
                  Vs Human
                </button>
              </div>

              {mode === GameMode.AI ? (
                <select 
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full bg-[#312e2b] border-none rounded-lg p-2.5 text-[11px] font-bold outline-none focus:ring-1 focus:ring-[#81b64c] text-white"
                >
                  {Object.values(Difficulty).map(d => <option key={d} value={d}>{d} Difficulty</option>)}
                </select>
              ) : (
                <div className="flex items-center justify-between px-2 py-1 bg-[#1b1917] rounded-lg border border-white/5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Auto-flip board</span>
                  <button 
                    onClick={() => setAutoFlip(!autoFlip)} 
                    className={`w-10 h-5 rounded-full relative transition-colors ${autoFlip ? 'bg-[#81b64c]' : 'bg-slate-700'}`}
                  >
                    <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${autoFlip ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 bg-[#1b1917] rounded-lg p-2 overflow-y-auto custom-scroll border border-black/30 min-h-[120px]">
              <div className="grid grid-cols-[30px_1fr_1fr] gap-x-1 text-[12px] font-bold">
                {Array.from({ length: Math.ceil(fullGameHistorySAN.length / 2) }).map((_, i) => (
                  <React.Fragment key={i}>
                    <div className="bg-[#262421] text-slate-500 flex items-center justify-center text-[9px] font-black mb-1 rounded-sm">{i + 1}</div>
                    <div onClick={() => setViewIndex(i * 2)} className={`p-1.5 px-2 cursor-pointer rounded mb-1 flex items-center justify-between ${viewIndex === i * 2 ? 'bg-[#81b64c] text-white' : 'hover:bg-white/5 text-slate-200'}`}>
                      <span>{fullGameHistorySAN[i*2]}</span>
                      {reviewData?.evaluations.find(e => e.moveIndex === i*2) && <span className={`text-[8px] font-black ${CATEGORY_COLORS[reviewData.evaluations.find(e => e.moveIndex === i*2)!.category]}`}>•</span>}
                    </div>
                    {fullGameHistorySAN[i*2 + 1] && (
                      <div onClick={() => setViewIndex(i * 2 + 1)} className={`p-1.5 px-2 cursor-pointer rounded mb-1 flex items-center justify-between ${viewIndex === i * 2 + 1 ? 'bg-[#81b64c] text-white' : 'hover:bg-white/5 text-slate-200'}`}>
                        <span>{fullGameHistorySAN[i*2 + 1]}</span>
                        {reviewData?.evaluations.find(e => e.moveIndex === i*2 + 1) && <span className={`text-[8px] font-black ${CATEGORY_COLORS[reviewData.evaluations.find(e => e.moveIndex === i*2 + 1)!.category]}`}>•</span>}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="bg-[#262421] rounded-lg p-4 space-y-3 shadow-lg border border-white/5">
              <div className="flex justify-between items-center gap-2">
                 <button onClick={saveGame} title="Save" className="flex-1 py-2 bg-[#312e2b] rounded border border-white/5 text-sm">💾</button>
                 <button onClick={loadGame} title="Load" className="flex-1 py-2 bg-[#312e2b] rounded border border-white/5 text-sm">📂</button>
                 <button onClick={() => setMuted(!muted)} className="flex-1 py-2 bg-[#312e2b] rounded border border-white/5 text-sm">{muted ? '🔇' : '🔊'}</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={requestHint} disabled={isThinkingHint || isGameOver} className="py-2.5 bg-[#312e2b] text-white rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/5 disabled:opacity-30">💡 Hint</button>
                <button onClick={toggleOrientation} className="py-2.5 bg-[#312e2b] text-white rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/5">🔄 Flip</button>
              </div>
              <button onClick={resetGame} className="w-full py-2.5 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-lg font-black uppercase tracking-widest text-[10px] shadow-xl transition-all">Reset Arena</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
