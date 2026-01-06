
export type Color = 'w' | 'b';
export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Square {
  type: PieceSymbol;
  color: Color;
}

export interface Move {
  from: string;
  to: string;
  promotion?: string;
}

export enum GameMode {
  LOCAL = 'LOCAL',
  AI = 'AI',
  ANALYSIS = 'ANALYSIS'
}

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  GRANDMASTER = 'Grandmaster'
}

export interface AnalysisResult {
  evaluation: string;
  explanation: string;
  bestMove: string;
  suggestedPlan: string;
}

export interface GameState {
  fen: string;
  history: string[];
  isGameOver: boolean;
  status: string;
  turn: Color;
}
