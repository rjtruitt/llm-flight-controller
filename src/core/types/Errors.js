"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentFilterError = exports.TimeoutError = exports.ProviderError = exports.ValidationError = exports.AuthenticationError = exports.RateLimitError = exports.ModelError = exports.ErrorCode = void 0;
/**
 * Error codes
 */
var ErrorCode;
(function (ErrorCode) {
    // Rate limiting
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "rate_limit_exceeded";
    ErrorCode["TOKEN_LIMIT_EXCEEDED"] = "token_limit_exceeded";
    ErrorCode["SESSION_LIMIT_EXCEEDED"] = "session_limit_exceeded";
    // Authentication
    ErrorCode["AUTH_FAILED"] = "auth_failed";
    ErrorCode["INVALID_API_KEY"] = "invalid_api_key";
    ErrorCode["INSUFFICIENT_QUOTA"] = "insufficient_quota";
    // Validation
    ErrorCode["INVALID_REQUEST"] = "invalid_request";
    ErrorCode["INVALID_MODEL"] = "invalid_model";
    ErrorCode["INVALID_CONTEXT"] = "invalid_context";
    ErrorCode["INVALID_TOOL"] = "invalid_tool";
    // Model errors
    ErrorCode["MODEL_NOT_FOUND"] = "model_not_found";
    ErrorCode["MODEL_OVERLOADED"] = "model_overloaded";
    ErrorCode["MODEL_TIMEOUT"] = "model_timeout";
    ErrorCode["CONTEXT_LENGTH_EXCEEDED"] = "context_length_exceeded";
    // Provider errors
    ErrorCode["PROVIDER_ERROR"] = "provider_error";
    ErrorCode["PROVIDER_UNAVAILABLE"] = "provider_unavailable";
    ErrorCode["NETWORK_ERROR"] = "network_error";
    // Content
    ErrorCode["CONTENT_FILTERED"] = "content_filtered";
    ErrorCode["UNSAFE_CONTENT"] = "unsafe_content";
    // Internal
    ErrorCode["INTERNAL_ERROR"] = "internal_error";
    ErrorCode["UNKNOWN_ERROR"] = "unknown_error";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
/**
 * Base model error
 */
class ModelError extends Error {
    constructor(code, message, retryable = false, originalError) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.originalError = originalError;
        this.name = 'ModelError';
        Object.setPrototypeOf(this, ModelError.prototype);
    }
}
exports.ModelError = ModelError;
/**
 * Rate limit exceeded error
 */
class RateLimitError extends ModelError {
    constructor(message, retryAfterMs, limitType) {
        super(ErrorCode.RATE_LIMIT_EXCEEDED, message, true);
        this.retryAfterMs = retryAfterMs;
        this.limitType = limitType;
        this.name = 'RateLimitError';
        Object.setPrototypeOf(this, RateLimitError.prototype);
    }
}
exports.RateLimitError = RateLimitError;
/**
 * Authentication error
 */
class AuthenticationError extends ModelError {
    constructor(message, originalError) {
        super(ErrorCode.AUTH_FAILED, message, false, originalError);
        this.name = 'AuthenticationError';
        Object.setPrototypeOf(this, AuthenticationError.prototype);
    }
}
exports.AuthenticationError = AuthenticationError;
/**
 * Validation error
 */
class ValidationError extends ModelError {
    constructor(message, code = ErrorCode.INVALID_REQUEST) {
        super(code, message, false);
        this.name = 'ValidationError';
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}
exports.ValidationError = ValidationError;
/**
 * Provider error
 */
class ProviderError extends ModelError {
    constructor(message, providerName, retryable = true, originalError) {
        super(ErrorCode.PROVIDER_ERROR, message, retryable, originalError);
        this.providerName = providerName;
        this.name = 'ProviderError';
        Object.setPrototypeOf(this, ProviderError.prototype);
    }
}
exports.ProviderError = ProviderError;
/**
 * Timeout error
 */
class TimeoutError extends ModelError {
    constructor(message, timeoutMs) {
        super(ErrorCode.MODEL_TIMEOUT, message, true);
        this.timeoutMs = timeoutMs;
        this.name = 'TimeoutError';
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}
exports.TimeoutError = TimeoutError;
/**
 * Content filter error
 */
class ContentFilterError extends ModelError {
    constructor(message) {
        super(ErrorCode.CONTENT_FILTERED, message, false);
        this.name = 'ContentFilterError';
        Object.setPrototypeOf(this, ContentFilterError.prototype);
    }
}
exports.ContentFilterError = ContentFilterError;
//# sourceMappingURL=Errors.js.map