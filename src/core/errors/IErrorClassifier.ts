/**
 * Error Classifier Interface - Allows custom error classification logic
 */

import { ErrorContext } from './IErrorHandler';

/**
 * Interface for classifying errors
 *
 * @aiInstructions
 * Implement this interface to customize how errors are classified.
 * Useful for provider-specific error detection or custom error categories.
 *
 * @aiExample
 * ```typescript
 * class CustomErrorClassifier implements IErrorClassifier {
 *   isRateLimitError(context: ErrorContext): boolean {
 *     return context.statusCode === 429 || context.responseBody?.includes('quota_exceeded');
 *   }
 *
 *   isAuthError(context: ErrorContext): boolean {
 *     return context.statusCode === 401 || context.headers?.['www-authenticate'];
 *   }
 *
 *   isSessionLimitError(context: ErrorContext): boolean {
 *     return context.responseBody?.includes('daily_limit_exceeded');
 *   }
 *
 *   getRetryAfter(context: ErrorContext): number | undefined {
 *     // Custom retry-after logic
 *     return 60000;
 *   }
 * }
 * ```
 */
export interface IErrorClassifier {
  /**
   * Detect rate limit errors
   */
  isRateLimitError(context: ErrorContext): boolean;

  /**
   * Detect authentication errors
   */
  isAuthError(context: ErrorContext): boolean;

  /**
   * Detect session limit errors (e.g., daily message limits)
   */
  isSessionLimitError(context: ErrorContext): boolean;

  /**
   * Extract retry-after duration from error
   */
  getRetryAfter(context: ErrorContext): number | undefined;
}
