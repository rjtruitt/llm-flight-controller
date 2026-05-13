/**
 * Base error class for all LLM Flight Controller errors
 *
 * @aiInstruction
 * All errors in this library extend from LLMError. Check error.code for specific error types.
 * Always includes context data for debugging. Never catch and discard - these contain actionable information.
 *
 * @aiExample
 * try {
 *   await model.chat(messages);
 * } catch (error) {
 *   if (error instanceof RateLimitError) {
 *     console.log(`Rate limited. Retry after ${error.retryAfter}ms`);
 *     console.log(`Context:`, error.context);
 *   } else if (error instanceof AuthenticationError) {
 *     console.error(`Auth failed: ${error.message}`);
 *   }
 * }
 */
export abstract class LLMError extends Error {
    /**
     * Machine-readable error code (e.g., 'RATE_LIMIT_EXCEEDED', 'AUTH_FAILED')
     */
    public readonly code: string;

    /**
     * Additional context data for debugging
     */
    public readonly context: Record<string, unknown>;

    /**
     * Original error if this wraps another error
     */
    public readonly cause?: Error;

    constructor(
        code: string,
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.context = context;
        this.cause = cause;

        // Maintains proper stack trace for where error was thrown (V8 only)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Serialize error to JSON for logging/debugging
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
            stack: this.stack,
            cause: this.cause?.message
        };
    }
}

/**
 * Thrown when API rate limits are exceeded
 *
 * @aiInstruction
 * Contains retryAfter (ms) for exponential backoff. Check context.remainingRequests for quota info.
 */
export class RateLimitError extends LLMError {
    /**
     * Milliseconds until rate limit resets (if known)
     */
    public readonly retryAfter?: number;

    constructor(
        message: string,
        context: Record<string, unknown> = {},
        retryAfter?: number,
        cause?: Error
    ) {
        super('RATE_LIMIT_EXCEEDED', message, context, cause);
        this.retryAfter = retryAfter;
    }
}

/**
 * Thrown when authentication fails or credentials are invalid
 *
 * @aiInstruction
 * Check context.provider to know which service failed. Often means API key is missing/invalid or SSO token expired.
 */
export class AuthenticationError extends LLMError {
    constructor(
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('AUTH_FAILED', message, context, cause);
    }
}

/**
 * Thrown when input validation fails
 *
 * @aiInstruction
 * Check context.field to know which parameter is invalid. Contains context.value for debugging.
 */
export class ValidationError extends LLMError {
    public readonly field: string;

    constructor(
        field: string,
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('VALIDATION_FAILED', message, { ...context, field }, cause);
        this.field = field;
    }
}

/**
 * Thrown when a model is not found or not registered
 *
 * @aiInstruction
 * Check context.modelId for the requested model. Use ModelRegistry.listModels() to see available models.
 */
export class ModelNotFoundError extends LLMError {
    public readonly modelId: string;

    constructor(
        modelId: string,
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('MODEL_NOT_FOUND', message, { ...context, modelId }, cause);
        this.modelId = modelId;
    }
}

/**
 * Thrown when provider-specific operation fails
 *
 * @aiInstruction
 * Check context.provider and context.statusCode. Original provider error in cause property.
 */
export class ProviderError extends LLMError {
    public readonly provider: string;
    public readonly statusCode?: number;

    constructor(
        provider: string,
        message: string,
        context: Record<string, unknown> = {},
        statusCode?: number,
        cause?: Error
    ) {
        super('PROVIDER_ERROR', message, { ...context, provider, statusCode }, cause);
        this.provider = provider;
        this.statusCode = statusCode;
    }
}

/**
 * Thrown when context window is exceeded
 *
 * @aiInstruction
 * Check context.requestedTokens vs context.maxTokens. Need to truncate messages or use smaller model.
 */
export class ContextLengthError extends LLMError {
    public readonly requestedTokens: number;
    public readonly maxTokens: number;

    constructor(
        requestedTokens: number,
        maxTokens: number,
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super(
            'CONTEXT_LENGTH_EXCEEDED',
            message,
            { ...context, requestedTokens, maxTokens },
            cause
        );
        this.requestedTokens = requestedTokens;
        this.maxTokens = maxTokens;
    }
}

/**
 * Thrown when network request fails
 *
 * @aiInstruction
 * Usually transient. Check context.attemptNumber for retry count. Safe to retry with exponential backoff.
 */
export class NetworkError extends LLMError {
    constructor(
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('NETWORK_ERROR', message, context, cause);
    }
}

/**
 * Thrown when response parsing fails
 *
 * @aiInstruction
 * Provider returned malformed response. Check context.rawResponse for debugging. Usually indicates API change.
 */
export class ParseError extends LLMError {
    constructor(
        message: string,
        context: Record<string, unknown> = {},
        cause?: Error
    ) {
        super('PARSE_ERROR', message, context, cause);
    }
}
