
import { GoogleGenAI, Type } from "@google/genai";
import { Difficulty, AnalysisResult, HintResult, ReviewData } from "../types";

// The API key is obtained from process.env.API_KEY as per guidelines.
export class GeminiChessService {
  private ai: GoogleGenAI;

  constructor() {
    // Initializing with the required named parameter.
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

      // Using the .text property as per instructions.
      return response.text.trim().split(' ')[0].replace(/[^a-zA-Z0-9#+=-]/g, '');
    } catch (error) {
      console.error("Gemini AI Move Error:", error);
      return "";
    }
  }

  async getHint(fen: string, history: string[]): Promise<HintResult | null> {
    const prompt = `
      You are a world-class chess coach. 
      Current FEN: ${fen}
      History: ${history.slice(-5).join(', ')}
      
      Provide a hint for the next best move.
      Return the response in JSON format.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              from: { type: Type.STRING, description: "The source square (e.g. e2)" },
              to: { type: Type.STRING, description: "The destination square (e.g. e4)" },
              san: { type: Type.STRING, description: "The move in SAN notation" },
              explanation: { type: Type.STRING, description: "A very short explanation (1 sentence) of why this move is good" }
            },
            required: ["from", "to", "san", "explanation"]
          }
        }
      });

      return JSON.parse(response.text.trim());
    } catch (error) {
      console.error("Gemini Hint Error:", error);
      return null;
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

  async getGameReview(history: string[]): Promise<ReviewData | null> {
    const prompt = `
      Act as a chess analyst. Review this full game history: ${history.join(', ')}.
      
      For EACH move, classify it as one of: [Brilliant, Great, Best, Good, Book, Inaccuracy, Mistake, Blunder].
      Provide a concise summary of the game and an accuracy percentage (0-100) for both White and Black.
      
      Return as JSON.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              accuracyWhite: { type: Type.NUMBER },
              accuracyBlack: { type: Type.NUMBER },
              summary: { type: Type.STRING },
              evaluations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    moveIndex: { type: Type.INTEGER, description: "0-indexed move number in the history list" },
                    san: { type: Type.STRING },
                    category: { type: Type.STRING, description: "One of the move categories" },
                    comment: { type: Type.STRING, description: "Brief explanation of the quality" }
                  },
                  required: ["moveIndex", "san", "category", "comment"]
                }
              }
            },
            required: ["accuracyWhite", "accuracyBlack", "summary", "evaluations"]
          }
        }
      });

      return JSON.parse(response.text.trim());
    } catch (error) {
      console.error("Gemini Game Review Error:", error);
      return null;
    }
  }
}
