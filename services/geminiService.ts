
import { GoogleGenAI, Type } from "@google/genai";
import { Difficulty, AnalysisResult, HintResult, ReviewData, MoveCategory } from "../types";

export class GeminiChessService {
  private ai: GoogleGenAI;

  constructor() {
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
      3. Return ONLY the move in Standard Algebraic Notation (SAN).
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

  async evaluateMove(fenBefore: string, moveSAN: string, history: string[]): Promise<MoveCategory | null> {
    const prompt = `
      Act as a world-class chess coach. Evaluate this specific move:
      Position before (FEN): ${fenBefore}
      Move played: ${moveSAN}
      Game history leading up: ${history.slice(-10).join(', ')}
      
      Classify the move as exactly one of: [Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Blunder, Miss].
      Return ONLY the category name.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          temperature: 0.1,
          topK: 1
        }
      });

      const text = response.text.trim();
      const validCategories = ['Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Book', 'Inaccuracy', 'Mistake', 'Blunder', 'Miss'];
      const found = validCategories.find(cat => text.includes(cat));
      return (found as MoveCategory) || null;
    } catch (error) {
      console.error("Move evaluation error:", error);
      return null;
    }
  }

  async shouldAcceptDraw(fen: string, history: string[]): Promise<boolean> {
    const prompt = `
      You are playing a chess game. Your opponent offered a draw.
      Current FEN: ${fen}
      History: ${history.slice(-10).join(', ')}
      
      Analyze the position. Would a strong engine accept a draw here? 
      Accept if:
      - The position is objectively equal (e.g., -0.5 to +0.5).
      - It's a dead drawn endgame.
      - You have significantly less time (assume time pressure if move count > 40).
      
      Return JSON: { "accept": true/false, "reason": "short explanation" }
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
              accept: { type: Type.BOOLEAN },
              reason: { type: Type.STRING }
            },
            required: ["accept", "reason"]
          }
        }
      });
      const result = JSON.parse(response.text.trim());
      return result.accept;
    } catch (error) {
      return false;
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
              from: { type: Type.STRING },
              to: { type: Type.STRING },
              san: { type: Type.STRING },
              explanation: { type: Type.STRING }
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
              evaluation: { type: Type.STRING },
              explanation: { type: Type.STRING },
              bestMove: { type: Type.STRING },
              suggestedPlan: { type: Type.STRING }
            },
            required: ["evaluation", "explanation", "bestMove", "suggestedPlan"]
          }
        }
      });

      return JSON.parse(response.text.trim());
    } catch (error) {
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
      Act as a world-class chess coach. Review this full game history: ${history.join(', ')}.
      Classify each move and provide summary metrics.
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
                    moveIndex: { type: Type.INTEGER },
                    san: { type: Type.STRING },
                    category: { type: Type.STRING },
                    comment: { type: Type.STRING }
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
      return null;
    }
  }
}
