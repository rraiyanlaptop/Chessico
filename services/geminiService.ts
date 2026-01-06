
import { GoogleGenAI, Type } from "@google/genai";
import { Difficulty, AnalysisResult } from "../types";

const API_KEY = process.env.API_KEY || "";

export class GeminiChessService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: API_KEY });
  }

  async getAIMove(fen: string, history: string[], difficulty: Difficulty): Promise<string> {
    const prompt = `
      You are a world-class chess engine.
      Current board state (FEN): ${fen}
      Move history: ${history.join(', ')}
      Requested Difficulty: ${difficulty}
      
      Tasks:
      1. Analyze the position.
      2. Choose the best move according to the difficulty level. 
         - EASY: Make sub-optimal or even slightly weak moves.
         - MEDIUM: Play solid chess like an 1500 Elo player.
         - HARD: Play like a 2200 Elo Master.
         - GRANDMASTER: Play the strongest possible move (Stockfish 16 level logic).
      3. Return ONLY the move in Standard Algebraic Notation (SAN), e.g., "e4", "Nf3", "O-O", "exd5".
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          temperature: difficulty === Difficulty.EASY ? 1.0 : 0.2,
          topP: 0.8,
        }
      });

      return response.text.trim().split(' ')[0].replace(/[^a-zA-Z0-9#+=-]/g, '');
    } catch (error) {
      console.error("Gemini AI Move Error:", error);
      return "";
    }
  }

  async analyzePosition(fen: string, history: string[]): Promise<AnalysisResult> {
    const prompt = `
      Analyze this chess position for educational purposes.
      FEN: ${fen}
      History: ${history.slice(-5).join(', ')}
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          systemInstruction: "You are a Grandmaster chess coach. Provide detailed analysis in JSON format.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              evaluation: { type: Type.STRING, description: "Numerical evaluation or positional assessment (e.g. +1.5, slightly better for White)" },
              explanation: { type: Type.STRING, description: "Detailed explanation of the current strategic situation" },
              bestMove: { type: Type.STRING, description: "The best move in SAN format" },
              suggestedPlan: { type: Type.STRING, description: "A strategic plan for the side whose turn it is" }
            },
            required: ["evaluation", "explanation", "bestMove", "suggestedPlan"]
          }
        }
      });

      return JSON.parse(response.text.trim());
    } catch (error) {
      console.error("Gemini Analysis Error:", error);
      return {
        evaluation: "Error",
        explanation: "Could not analyze position.",
        bestMove: "",
        suggestedPlan: "Continue playing."
      };
    }
  }
}
