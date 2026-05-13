"use strict";
/**
 * Error Handler Interface - Pluggable error parsing and handling
 *
 * @aiInstructions
 * IErrorHandler parses provider-specific errors and converts them to
 * standardized ModelErrors and BlockerEvents. Each provider has different
 * error response formats, so this allows modular error handling.
 *
 * @aiExample
 * ```typescript
 * class CustomAnthropicErrorHandler implements IErrorHandler {
 *   parseError(error: any): ParsedError {
 *     // Custom parsing logic for Anthropic errors
 *     if (error.response?.status === 429) {
 *       return {
 *         modelError: new RateLimitError('Rate limited', 60000),
 *         blockerEvent: {
 *           type: BlockerType.RATE_LIMIT_EXCEEDED,
 *           severity: 'warning',
 *           blocking: true,
 *           message: 'Rate limit exceeded',
 *           suggestedActions: [BlockerAction.WAIT]
 *         }
 *       };
 *     }
 *     return { modelError: new ModelError(ErrorCode.UNKNOWN_ERROR, 'Unknown') };
 *   }
 * }
 *
 * // Inject custom handler
 * const provider = new AnthropicProvider(auth, customErrorHandler);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=IErrorHandler.js.map