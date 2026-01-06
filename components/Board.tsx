
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chess } from 'chess.js';
import { ChessPiece } from './ChessPiece';
import { PieceSymbol, HintResult } from '../types';

interface Arrow {
  from: string;
  to: string;
  color?: string;
}

interface BoardProps {
  game: Chess;
  onMove: (move: string | { from: string; to: string; promotion?: string }) => void;
  lastMove: { from: string; to: string } | null;
  orientation: 'w' | 'b';
  premove: { from: string; to: string } | null;
  onPremove: (premove: { from: string; to: string } | null) => void;
  hint: HintResult | null;
}

export const Board: React.FC<BoardProps> = ({ 
  game, 
  onMove, 
  lastMove, 
  orientation, 
  premove, 
  onPremove,
  hint
}) => {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [draggingSquare, setDraggingSquare] = useState<string | null>(null);
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string } | null>(null);

  // Arrow & Highlight State
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [rightDragStart, setRightDragStart] = useState<string | null>(null);
  const [tempArrow, setTempArrow] = useState<Arrow | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const rows = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const displayRows = orientation === 'w' ? rows : [...rows].reverse();
  const displayCols = orientation === 'w' ? cols : [...cols].reverse();

  // Clear drawings on any new move and check for premove invalidation
  useEffect(() => {
    setArrows([]);
    setHighlights([]);

    if (premove) {
      const pieceAtFrom = game.get(premove.from as any);
      if (!pieceAtFrom || pieceAtFrom.color !== orientation) {
        onPremove(null);
      }
    }
  }, [game.fen(), orientation]);

  const getSquareFromCoords = (x: number, y: number) => {
    if (!boardRef.current) return null;
    const rect = boardRef.current.getBoundingClientRect();
    const squareSize = rect.width / 8;
    const colIdx = Math.floor((x - rect.left) / squareSize);
    const rowIdx = Math.floor((y - rect.top) / squareSize);

    if (colIdx >= 0 && colIdx < 8 && rowIdx >= 0 && rowIdx < 8) {
      return displayCols[colIdx] + displayRows[rowIdx];
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setArrows([]);
      setHighlights([]);
      setRightDragStart(null);
      setTempArrow(null);
      
      const square = getSquareFromCoords(e.clientX, e.clientY);
      if (square && !game.get(square as any) && premove) {
          onPremove(null);
      }
    } else if (e.button === 2) { // Right click
      const square = getSquareFromCoords(e.clientX, e.clientY);
      if (square) setRightDragStart(square);
      if (premove) onPremove(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (rightDragStart) {
      const currentSquare = getSquareFromCoords(e.clientX, e.clientY);
      if (currentSquare && currentSquare !== rightDragStart) {
        setTempArrow({ from: rightDragStart, to: currentSquare });
      } else {
        setTempArrow(null);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 2) {
      const endSquare = getSquareFromCoords(e.clientX, e.clientY);
      if (rightDragStart && endSquare) {
        if (rightDragStart === endSquare) {
          setHighlights(prev => 
            prev.includes(endSquare) 
              ? prev.filter(s => s !== endSquare) 
              : [...prev, endSquare]
          );
        } else {
          const newArrow = { from: rightDragStart, to: endSquare };
          setArrows(prev => {
            const exists = prev.find(a => a.from === newArrow.from && a.to === newArrow.to);
            return exists 
              ? prev.filter(a => !(a.from === newArrow.from && a.to === newArrow.to))
              : [...prev, newArrow];
          });
        }
      }
      setRightDragStart(null);
      setTempArrow(null);
    }
  };

  const handleSquareClick = (square: string) => {
    if (promotionMove) return;

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setValidMoves([]);
      return;
    }

    if (validMoves.includes(square) && selectedSquare) {
      executeMove(selectedSquare, square);
      return;
    }

    const piece = game.get(square as any);
    if (piece && piece.color === orientation) {
      setSelectedSquare(square);
      
      let moves;
      if (game.turn() === orientation) {
        moves = game.moves({ square: square as any, verbose: true });
      } else {
        const fenParts = game.fen().split(' ');
        fenParts[1] = orientation;
        
        const tempGame = new Chess();
        try {
          tempGame.load(fenParts.join(' '));
          moves = tempGame.moves({ square: square as any, verbose: true });
        } catch (e) {
          moves = [];
        }
      }
      setValidMoves(moves.map(m => m.to));
    } else {
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const executeMove = (from: string, to: string) => {
    const isMyTurn = game.turn() === orientation;
    const piece = game.get(from as any);
    const isPromotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1');

    if (isMyTurn) {
      if (isPromotion) {
        setPromotionMove({ from, to });
      } else {
        onMove({ from, to });
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      onPremove({ from, to });
      setSelectedSquare(null);
      setValidMoves([]);
    }
    setDraggingSquare(null);
  };

  const handlePromotionSelect = (pieceSymbol: PieceSymbol) => {
    if (promotionMove) {
      onMove({ ...promotionMove, promotion: pieceSymbol });
      setPromotionMove(null);
      setSelectedSquare(null);
      setValidMoves([]);
    }
  };

  const handleDragStart = (e: React.DragEvent, square: string) => {
    if (promotionMove) {
      e.preventDefault();
      return;
    }
    const piece = game.get(square as any);
    if (piece && piece.color === orientation) {
      e.dataTransfer.setData('sourceSquare', square);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingSquare(square);
      handleSquareClick(square);
    } else {
      e.preventDefault();
    }
  };

  const handleDragEnd = () => {
    setDraggingSquare(null);
  };

  const handleDragOver = (e: React.DragEvent, square: string) => {
    if (validMoves.includes(square)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDrop = (e: React.DragEvent, targetSquare: string) => {
    e.preventDefault();
    const sourceSquare = e.dataTransfer.getData('sourceSquare');
    if (sourceSquare && validMoves.includes(targetSquare)) {
      executeMove(sourceSquare, targetSquare);
    }
    setDraggingSquare(null);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const isDarkSquare = (rIdx: number, cIdx: number) => (rIdx + cIdx) % 2 === 1;

  const getSquareBaseColor = (rIdx: number, cIdx: number, square: string) => {
    const isDark = isDarkSquare(rIdx, cIdx);
    
    // Premove has highest priority visually
    if (premove?.from === square || premove?.to === square) return 'bg-[#f06262]';
    
    // Hint highlight
    if (hint?.from === square || hint?.to === square) return 'bg-[#3b82f6]/40 shadow-inner ring-2 ring-[#3b82f6]/20';

    const isSelected = selectedSquare === square;
    const isLastMove = lastMove?.from === square || lastMove?.to === square;
    if (isSelected || isLastMove) return 'bg-[#f6f669]';
    return isDark ? 'bg-[#769656]' : 'bg-[#eeeed2]'; 
  };

  const getSquareCenter = (square: string) => {
    const col = square[0];
    const row = square[1];
    const colIdx = displayCols.indexOf(col);
    const rowIdx = displayRows.indexOf(row);
    return {
      x: (colIdx * 12.5 + 6.25),
      y: (rowIdx * 12.5 + 6.25)
    };
  };

  const allArrows = useMemo(() => {
    const list = tempArrow ? [...arrows, tempArrow] : [...arrows];
    if (hint) {
      list.push({ from: hint.from, to: hint.to, color: '#3b82f6' });
    }
    return list;
  }, [arrows, tempArrow, hint]);

  return (
    <div 
      ref={boardRef}
      className="absolute inset-0 grid grid-cols-8 grid-rows-8 select-none shadow-2xl rounded-sm overflow-hidden border border-black/20"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      {displayRows.map((row, rIdx) => (
        displayCols.map((col, cIdx) => {
          const square = `${col}${row}`;
          const piece = game.get(square as any);
          const isValidMove = validMoves.includes(square);
          const isDragging = draggingSquare === square;
          const coordColor = isDarkSquare(rIdx, cIdx) ? 'text-[#eeeed2]' : 'text-[#769656]';
          const isHighlighted = highlights.includes(square);
          const isPremoveTarget = premove?.to === square;

          return (
            <div
              key={square}
              onClick={() => handleSquareClick(square)}
              onDragOver={(e) => handleDragOver(e, square)}
              onDrop={(e) => handleDrop(e, square)}
              className={`square-texture relative cursor-pointer w-full h-full transition-colors duration-150 ${getSquareBaseColor(rIdx, cIdx, square)} ${isValidMove ? 'hover:brightness-110' : ''}`}
            >
              {/* Coordinates - Responsive sizing */}
              {cIdx === 0 && (
                <span className={`absolute left-0.5 top-0.5 text-[min(2.5vw,12px)] font-bold leading-none select-none ${coordColor}`}>
                  {row}
                </span>
              )}
              {rIdx === 7 && (
                <span className={`absolute right-0.5 bottom-0.5 text-[min(2.5vw,12px)] font-bold leading-none select-none ${coordColor}`}>
                  {col}
                </span>
              )}

              {isHighlighted && (
                <div className="absolute inset-0 border-[clamp(2px,0.5vw,4px)] border-[#ffa500]/60 z-20 pointer-events-none" />
              )}

              {isPremoveTarget && (
                <div className="absolute top-1 right-1 bg-white/30 text-white text-[clamp(8px,1vw,12px)] font-black px-1 rounded-sm shadow-md z-30 pointer-events-none animate-pulse">
                  P
                </div>
              )}

              {piece && (
                <div 
                  className={`w-full h-full p-[2%] piece-transition z-10 flex items-center justify-center relative transition-all duration-200 ${isDragging ? 'opacity-30 scale-90 grayscale-[0.3]' : 'opacity-100 scale-100'}`}
                  draggable={piece.color === orientation && !promotionMove}
                  onDragStart={(e) => handleDragStart(e, square)}
                  onDragEnd={handleDragEnd}
                >
                  <ChessPiece type={piece.type} color={piece.color} />
                </div>
              )}

              {isValidMove && !promotionMove && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  {piece ? (
                    <div className="w-[88%] h-[88%] border-[clamp(4px,1vw,8px)] border-black/10 rounded-full" />
                  ) : (
                    <div className="w-[30%] h-[30%] bg-black/15 rounded-full" />
                  )}
                </div>
              )}
            </div>
          );
        })
      ))}

      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none z-40 drop-shadow-sm"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id="smart-arrowhead-narrow"
            markerWidth="7"
            markerHeight="7"
            refX="5.5"
            refY="3.5"
            orient="auto"
          >
            <path d="M 0 1.5 L 6 3.5 L 0 5.5 L 1.5 3.5 Z" fill="#ffa500" fillOpacity="0.85" />
          </marker>
          <marker
            id="hint-arrowhead"
            markerWidth="7"
            markerHeight="7"
            refX="5.5"
            refY="3.5"
            orient="auto"
          >
            <path d="M 0 1.5 L 6 3.5 L 0 5.5 L 1.5 3.5 Z" fill="#3b82f6" fillOpacity="0.85" />
          </marker>
        </defs>
        {allArrows.map((arrow, idx) => {
          const color = arrow.color || "#ffa500";
          const marker = arrow.color === '#3b82f6' ? 'url(#hint-arrowhead)' : 'url(#smart-arrowhead-narrow)';
          const isPulsing = arrow.color === '#3b82f6';

          const from = getSquareCenter(arrow.from);
          const to = getSquareCenter(arrow.to);
          
          const fromColIdx = cols.indexOf(arrow.from[0]);
          const fromRowIdx = rows.indexOf(arrow.from[1]);
          const toColIdx = cols.indexOf(arrow.to[0]);
          const toRowIdx = rows.indexOf(arrow.to[1]);
          
          const dc = Math.abs(toColIdx - fromColIdx);
          const dr = Math.abs(toRowIdx - fromRowIdx);
          const isKnightMove = (dc === 1 && dr === 2) || (dc === 2 && dr === 1);
          
          const shorten = 3.8;

          if (isKnightMove) {
            let bx, by;
            if (dr === 2) {
              bx = from.x;
              by = to.y;
            } else {
              bx = to.x;
              by = from.y;
            }

            const dxLast = to.x - bx;
            const dyLast = to.y - by;
            const angleLast = Math.atan2(dyLast, dxLast);
            const distLast = Math.sqrt(dxLast * dxLast + dyLast * dyLast);
            const endX = bx + (distLast - shorten) * Math.cos(angleLast);
            const endY = by + (distLast - shorten) * Math.sin(angleLast);

            return (
              <path
                key={`${arrow.from}-${arrow.to}-${idx}`}
                d={`M ${from.x} ${from.y} L ${bx} ${by} L ${endX} ${endY}`}
                fill="none"
                stroke={color}
                strokeWidth="1.3"
                strokeOpacity="0.8"
                markerEnd={marker}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isPulsing ? 'animate-pulse' : ''}
              />
            );
          } else {
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const angle = Math.atan2(dy, dx);
            const length = Math.sqrt(dx * dx + dy * dy);
            const endX = from.x + (length - shorten) * Math.cos(angle);
            const endY = from.y + (length - shorten) * Math.sin(angle);

            return (
              <line
                key={`${arrow.from}-${arrow.to}-${idx}`}
                x1={from.x}
                y1={from.y}
                x2={endX}
                y2={endY}
                stroke={color}
                strokeWidth="1.3"
                strokeOpacity="0.8"
                markerEnd={marker}
                strokeLinecap="round"
                className={isPulsing ? 'animate-pulse' : ''}
              />
            );
          }
        })}
      </svg>

      {promotionMove && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="bg-[#262421] p-3 rounded-2xl border border-white/10 shadow-2xl flex gap-3 animate-in zoom-in-95">
            {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePromotionSelect(p)}
                className="w-14 h-14 lg:w-20 lg:h-20 p-2 hover:bg-white/10 rounded-xl transition-colors group"
              >
                <div className="w-full h-full group-hover:scale-110 transition-transform">
                  <ChessPiece type={p} color={orientation} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};