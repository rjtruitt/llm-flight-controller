/**
 * OpenAI API type definitions
 *
 * @aiInstruction
 * Type definitions for OpenAI Chat Completions API format.
 * These types work with OpenAI and all OpenAI-compatible providers:
 * OpenAI, DeepSeek, Groq, Together AI, Perplexity, Ollama, LM Studio, vLLM.
 * Supports text, images, tool calls, and reasoning (o1/o3 models).
 */

/**
 * OpenAI message format (native SDK format)
 */
export interface OpenAINativeMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | OpenAINativeContent[];
    name?: string;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
}

export type OpenAINativeContent =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface OpenAIRequest {
    model: string;
    messages: OpenAINativeMessage[];
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    tools?: Array<{
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters: any;
        };
    }>;
    stream?: boolean;
    reasoning_effort?: 'low' | 'medium' | 'high'; // o1/o3 models
}

export interface OpenAIResponse {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: 'assistant';
            content: string | null;
            tool_calls?: OpenAIToolCall[];
            reasoning_content?: string; // o1/o3 reasoning
        };
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        reasoning_tokens?: number; // o1/o3 models
    };
}
