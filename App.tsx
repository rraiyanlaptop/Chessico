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

  // Auto-save logic
  useEffect(() => {
    if (isGameOver && moveStack.length > 0 && !hasAutoSavedRef.current) {
      const payload = {
        moveStack,
        difficulty,
        orientation,
        manualResult,
        timestamp: Date.now(),
        isAutoSaved: true
      };
      localStorage.setItem('chessico_saved_game', JSON.stringify(payload));
      hasAutoSavedRef.current = true;
      console.log("Game automatically saved at conclusion.");
    }
    if (!isGameOver) {
      hasAutoSavedRef.current = false;
    }
  }, [isGameOver, moveStack, difficulty, orientation, manualResult]);

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
  }, [game, moveStack, viewIndex, mode, orientation, playSound, isGameOver]);

  const undoMove = useCallback(() => {
    if (moveStack.length === 0 || isThinking) return;
    setManualResult(null);
    setPremove(null);
    setHint(null);
    setConfirmResign(false);
    setConfirmDraw(false);
    const isAiTurn = game.turn() !== orientation;
    const undoCount = (mode === GameMode.AI && !isAiTurn) ? 2 : 1;
    
    const newStack = moveStack.slice(0, -undoCount);
    setMoveStack(newStack);
    setViewIndex(newStack.length - 1);
    setAnalysis(null);
    playSound('move-self');
  }, [moveStack, mode, orientation, isThinking, game, playSound]);

  useEffect(() => {
    const isLatestPosition = viewIndex === moveStack.length - 1;
    if (premove && game.turn() === orientation && !isGameOver && isLatestPosition) {
      const timer = setTimeout(() => {
        const success = makeMove(premove);
        if (!success) {
          setPremove(null);
          playSound('illegal');
        }
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [game.turn(), premove, orientation, isGameOver, viewIndex, moveStack.length, makeMove, playSound]);

  const handleAIMove = useCallback(async () => {
    if (isGameOver || isThinking || mode !== GameMode.AI || viewIndex !== moveStack.length - 1) return;
    setIsThinking(true);
    const currentHistory = game.history();
    const moveSAN = await gemini.getAIMove(game.fen(), currentHistory, difficulty);
    if (moveSAN) makeMove(moveSAN);
    setIsThinking(false);
  }, [game, difficulty, isThinking, makeMove, mode, viewIndex, moveStack.length, isGameOver]);

  useEffect(() => {
    if (mode === GameMode.AI && game.turn() === (orientation === 'w' ? 'b' : 'w') && !isGameOver && viewIndex === moveStack.length - 1) {
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

  const requestAnalysis = async () => {
    setIsAnalyzing(true);
    const result = await gemini.analyzePosition(game.fen(), game.history());
    setAnalysis(result);
    const val = parseFloat(result.evaluation.replace(/[^\d.-]/g, ''));
    if (!isNaN(val)) setEvalScore(50 + (val * 5));
    setIsAnalyzing(false);
  };

  const requestHint = async () => {
    if (isThinkingHint || isThinking || isGameOver || game.turn() !== orientation) return;
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
    const payload = {
      moveStack,
      difficulty,
      orientation,
      manualResult,
      timestamp: Date.now()
    };
    localStorage.setItem('chessico_saved_game', JSON.stringify(payload));
    alert('Game saved successfully!');
  };

  const loadGame = () => {
    const saved = localStorage.getItem('chessico_saved_game');
    if (saved) {
      try {
        const payload = JSON.parse(saved);
        setMoveStack(payload.moveStack);
        setDifficulty(payload.difficulty);
        setOrientation(payload.orientation);
        setManualResult(payload.manualResult);
        setViewIndex(payload.moveStack.length - 1);
        playSound('start');
      } catch (e) {
        console.error('Failed to load game', e);
      }
    } else {
      alert('No saved game found.');
    }
  };

  const downloadPGN = () => {
    const g = new Chess();
    moveStack.forEach(m => g.move(m));
    const pgn = g.pgn();
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chessico_game_${Date.now()}.pgn`;
    a.click();
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
    setConfirmResign(false);
    setConfirmDraw(false);
    setDrawDeclineMessage(null);
    setShowReviewOverlay(false);
    hasAutoSavedRef.current = false;
    playSound('start');
  };

  const handleResign = () => {
    if (!confirmResign) {
      setConfirmResign(true);
      setConfirmDraw(false);
      setTimeout(() => setConfirmResign(false), 3000);
      return;
    }
    setManualResult({ type: 'resign', winner: game.turn() === 'w' ? 'b' : 'w' });
    playSound('gameover');
  };

  const handleDrawOffer = async () => {
    if (!confirmDraw) {
      setConfirmDraw(true);
      setConfirmResign(false);
      setTimeout(() => setConfirmDraw(false), 3000);
      return;
    }
    
    setConfirmDraw(false);
    
    if (mode === GameMode.AI) {
      setIsThinking(true);
      const currentEval = (evalScore - 50) / 5;
      await new Promise(r => setTimeout(r, 1000));
      
      if (Math.abs(currentEval) < 0.6) {
        setManualResult({ type: 'draw' });
        playSound('gameover');
      } else {
        setDrawDeclineMessage("AI declined draw offer");
        setTimeout(() => setDrawDeclineMessage(null), 3000);
        playSound('illegal');
      }
      setIsThinking(false);
    } else {
      setManualResult({ type: 'draw' });
      playSound('gameover');
    }
  };

  const toggleOrientation = () => {
    setOrientation(prev => prev === 'w' ? 'b' : 'w');
    playSound('start');
  };

  const getGameResult = () => {
    if (manualResult) {
      if (manualResult.type === 'resign') return "Resignation";
      if (manualResult.type === 'draw') return "Draw";
    }
    if (game.isCheckmate()) return "Checkmate";
    if (game.isStalemate()) return "Stalemate";
    if (game.isDraw()) return "Draw";
    return "Game Over";
  };

  const getResultDescription = () => {
    if (manualResult) {
      if (manualResult.type === 'resign') {
        return `${manualResult.winner === 'w' ? 'White' : 'Black'} wins by resignation.`;
      }
      return "Game ended by mutual agreement.";
    }
    if (game.isCheckmate()) {
      return `${game.turn() === 'w' ? 'Black' : 'White'} wins by checkmate.`;
    }
    if (game.isStalemate()) return "Game drawn by stalemate.";
    if (game.isThreefoldRepetition()) return "Draw by threefold repetition.";
    if (game.isInsufficientMaterial()) return "Draw by insufficient material.";
    return "The game ended in a draw.";
  };

  const currentMoveReview = useMemo(() => {
    if (!reviewData) return null;
    return reviewData.evaluations.find(e => e.moveIndex === viewIndex);
  }, [reviewData, viewIndex]);

  return (
    <div className="min-h-screen bg-[#262421] text-[#bababa] selection:bg-[#81b64c]/30">
      {!hasInteracted && (
        <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center backdrop-blur-md">
          <div className="text-center space-y-6 max-w-sm px-6">
            <h1 className="text-4xl lg:text-5xl font-black text-white uppercase tracking-tighter">Chessico</h1>
            <p className="text-slate-400 text-sm">Grandmaster level analysis and AI opponents at your fingertips.</p>
            <button 
              onClick={() => { setHasInteracted(true); playSound('start'); }}
              className="w-full py-4 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-xl font-black uppercase tracking-widest text-lg shadow-[0_10px_30px_rgba(129,182,76,0.4)] transition-all active:scale-95"
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {showReviewOverlay && reviewData && (
        <div className="fixed inset-0 z-[140] bg-black/90 backdrop-blur-lg flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="bg-[#21201d] max-w-2xl w-full rounded-2xl border border-white/10 p-8 shadow-2xl space-y-8 animate-in zoom-in-95">
             <div className="flex justify-between items-start">
               <div>
                 <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Game Review</h2>
                 <p className="text-slate-400 text-sm font-medium">AI Coaching Insights</p>
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

             <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Strategic Summary</span>
                <p className="text-slate-300 italic text-sm leading-relaxed">"{reviewData.summary}"</p>
             </div>

             <button 
               onClick={() => setShowReviewOverlay(false)} 
               className="w-full py-4 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-xl font-black uppercase tracking-widest text-sm shadow-xl transition-all"
             >
               Go to Game Board
             </button>
          </div>
        </div>
      )}

      <main className="max-w-[1440px] mx-auto flex flex-col lg:grid lg:grid-cols-[60px_1fr_360px] xl:grid-cols-[80px_1fr_420px] gap-4 lg:gap-6 p-3 lg:p-6 h-screen overflow-hidden">
        
        {/* Desktop Evaluation Bar */}
        <div className="hidden lg:flex flex-col h-[min(80vh,600px)] py-12 items-center">
          <div className="eval-bar-container border border-white/5 w-6 h-full shadow-lg">
            <div 
              className="eval-bar-fill shadow-[0_-2px_10px_rgba(255,255,255,0.3)]" 
              style={{ height: `${evalScore}%`, bottom: 0, left: 0, right: 0 }}
            />
            <span className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-black ${evalScore > 50 ? 'top-2 text-black' : 'bottom-2 text-white'}`}>
              {Math.abs((evalScore - 50) / 5).toFixed(1)}
            </span>
          </div>
        </div>

        {/* Board & Player Area */}
        <div className="flex flex-col items-center flex-1 lg:overflow-y-auto custom-scroll no-scrollbar">
          <div className="w-full max-w-[min(94vw,640px)] space-y-2">
            
            {/* Mobile Evaluation Bar */}
            <div className="lg:hidden eval-bar-container border border-white/5 w-full h-2 shadow-lg relative">
              <div 
                className="eval-bar-fill shadow-md" 
                style={{ width: `${evalScore}%`, height: '100%', left: 0, top: 0 }}
              />
            </div>

            {/* Opponent Info */}
            <div className="flex justify-between items-center px-3 py-1.5 bg-[#21201d] rounded-t border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-[#312e2b] flex items-center justify-center text-sm shadow-inner border border-white/5">🤖</div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white leading-none">Gemini AI</span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest font-black">{difficulty}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {premove && (
                  <span className="bg-[#f06262] text-white text-[9px] font-black px-1.5 py-0.5 rounded animate-pulse tracking-widest uppercase">PREMOVE</span>
                )}
                <div className="bg-[#1b1917] px-2 py-1 rounded text-xs font-mono font-bold text-white shadow-inner border border-white/5">10:00</div>
              </div>
            </div>

            {/* Board Container */}
            <div className="board-wrapper relative aspect-square w-full">
              <Board 
                game={game} 
                onMove={makeMove} 
                lastMove={lastMove} 
                orientation={orientation}
                premove={premove}
                onPremove={setPremove}
                hint={hint}
              />
              
              {isGameOver && !showReviewOverlay && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-300 rounded overflow-hidden">
                  <div className="bg-[#262421] border border-white/10 p-6 lg:p-10 rounded shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-center max-w-[300px] lg:max-w-[340px] w-full mx-4 transform animate-in zoom-in-95">
                    <h2 className="text-3xl lg:text-4xl font-black text-white mb-2 uppercase tracking-tighter leading-none">{getGameResult()}</h2>
                    <p className="text-[#bababa] mb-6 lg:mb-8 text-xs lg:text-sm font-medium italic">
                      {getResultDescription()}
                    </p>
                    <div className="space-y-3">
                      <button 
                        onClick={startReview} 
                        disabled={isReviewing}
                        className="w-full py-4 bg-[#3b82f6] hover:bg-[#60a5fa] text-white rounded-lg font-black uppercase tracking-widest text-xs shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        {isReviewing ? 'Analyzing...' : '🔍 Review Game'}
                      </button>
                      <button onClick={resetGame} className="w-full py-3 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-lg font-black uppercase tracking-widest text-xs shadow-xl transition-all active:scale-95">New Match</button>
                      <button onClick={requestAnalysis} className="w-full py-2 bg-[#312e2b] text-[9px] font-black uppercase tracking-[0.2em] rounded-lg hover:bg-[#3d3a37] transition-colors border border-white/5">Depth Engine</button>
                    </div>
                  </div>
                </div>
              )}

              {drawDeclineMessage && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[105] bg-red-500 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-2xl animate-in slide-in-from-top-4 duration-300">
                  {drawDeclineMessage}
                </div>
              )}
            </div>

            {/* Player Info */}
            <div className="flex justify-between items-center px-3 py-1.5 bg-[#21201d] rounded-b border-t border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-[#312e2b] flex items-center justify-center text-sm shadow-inner border border-white/5">👤</div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white leading-none">Guest Player</span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Rating: 1200?</span>
                </div>
              </div>
              <div className={`bg-[#1b1917] px-2 py-1 rounded text-xs font-mono font-bold text-white shadow-inner border border-white/5 ${game.turn() === orientation ? 'ring-1 ring-[#81b64c]' : ''}`}>
                10:00
              </div>
            </div>

            {/* Mobile Quick Controls */}
            <div className="lg:hidden flex gap-2 pt-2">
               <button onClick={toggleOrientation} className="flex-1 py-2.5 bg-[#312e2b] rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-white/5">🔄 Flip</button>
               <button onClick={requestHint} disabled={isThinkingHint || isThinking || game.turn() !== orientation} className="flex-1 py-2.5 bg-[#312e2b] rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-white/5 disabled:opacity-30">💡 Hint</button>
               <button onClick={undoMove} disabled={moveStack.length === 0} className="flex-1 py-2.5 bg-[#312e2b] rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-white/5 disabled:opacity-30">⬅️ Undo</button>
            </div>
          </div>
        </div>

        {/* Sidebar Panel */}
        <div className="flex flex-col h-full bg-[#21201d] rounded shadow-2xl border border-white/5 mt-2 lg:mt-0 overflow-hidden">
          <div className="flex bg-[#262421] border-b border-white/5">
            <button className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-white border-b-2 border-[#81b64c] bg-[#312e2b]">Game</button>
            <button onClick={requestAnalysis} className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Analysis</button>
          </div>

          <div className="flex-1 flex flex-col p-3 space-y-3 overflow-hidden">
            <div className="flex-1 bg-[#1b1917] rounded-lg p-1 overflow-y-auto custom-scroll border border-black/30 min-h-[120px]">
              <div className="grid grid-cols-[30px_1fr_1fr] gap-x-1 text-[12px] font-bold">
                {Array.from({ length: Math.ceil(fullGameHistorySAN.length / 2) }).map((_, i) => (
                  <React.Fragment key={i}>
                    <div className="bg-[#262421] text-slate-500 flex items-center justify-center text-[9px] font-black mb-1 rounded-sm">{i + 1}</div>
                    <div onClick={() => setViewIndex(i * 2)} className={`p-1.5 px-2 cursor-pointer rounded mb-1 transition-colors flex items-center justify-between ${viewIndex === i * 2 ? 'bg-[#81b64c] text-white' : 'hover:bg-white/5 text-slate-200'}`}>
                      <span>{fullGameHistorySAN[i*2]}</span>
                      {reviewData && reviewData.evaluations.find(e => e.moveIndex === i*2) && (
                        <span className={`text-[8px] font-black ${CATEGORY_COLORS[reviewData.evaluations.find(e => e.moveIndex === i*2)!.category]}`}>•</span>
                      )}
                    </div>
                    {fullGameHistorySAN[i*2 + 1] && (
                      <div onClick={() => setViewIndex(i * 2 + 1)} className={`p-1.5 px-2 cursor-pointer rounded mb-1 transition-colors flex items-center justify-between ${viewIndex === i * 2 + 1 ? 'bg-[#81b64c] text-white' : 'hover:bg-white/5 text-slate-200'}`}>
                        <span>{fullGameHistorySAN[i*2 + 1]}</span>
                        {reviewData && reviewData.evaluations.find(e => e.moveIndex === i*2 + 1) && (
                          <span className={`text-[8px] font-black ${CATEGORY_COLORS[reviewData.evaluations.find(e => e.moveIndex === i*2 + 1)!.category]}`}>•</span>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
                {fullGameHistorySAN.length === 0 && <div className="col-span-3 text-center py-8 text-slate-700 text-[10px] font-black uppercase tracking-widest opacity-20">No moves yet</div>}
                <div ref={historyEndRef} />
              </div>
            </div>

            {currentMoveReview && (
              <div className="bg-[#1e293b] border-l-4 border-white/20 p-3 rounded-r-lg animate-slide-in">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-black uppercase ${CATEGORY_COLORS[currentMoveReview.category]}`}>{currentMoveReview.category}</span>
                  <span className="text-xs font-mono font-bold text-white">{currentMoveReview.san}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-tight italic">
                  "{currentMoveReview.comment}"
                </p>
              </div>
            )}

            {hint && (
              <div className="bg-[#1e293b] border-l-4 border-[#3b82f6] p-3 rounded-r-lg animate-slide-in">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase text-[#3b82f6]">Coach Hint</span>
                  <span className="text-xs font-mono font-bold text-white">{hint.san}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-tight italic">
                  "{hint.explanation}"
                </p>
              </div>
            )}

            {analysis && <AnalysisPanel analysis={analysis} isLoading={isAnalyzing} />}

            <div className="bg-[#262421] rounded-lg p-3 lg:p-4 space-y-3 shadow-lg border border-white/5">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Actions</span>
                <div className="flex items-center gap-2">
                   <button onClick={saveGame} title="Save Game" className="text-slate-500 hover:text-white transition-colors p-1 bg-[#312e2b] rounded border border-white/5 text-[10px]">💾</button>
                   <button onClick={loadGame} title="Load Game" className="text-slate-500 hover:text-white transition-colors p-1 bg-[#312e2b] rounded border border-white/5 text-[10px]">📂</button>
                   <button onClick={downloadPGN} title="Download PGN" className="text-slate-500 hover:text-white transition-colors p-1 bg-[#312e2b] rounded border border-white/5 text-[10px]">📥</button>
                   <button onClick={() => setMuted(!muted)} className="text-slate-500 hover:text-white transition-colors p-1 bg-[#312e2b] rounded border border-white/5 text-[10px]">{muted ? '🔇' : '🔊'}</button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={requestHint}
                  disabled={isThinkingHint || isGameOver || game.turn() !== orientation}
                  className="py-2.5 bg-[#312e2b] hover:bg-[#3d3a37] text-white rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/5 disabled:opacity-30 transition-all flex items-center justify-center gap-2"
                >
                  {isThinkingHint ? '...' : '💡 Get Hint'}
                </button>
                <button onClick={toggleOrientation} className="py-2.5 bg-[#312e2b] hover:bg-[#3d3a37] text-white rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/5 transition-all">
                  🔄 Flip
                </button>
              </div>

              <select 
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="w-full bg-[#312e2b] border-none rounded-lg p-2 text-[11px] font-bold outline-none focus:ring-1 focus:ring-[#81b64c] shadow-inner text-white"
              >
                {Object.values(Difficulty).map(d => <option key={d} value={d}>{d} Mode</option>)}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={handleResign} 
                  disabled={isGameOver}
                  className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border active:scale-95 ${confirmResign ? 'bg-red-600 text-white border-red-400 animate-pulse' : 'bg-[#312e2b] text-[#ff4d4d] border-[#ff4d4d]/20 hover:bg-[#ff4d4d]/10'}`}
                >
                  {confirmResign ? 'Really?' : '🏳️ Resign'}
                </button>
                <button 
                  onClick={handleDrawOffer} 
                  disabled={isGameOver || isThinking}
                  className={`py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border active:scale-95 ${confirmDraw ? 'bg-[#bababa] text-black border-white animate-pulse' : 'bg-[#312e2b] text-[#bababa] border-[#bababa]/20 hover:bg-[#bababa]/10'}`}
                >
                  {confirmDraw ? 'Agree?' : '½ Draw'}
                </button>
              </div>

              <button onClick={resetGame} className="hidden lg:block w-full py-2.5 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-lg font-black uppercase tracking-widest text-[10px] shadow-xl transition-all active:scale-95">Reset Game</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;