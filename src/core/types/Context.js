"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=Context.js.map