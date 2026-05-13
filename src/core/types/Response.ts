/**
 * Response Types - LLM response structures
 *
 * @aiInstructions
 * Response types represent what comes back from an LLM after sending a request.
 * Includes the generated content, token usage, and metadata.
 *
 * @aiExample
 * ```typescript
 * const response: ModelResponse = {
 *   content: [{ type: 'text', text: 'Hello! How can I help?' }],
 *   usage: {
 *     inputTokens: 10,
 *     outputTokens: 7,
 *     totalTokens: 17
 *   },
 *   finishReason: 'stop',
 *   metadata: {
 *     modelId: 'claude-sonnet-4',
 *     latencyMs: 234
 *   }
 * };
 * ```
 */

import { OpenAIContent } from './Message';

/**
 * Why the model stopped generating
 */
export type FinishReason =
    | 'stop'           // Natural completion
    | 'length'         // Hit max token limit
    | 'tool_calls'     // Made tool calls, waiting for results
    | 'content_filter' // Content filtered by provider
    | 'error';         // Error occurred

/**
 * Token usage information
 */
export interface TokenUsage {
    /** Input/prompt tokens */
    inputTokens: number;
    /** Output/completion tokens */
    outputTokens: number;
    /** Total tokens (input + output) */
    totalTokens: number;
    /** Cached tokens read (if prompt caching enabled) */
    cacheReadTokens?: number;
    /** Tokens written to cache (if prompt caching enabled) */
    cacheWriteTokens?: number;
    /** Reasoning tokens (for o1, o3 models) */
    reasoningTokens?: number;
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
    /** Model that generated this response */
    modelId?: string;
    /** Request latency in milliseconds */
    latencyMs?: number;
    /** Provider-specific ID */
    providerId?: string;
    /** Custom metadata */
    custom?: Record<string, unknown>;
}

/**
 * Model response
 */
export interface ModelResponse {
    /** Generated content */
    content: OpenAIContent[];
    /** Token usage statistics */
    usage: TokenUsage;
    /** Why generation stopped */
    finishReason: FinishReason;
    /** Response metadata */
    metadata?: ResponseMetadata;
    /** Response ID (provider-specific) */
    id?: string;
}

/**
 * Streaming chunk for incremental responses
 */
export interface StreamChunk {
    /** Partial content */
    content: OpenAIContent[];
    /** Is this the final chunk? */
    done: boolean;
    /** Partial token usage (only in final chunk) */
    usage?: TokenUsage;
}
