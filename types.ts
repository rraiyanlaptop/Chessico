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

export interface HintResult {
  from: string;
  to: string;
  san: string;
  explanation: string;
}

export type MoveCategory = 'Brilliant' | 'Great' | 'Best' | 'Good' | 'Book' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export interface MoveEvaluation {
  moveIndex: number;
  san: string;
  category: MoveCategory;
  comment: string;
}

export interface ReviewData {
  accuracyWhite: number;
  accuracyBlack: number;
  summary: string;
  evaluations: MoveEvaluation[];
}

export interface GameState {
  fen: string;
  history: string[];
  isGameOver: boolean;
  status: string;
  turn: Color;
}