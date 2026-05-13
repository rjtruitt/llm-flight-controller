/**
 * Model Blocker Event Factory - Converts errors to blocker events
 */

import { BlockerEvent, BlockerType, BlockerAction } from '../events/BlockerEvent';
import { RateLimitError, AuthenticationError } from '../errors/LLMError';

export class ModelBlockerEventFactory {
  /**
   * Create blocker event from error
   */
  static createFromError(error: Error): BlockerEvent {
    if (error instanceof RateLimitError) {
      return {
        type: BlockerType.RATE_LIMIT_EXCEEDED,
        severity: 'warning',
        blocking: true,
        message: error.message,
        suggestedActions: [BlockerAction.WAIT, BlockerAction.SWITCH_MODEL],
        data: { waitMs: error.retryAfter }
      };
    }

    if (error instanceof AuthenticationError) {
      return {
        type: BlockerType.AUTH_REQUIRED,
        severity: 'critical',
        blocking: true,
        message: error.message,
        suggestedActions: [BlockerAction.AUTHENTICATE]
      };
    }

    return {
      type: BlockerType.MODEL_ERROR,
      severity: 'error',
      blocking: true,
      message: error.message,
      suggestedActions: [BlockerAction.RETRY, BlockerAction.SWITCH_MODEL]
    };
  }
}
