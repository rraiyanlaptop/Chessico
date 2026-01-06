import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Chess, Move } from 'chess.js';
import { Board } from './components/Board';
import { AnalysisPanel } from './components/AnalysisPanel';
import { GameMode, Difficulty, AnalysisResult } from './types';
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

  const historyEndRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

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
        
        // CRITICAL FIX: Only clear premove if it was the player's turn when the move was made.
        // This ensures AI moves (which happen on 'turnBefore !== orientation') don't wipe out a set premove.
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

  // Execute premove as soon as turn shifts to player
  useEffect(() => {
    const isLatestPosition = viewIndex === moveStack.length - 1;
    if (premove && game.turn() === orientation && !isGameOver && isLatestPosition) {
      // Small delay to ensure state has settled
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

  const resetGame = () => {
    setMoveStack([]);
    setViewIndex(-1);
    setAnalysis(null);
    setEvalScore(50);
    setManualResult(null);
    setPremove(null);
    setConfirmResign(false);
    setConfirmDraw(false);
    setDrawDeclineMessage(null);
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

  return (
    <div className="min-h-screen bg-[#262421] text-[#bababa] selection:bg-[#81b64c]/30 pb-20 lg:pb-0">
      {!hasInteracted && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-md">
          <div className="text-center space-y-6 max-w-sm px-6">
            <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Chessico</h1>
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

      <main className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[60px_1fr_360px] xl:grid-cols-[80px_1fr_420px] gap-6 p-4 items-start">
        <div className="hidden lg:flex flex-col h-[min(80vh,600px)] py-12 items-center">
          <div className="eval-bar-container border border-white/5 w-6 h-full shadow-lg">
            <div 
              className="eval-bar-fill shadow-[0_-2px_10px_rgba(255,255,255,0.3)]" 
              style={{ height: `${evalScore}%` }}
            />
            <span className={`absolute left-1/2 -translate-x-1/2 text-[10px] font-black ${evalScore > 50 ? 'top-2 text-black' : 'bottom-2 text-white'}`}>
              {Math.abs((evalScore - 50) / 5).toFixed(1)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full max-w-[min(90vw,640px)] space-y-3">
            <div className="flex justify-between items-center px-3 py-2 bg-[#21201d] rounded-t border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-[#312e2b] flex items-center justify-center text-xl shadow-inner border border-white/5">🤖</div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-white leading-none">Gemini AI</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black">{difficulty} Mode</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {premove && (
                  <span className="bg-[#f06262] text-white text-[10px] font-black px-2 py-1 rounded animate-pulse tracking-widest uppercase">Premove Active</span>
                )}
                <div className="bg-[#1b1917] px-3 py-1.5 rounded text-sm font-mono font-bold text-white shadow-inner border border-white/5">10:00</div>
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
              />
              
              {isGameOver && (
                <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-300 rounded overflow-hidden">
                  <div className="bg-[#262421] border border-white/10 p-10 rounded shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-center max-w-[340px] w-full mx-4 transform animate-in zoom-in-95">
                    <h2 className="text-4xl font-black text-white mb-2 uppercase tracking-tighter leading-none">{getGameResult()}</h2>
                    <p className="text-[#bababa] mb-8 text-sm font-medium italic">
                      {getResultDescription()}
                    </p>
                    <div className="space-y-4">
                      <button onClick={resetGame} className="w-full py-4 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-lg font-black uppercase tracking-widest text-sm shadow-xl transition-all active:scale-95">New Match</button>
                      <button onClick={requestAnalysis} className="w-full py-2.5 bg-[#312e2b] text-[10px] font-black uppercase tracking-[0.2em] rounded-lg hover:bg-[#3d3a37] transition-colors border border-white/5">Analyze Engine</button>
                    </div>
                  </div>
                </div>
              )}

              {drawDeclineMessage && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[105] bg-red-500 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-2xl animate-in slide-in-from-top-4 duration-300">
                  {drawDeclineMessage}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center px-3 py-2 bg-[#21201d] rounded-b border-t border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-[#312e2b] flex items-center justify-center text-xl shadow-inner border border-white/5">👤</div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-white leading-none">Guest Player</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Rating: 1200?</span>
                </div>
              </div>
              <div className={`bg-[#1b1917] px-3 py-1.5 rounded text-sm font-mono font-bold text-white shadow-inner border border-white/5 ${game.turn() === orientation ? 'ring-2 ring-[#81b64c]' : ''}`}>
                10:00
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col h-[min(90vh,740px)] bg-[#21201d] rounded shadow-2xl border border-white/5 lg:mt-0">
          <div className="flex bg-[#262421] border-b border-white/5">
            <button className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-white border-b-2 border-[#81b64c] bg-[#312e2b]">Game</button>
            <button onClick={requestAnalysis} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors">Analysis</button>
          </div>

          <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden">
            <div className="flex-1 bg-[#1b1917] rounded-lg p-1 overflow-y-auto custom-scroll border border-black/30">
              <div className="grid grid-cols-[40px_1fr_1fr] gap-x-1 text-[13px] font-bold">
                {Array.from({ length: Math.ceil(fullGameHistorySAN.length / 2) }).map((_, i) => (
                  <React.Fragment key={i}>
                    <div className="bg-[#262421] text-slate-500 flex items-center justify-center text-[10px] font-black mb-1 rounded-sm">{i + 1}</div>
                    <div onClick={() => setViewIndex(i * 2)} className={`p-2 px-3 cursor-pointer rounded mb-1 transition-colors ${viewIndex === i * 2 ? 'bg-[#81b64c] text-white' : 'hover:bg-white/5 text-slate-200'}`}>{fullGameHistorySAN[i*2]}</div>
                    {fullGameHistorySAN[i*2 + 1] && (
                      <div onClick={() => setViewIndex(i * 2 + 1)} className={`p-2 px-3 cursor-pointer rounded mb-1 transition-colors ${viewIndex === i * 2 + 1 ? 'bg-[#81b64c] text-white' : 'hover:bg-white/5 text-slate-200'}`}>{fullGameHistorySAN[i*2 + 1]}</div>
                    )}
                  </React.Fragment>
                ))}
                {fullGameHistorySAN.length === 0 && <div className="col-span-3 text-center py-16 text-slate-700 text-xs font-black uppercase tracking-widest opacity-20">Waiting for first move</div>}
                <div ref={historyEndRef} />
              </div>
            </div>

            {analysis && <AnalysisPanel analysis={analysis} isLoading={isAnalyzing} />}

            <div className="bg-[#262421] rounded-lg p-5 space-y-4 shadow-lg border border-white/5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Opponent Engine</span>
                <button onClick={() => setMuted(!muted)} className="text-slate-500 hover:text-white transition-colors p-1">{muted ? '🔇' : '🔊'}</button>
              </div>
              <select 
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                className="w-full bg-[#312e2b] border-none rounded-lg p-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#81b64c] shadow-inner"
              >
                {Object.values(Difficulty).map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleResign} 
                  disabled={isGameOver}
                  className={`py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border active:scale-95 ${confirmResign ? 'bg-red-600 text-white border-red-400 animate-pulse' : 'bg-[#312e2b] text-[#ff4d4d] border-[#ff4d4d]/20 hover:bg-[#ff4d4d]/10'}`}
                >
                  {confirmResign ? 'Confirm?' : '🏳️ Resign'}
                </button>
                <button 
                  onClick={handleDrawOffer} 
                  disabled={isGameOver || isThinking}
                  className={`py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border active:scale-95 ${confirmDraw ? 'bg-[#bababa] text-black border-white animate-pulse' : 'bg-[#312e2b] text-[#bababa] border-[#bababa]/20 hover:bg-[#bababa]/10'}`}
                >
                  {confirmDraw ? 'Really Draw?' : '½ Draw'}
                </button>
              </div>

              <button onClick={resetGame} className="w-full py-3.5 bg-[#81b64c] hover:bg-[#a1d06c] text-white rounded-lg font-black uppercase tracking-widest text-xs shadow-xl transition-all active:scale-95">New Game</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;