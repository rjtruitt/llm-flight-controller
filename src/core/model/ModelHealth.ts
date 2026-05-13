/**
 * Model health checking utilities
 *
 * @aiInstruction
 * STATELESS health checking - just probes models, doesn't track history or cooldowns.
 * Your orchestrator decides what to do with health check results.
 * Use checkModelHealth() to test if a model is available RIGHT NOW.
 *
 * @aiExample
 * const health = await checkModelHealth(model);
 * if (!health.available) {
 *   if (health.errorType === 'session_limit') {
 *     console.log('Model hit session limit, switch models');
 *   } else if (health.errorType === 'rate_limit' && health.suggestedCooldown) {
 *     console.log(`Rate limited, wait ${health.suggestedCooldown}ms`);
 *   }
 * }
 */

import { OpenAIContext } from '../types/Context';
import { ModelResponse } from '../types/Response';
import { IErrorHandler } from '../errors/IErrorHandler';

export interface HealthCheckResult {
    available: boolean;
    error?: string;
    remainingQuota?: number;
    hasSessionLimits?: boolean;
    errorType?: 'session_limit' | 'rate_limit' | 'auth' | 'other';
    suggestedCooldown?: number;
}

export interface ModelHealthCheckable {
    sendRequest(context: OpenAIContext): Promise<ModelResponse>;
    errorHandler?: IErrorHandler;
    hasSessionLimits(): boolean;
}

/**
 * Check if model is healthy and available RIGHT NOW
 *
 * @aiInstruction
 * STATELESS - just probes the model, doesn't track history or cooldowns.
 * For session-limited models: checks if session limit exceeded.
 * For API-based models: checks if authenticated and not rate-limited.
 */
export async function checkModelHealth(
    model: ModelHealthCheckable
): Promise<HealthCheckResult> {
    const hasSessionLimits = model.hasSessionLimits();
    const suggestedCooldown = undefined;

    try {
        // Send minimal single-token request
        const minimalContext: OpenAIContext = {
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'hi' }]
                }
            ],
            maxTokens: 1
        };

        const response = await model.sendRequest(minimalContext);
        const remainingQuota = extractRemainingQuota(response);

        return {
            available: true,
            remainingQuota,
            hasSessionLimits,
            suggestedCooldown
        };
    } catch (error) {
        const errorInfo = parseHealthCheckError(error, model.errorHandler);

        return {
            available: false,
            error: error instanceof Error ? error.message : String(error),
            hasSessionLimits,
            errorType: errorInfo.errorType,
            suggestedCooldown: errorInfo.retryAfter || suggestedCooldown
        };
    }
}

/**
 * Extract remaining quota from response metadata/headers
 * STATELESS - just parses the response, doesn't track anything
 */
export function extractRemainingQuota(response: ModelResponse): number | undefined {
    const headers = response.metadata?.custom?.headers as Record<string, string> | undefined;
    if (!headers) return undefined;

    // OpenAI format
    const openaiRemaining = headers['x-ratelimit-remaining-requests'];
    if (openaiRemaining) return parseInt(openaiRemaining);

    // Anthropic format
    const anthropicRemaining = headers['anthropic-ratelimit-requests-remaining'];
    if (anthropicRemaining) return parseInt(anthropicRemaining);

    return undefined;
}

/**
 * Parse error from health check to determine error type and retry timing
 */
function parseHealthCheckError(
    error: unknown,
    errorHandler?: IErrorHandler
): { errorType: 'session_limit' | 'rate_limit' | 'auth' | 'other'; retryAfter?: number } {
    let errorType: 'session_limit' | 'rate_limit' | 'auth' | 'other' = 'other';
    let retryAfter: number | undefined;

    // Try error handler first
    if (errorHandler) {
        const errorContext = {
            originalError: error instanceof Error ? error : new Error(String(error)),
            body: undefined,
            headers: undefined
        };

        const parsed = errorHandler.parseError(errorContext);

        // Check error code to determine type
        const errorCode = parsed.modelError.code;
        if (errorCode === 'session_limit_exceeded') {
            errorType = 'session_limit';
        } else if (errorCode === 'rate_limit_exceeded') {
            errorType = 'rate_limit';
        } else if (errorCode === 'auth_failed' || errorCode === 'invalid_api_key') {
            errorType = 'auth';
        }

        // Extract retry-after from error if available
        retryAfter = errorHandler.getRetryAfter?.(errorContext);
    } else {
        // Fallback: check error message
        const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

        if (
            errorMsg.includes('session limit') ||
            errorMsg.includes('daily limit') ||
            errorMsg.includes('quota exceeded') ||
            errorMsg.includes('message limit')
        ) {
            errorType = 'session_limit';
        } else if (
            errorMsg.includes('rate limit') ||
            errorMsg.includes('too many requests') ||
            errorMsg.includes('429')
        ) {
            errorType = 'rate_limit';
        } else if (
            errorMsg.includes('unauthorized') ||
            errorMsg.includes('authentication') ||
            errorMsg.includes('invalid api key') ||
            errorMsg.includes('401')
        ) {
            errorType = 'auth';
        }
    }

    return { errorType, retryAfter };
}
