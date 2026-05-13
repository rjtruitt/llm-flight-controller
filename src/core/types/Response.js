"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=Response.js.map