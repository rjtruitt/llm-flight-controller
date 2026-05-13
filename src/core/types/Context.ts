/**
 * Context Types - Conversation context structures
 *
 * @aiInstructions
 * Context represents the full state of a conversation, including messages, tools,
 * and metadata. Uses OpenAI format as the universal interchange format.
 *
 * @aiExample
 * ```typescript
 * const context: ConversationContext = {
 *   messages: [
 *     { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
 *     { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }] }
 *   ],
 *   tools: [
 *     {
 *       type: 'function',
 *       function: {
 *         name: 'get_weather',
 *         description: 'Get weather for a city',
 *         parameters: {
 *           type: 'object',
 *           properties: { city: { type: 'string' } },
 *           required: ['city']
 *         }
 *       }
 *     }
 *   ],
 *   maxTokens: 4096,
 *   temperature: 0.7
 * };
 * ```
 *
 * @aiWhenToUse
 * Use ConversationContext when:
 * - Maintaining conversation state across multiple turns
 * - Switching between models (context gets converted)
 * - Implementing compression or truncation strategies
 * - Persisting conversation history
 */

import { OpenAIMessage } from './Message';

/**
 * Tool definition (OpenAI function format)
 */
export interface ToolDefinition {
    type: 'function';
    function: {
        /** Tool name */
        name: string;
        /** Tool description */
        description?: string;
        /** JSON schema for tool input */
        parameters: Record<string, unknown>;
    };
}

/**
 * Conversation context metadata
 */
export interface ContextMetadata {
    /** Total tokens in context */
    totalTokens?: number;
    /** Has this context been compressed? */
    compressed?: boolean;
    /** Original provider (if converted) */
    originalProvider?: string;
    /** When context was created */
    createdAt?: number;
    /** Last update timestamp */
    updatedAt?: number;
    /** Custom metadata */
    custom?: Record<string, unknown>;
}

/**
 * Conversation context - OpenAI format (universal interchange)
 */
export interface OpenAIContext {
    /** Conversation messages */
    messages: OpenAIMessage[];
    /** Available tools */
    tools?: ToolDefinition[];
    /** Maximum tokens to generate */
    maxTokens?: number;
    /** Temperature (0-2) */
    temperature?: number;
    /** Top-p sampling */
    topP?: number;
    /** Stop sequences */
    stopSequences?: string[];
    /** Context metadata */
    metadata?: ContextMetadata;
}

/**
 * Provider-specific context (opaque)
 */
export type ProviderContext = unknown;
