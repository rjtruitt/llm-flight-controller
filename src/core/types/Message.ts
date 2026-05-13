/**
 * Message Types - OpenAI format as universal interchange
 *
 * @aiInstructions
 * Messages are the fundamental building blocks of LLM conversations. We use OpenAI's
 * message format as the universal interchange format across all providers.
 *
 * Key concepts:
 * - OpenAIMessage: Universal format that works across all providers
 * - OpenAIContent: Typed content blocks (text, images, tool calls, etc.)
 * - Role: Standardized roles (user, assistant, system)
 *
 * @aiExample
 * ```typescript
 * // Simple text message
 * const message: OpenAIMessage = {
 *   role: 'user',
 *   content: [{ type: 'text', text: 'Hello!' }]
 * };
 *
 * // Message with image
 * const imageMessage: OpenAIMessage = {
 *   role: 'user',
 *   content: [
 *     { type: 'text', text: 'What is in this image?' },
 *     { type: 'image', url: 'data:image/png;base64,...', mimeType: 'image/png' }
 *   ]
 * };
 *
 * // Assistant message with tool call
 * const toolMessage: OpenAIMessage = {
 *   role: 'assistant',
 *   content: [
 *     { type: 'tool_call', id: 'call_123', name: 'get_weather', args: { city: 'SF' } }
 *   ]
 * };
 * ```
 *
 * @aiWhenToUse
 * Use OpenAIMessage when:
 * - Building orchestrators that work with multiple models
 * - Converting between provider formats
 * - Storing conversation history in a universal format
 * - Switching models mid-conversation
 *
 * Don't use when:
 * - Working with a single provider (use their native format)
 * - Performance is critical (OpenAI format conversion adds overhead)
 */

/**
 * Standard message roles
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Text content block
 */
export interface TextContent {
    type: 'text';
    text: string;
}

/**
 * Image content block
 */
export interface ImageContent {
    type: 'image';
    /** Image URL or data URI */
    url?: string;
    /** MIME type (e.g., 'image/png', 'image/jpeg') */
    mimeType?: string;
    /** Image source (for base64 data) */
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/**
 * Audio content block
 */
export interface AudioContent {
    type: 'audio';
    /** Audio URL or data URI */
    url?: string;
    /** MIME type (e.g., 'audio/wav', 'audio/mp3') */
    mimeType?: string;
    /** Audio source (for base64 data) */
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/**
 * Video content block
 */
export interface VideoContent {
    type: 'video';
    /** Video URL or data URI */
    url?: string;
    /** MIME type (e.g., 'video/mp4', 'video/webm') */
    mimeType?: string;
    /** Video source (for base64 data) */
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/**
 * Document content block (PDFs, etc.)
 */
export interface DocumentContent {
    type: 'document';
    /** Document URL or data URI */
    url: string;
    /** MIME type (e.g., 'application/pdf') */
    mimeType: string;
    /** Document text content (extracted) */
    text?: string;
    /** Document metadata */
    metadata?: {
        title?: string;
        author?: string;
        pageCount?: number;
    };
}

/**
 * Tool call content block
 */
export interface ToolCallContent {
    type: 'tool_call';
    /** Unique identifier for this tool call */
    id: string;
    /** Name of the tool to call */
    name: string;
    /** Arguments to pass to the tool */
    args?: unknown;
    /** Alternative name for args */
    arguments?: unknown;
}

/**
 * Tool result content block
 */
export interface ToolResultContent {
    type: 'tool_result';
    /** ID of the tool call this is responding to */
    id?: string;
    /** Alternative ID field name */
    toolCallId?: string;
    /** Result from the tool execution */
    result?: unknown;
    /** Alternative name for result */
    content?: unknown;
    /** Error message if tool execution failed */
    error?: string;
}

/**
 * Thinking/reasoning content block (o1, o3, DeepSeek R1)
 */
export interface ThinkingContent {
    type: 'thinking';
    /** Reasoning process text */
    thinking?: string;
    /** Alternative field name */
    text?: string;
}

/**
 * Cache marker content (Anthropic prompt caching)
 */
export interface CacheMarkerContent {
    type: 'cache_marker';
    /** Where to place the cache breakpoint */
    breakpoint?: 'ephemeral' | 'persistent';
    /** Optional text content */
    text?: string;
}

/**
 * Union of all content block types - OpenAI format content
 */
export type OpenAIContent =
    | TextContent
    | ImageContent
    | AudioContent
    | VideoContent
    | DocumentContent
    | ToolCallContent
    | ToolResultContent
    | ThinkingContent
    | CacheMarkerContent;

/**
 * Message metadata
 */
export interface MessageMetadata {
    /** When the message was created */
    timestamp?: number;
    /** Which model generated this message */
    modelId?: string;
    /** Token count for this message */
    tokens?: number;
    /** Importance score (0-1) for compression */
    importance?: number;
    /** Custom metadata */
    custom?: Record<string, unknown>;
}

/**
 * OpenAI message format - the universal translator for LLM messages
 */
export interface OpenAIMessage {
    /** Message role */
    role: MessageRole;
    /** Content blocks */
    content: OpenAIContent[];
    /** Optional metadata */
    metadata?: MessageMetadata;
}

/**
 * Provider-specific message (opaque)
 */
export type ProviderMessage = unknown;
