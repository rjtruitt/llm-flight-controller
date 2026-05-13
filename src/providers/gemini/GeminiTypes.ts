/**
 * Gemini API type definitions
 *
 * @aiInstruction
 * Type definitions for Google Gemini API format.
 * Gemini uses 'user' and 'model' roles (not 'assistant').
 * Supports multi-modal content: text, images, video, audio, function calls.
 */

/**
 * Gemini message format
 */
export interface GeminiMessage {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

export type GeminiPart =
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { fileData: { mimeType: string; fileUri: string } }
    | { functionCall: { name: string; args: any } }
    | { functionResponse: { name: string; response: any } };

export interface GeminiRequest {
    contents: GeminiMessage[];
    systemInstruction?: {
        role: 'user';
        parts: Array<{ text: string }>;
    };
    tools?: Array<{
        functionDeclarations: Array<{
            name: string;
            description?: string;
            parameters?: any;
        }>;
    }>;
    generationConfig?: {
        temperature?: number;
        topP?: number;
        topK?: number;
        maxOutputTokens?: number;
        stopSequences?: string[];
    };
}

export interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: GeminiPart[];
            role: 'model';
        };
        finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
        index: number;
        safetyRatings?: Array<{
            category: string;
            probability: string;
        }>;
    }>;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
    modelVersion?: string;
}
