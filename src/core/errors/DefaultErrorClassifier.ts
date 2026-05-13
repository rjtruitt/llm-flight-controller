/**
 * Default Error Classifier - Standard HTTP error classification
 */

import { IErrorClassifier } from './IErrorClassifier';
import { ErrorContext } from './IErrorHandler';

export class DefaultErrorClassifier implements IErrorClassifier {
  isRateLimitError(context: ErrorContext): boolean {
    return context.statusCode === 429;
  }

  isAuthError(context: ErrorContext): boolean {
    return context.statusCode === 401 || context.statusCode === 403;
  }

  isSessionLimitError(_context: ErrorContext): boolean {
    // Override in provider-specific classifiers
    return false;
  }

  getRetryAfter(context: ErrorContext): number | undefined {
    // Check Retry-After header
    const retryAfter = context.headers?.['retry-after'] || context.headers?.['Retry-After'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }

    // Default backoff
    return 60000; // 1 minute
  }
}
