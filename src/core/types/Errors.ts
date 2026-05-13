/**
 * Error Types - Standardized error codes and error classes
 *
 * @aiInstructions
 * Use these error types for consistent error handling across all providers.
 * Each error has a code, message, and optional retry information.
 *
 * @aiExample
 * ```typescript
 * try {
 *   await model.sendMessage(context);
 * } catch (error) {
 *   if (error instanceof RateLimitError) {
 *     console.log(`Rate limited, retry after ${error.retryAfterMs}ms`);
 *     await sleep(error.retryAfterMs);
 *   } else if (error instanceof ModelError && error.retryable) {
 *     console.log('Retryable error, trying again...');
 *   }
 * }
 * ```
 */

/**
 * Error codes
 */
export enum ErrorCode {
    // Rate limiting
    RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
    TOKEN_LIMIT_EXCEEDED = 'token_limit_exceeded',
    SESSION_LIMIT_EXCEEDED = 'session_limit_exceeded',

    // Authentication
    AUTH_FAILED = 'auth_failed',
    INVALID_API_KEY = 'invalid_api_key',
    INSUFFICIENT_QUOTA = 'insufficient_quota',

    // Validation
    INVALID_REQUEST = 'invalid_request',
    INVALID_MODEL = 'invalid_model',
    INVALID_CONTEXT = 'invalid_context',
    INVALID_TOOL = 'invalid_tool',

    // Model errors
    MODEL_NOT_FOUND = 'model_not_found',
    MODEL_OVERLOADED = 'model_overloaded',
    MODEL_TIMEOUT = 'model_timeout',
    CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded',

    // Provider errors
    PROVIDER_ERROR = 'provider_error',
    PROVIDER_UNAVAILABLE = 'provider_unavailable',
    NETWORK_ERROR = 'network_error',

    // Content
    CONTENT_FILTERED = 'content_filtered',
    UNSAFE_CONTENT = 'unsafe_content',

    // Internal
    INTERNAL_ERROR = 'internal_error',
    UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Base model error
 */
export class ModelError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly retryable: boolean = false,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'ModelError';
        Object.setPrototypeOf(this, ModelError.prototype);
    }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends ModelError {
    constructor(
        message: string,
        public readonly retryAfterMs?: number,
        public readonly limitType?: 'tpm' | 'rpm' | 'session'
    ) {
        super(ErrorCode.RATE_LIMIT_EXCEEDED, message, true);
        this.name = 'RateLimitError';
        Object.setPrototypeOf(this, RateLimitError.prototype);
    }
}

/**
 * Authentication error
 */
export class AuthenticationError extends ModelError {
    constructor(message: string, originalError?: Error) {
        super(ErrorCode.AUTH_FAILED, message, false, originalError);
        this.name = 'AuthenticationError';
        Object.setPrototypeOf(this, AuthenticationError.prototype);
    }
}

/**
 * Validation error
 */
export class ValidationError extends ModelError {
    constructor(message: string, code: ErrorCode = ErrorCode.INVALID_REQUEST) {
        super(code, message, false);
        this.name = 'ValidationError';
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

/**
 * Provider error
 */
export class ProviderError extends ModelError {
    constructor(
        message: string,
        public readonly providerName: string,
        retryable: boolean = true,
        originalError?: Error
    ) {
        super(ErrorCode.PROVIDER_ERROR, message, retryable, originalError);
        this.name = 'ProviderError';
        Object.setPrototypeOf(this, ProviderError.prototype);
    }
}

/**
 * Timeout error
 */
export class TimeoutError extends ModelError {
    constructor(message: string, public readonly timeoutMs: number) {
        super(ErrorCode.MODEL_TIMEOUT, message, true);
        this.name = 'TimeoutError';
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}

/**
 * Content filter error
 */
export class ContentFilterError extends ModelError {
    constructor(message: string) {
        super(ErrorCode.CONTENT_FILTERED, message, false);
        this.name = 'ContentFilterError';
        Object.setPrototypeOf(this, ContentFilterError.prototype);
    }
}
