"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=Message.js.map