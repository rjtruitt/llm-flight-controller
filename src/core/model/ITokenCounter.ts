/**
 * Token Counter Interface - Allows custom token counting implementations
 */

import { OpenAIContext } from '../types/Context';

/**
 * Interface for counting tokens in messages
 *
 * @aiInstructions
 * Implement this interface to provide custom token counting logic.
 * Useful for accurate token estimation with provider-specific tokenizers.
 *
 * @aiExample
 * ```typescript
 * import { encode } from 'gpt-tokenizer';
 *
 * class GPTTokenCounter implements ITokenCounter {
 *   estimateTokens(context: OpenAIContext): { input: number; output: number } {
 *     let inputTokens = 0;
 *     for (const msg of context.messages) {
 *       const text = msg.content.map(c => c.type === 'text' ? c.text : '').join('');
 *       inputTokens += encode(text).length;
 *     }
 *     return { input: inputTokens, output: context.maxTokens || 1000 };
 *   }
 * }
 * ```
 */
export interface ITokenCounter {
  /**
   * Estimate input and output tokens for a context
   */
  estimateTokens(context: OpenAIContext): { input: number; output: number };
}
