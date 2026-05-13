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

import { ModelError } from '../types/Errors';
import { BlockerEvent } from '../events/BlockerEvent';

/**
 * Parsed error result
 */
export interface ParsedError {
    /** Standardized model error */
    modelError: ModelError;
    /** Optional blocker event for orchestrator */
    blockerEvent?: BlockerEvent;
    /** Whether error is retryable */
    retryable?: boolean;
    /** Suggested retry delay in ms */
    retryAfterMs?: number;
}

/**
 * Error context - information about the request/response
 */
export interface ErrorContext {
    /** HTTP status code (if applicable) */
    statusCode?: number;
    /** HTTP response headers */
    headers?: Record<string, string>;
    /** Response body */
    body?: any;
    /** Original error object */
    originalError?: any;
    /** Request that caused the error */
    request?: {
        url?: string;
        method?: string;
        body?: any;
    };
}

/**
 * Error handler interface
 */
export interface IErrorHandler {
    /**
     * Parse provider-specific error into standardized format
     */
    parseError(context: ErrorContext): ParsedError;

    /**
     * Check if error is a rate limit error
     */
    isRateLimitError?(context: ErrorContext): boolean;

    /**
     * Check if error is an authentication error
     */
    isAuthError?(context: ErrorContext): boolean;

    /**
     * Check if error is a session/quota limit error
     */
    isSessionLimitError?(context: ErrorContext): boolean;

    /**
     * Extract retry-after delay from error response
     */
    getRetryAfter?(context: ErrorContext): number | undefined;
}
