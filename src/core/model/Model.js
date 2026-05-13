"use strict";
/**
 * Model - Base model class integrating all components
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model = void 0;
const BlockerEvent_1 = require("../events/BlockerEvent");
const Errors_1 = require("../types/Errors");
class Model {
    constructor(config) {
        this.identity = config.identity;
        this.auth = config.auth;
        this.capabilities = config.capabilities;
        this.limits = config.limits || {};
        this.pricing = config.pricing;
        this.stats = config.stats;
        this.errorHandler = config.errorHandler;
    }
    setBlockerHandler(handler) {
        this.blockerHandler = handler;
    }
    getIdentity() {
        return this.identity;
    }
    getCapabilities() {
        return this.capabilities;
    }
    getStats() {
        return this.stats;
    }
    /**
     * Check if model is healthy and available RIGHT NOW
     *
     * STATELESS - just probes the model, doesn't track history or cooldowns
     * Your orchestrator decides what to do with this information
     *
     * For session-limited models: checks if session limit exceeded
     * For API-based models: checks if authenticated and not rate-limited
     *
     * Returns current availability status
     */
    async checkHealth() {
        // Check if model has session limits configured
        const sessionLimit = this.limits.session;
        const hasSessionLimits = !!sessionLimit;
        const suggestedCooldown = undefined; // Not exposed in interface
        try {
            // Send minimal single-token request
            const minimalContext = {
                messages: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'hi' }]
                    }
                ],
                maxTokens: 1 // Request only 1 token output
            };
            // Bypass rate limit checks for health check (we want to test actual availability)
            const response = await this.sendRequest(minimalContext);
            // Extract remaining quota from response headers if available
            const remainingQuota = this.extractRemainingQuota(response);
            return {
                available: true,
                remainingQuota,
                hasSessionLimits,
                suggestedCooldown
            };
        }
        catch (error) {
            // Determine error type
            let errorType = 'other';
            let retryAfter;
            // Try error handler first
            if (this.errorHandler) {
                const errorContext = {
                    originalError: error instanceof Error ? error : new Error(String(error)),
                    body: undefined,
                    headers: undefined
                };
                const parsed = this.errorHandler.parseError(errorContext);
                // Check error code to determine type
                const errorCode = parsed.modelError.code;
                if (errorCode === 'session_limit_exceeded') {
                    errorType = 'session_limit';
                }
                else if (errorCode === 'rate_limit_exceeded') {
                    errorType = 'rate_limit';
                }
                else if (errorCode === 'auth_failed' || errorCode === 'invalid_api_key') {
                    errorType = 'auth';
                }
                // Extract retry-after from error if available
                retryAfter = this.errorHandler.getRetryAfter?.(errorContext);
            }
            else {
                // Fallback: check error message
                const errorMsg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
                if (errorMsg.includes('session limit') ||
                    errorMsg.includes('daily limit') ||
                    errorMsg.includes('quota exceeded') ||
                    errorMsg.includes('message limit')) {
                    errorType = 'session_limit';
                }
                else if (errorMsg.includes('rate limit') ||
                    errorMsg.includes('too many requests') ||
                    errorMsg.includes('429')) {
                    errorType = 'rate_limit';
                }
                else if (errorMsg.includes('unauthorized') ||
                    errorMsg.includes('authentication') ||
                    errorMsg.includes('invalid api key') ||
                    errorMsg.includes('401')) {
                    errorType = 'auth';
                }
            }
            return {
                available: false,
                error: error instanceof Error ? error.message : String(error),
                hasSessionLimits,
                errorType,
                suggestedCooldown: retryAfter || suggestedCooldown
            };
        }
    }
    /**
     * Extract remaining quota from response metadata/headers
     * STATELESS - just parses the response, doesn't track anything
     */
    extractRemainingQuota(response) {
        const headers = response.metadata?.custom?.headers;
        if (!headers)
            return undefined;
        // OpenAI format
        const openaiRemaining = headers['x-ratelimit-remaining-requests'];
        if (openaiRemaining)
            return parseInt(openaiRemaining);
        // Anthropic format
        const anthropicRemaining = headers['anthropic-ratelimit-requests-remaining'];
        if (anthropicRemaining)
            return parseInt(anthropicRemaining);
        return undefined;
    }
    /**
     * Get session limit configuration (if configured)
     * Returns the cooldown duration configured in model config
     */
    getSessionLimitConfig() {
        const sessionLimit = this.limits.session;
        if (!sessionLimit)
            return undefined;
        return {
            cooldownDuration: undefined, // Not exposed in ISessionLimiter interface
            hasSessionLimits: true
        };
    }
    async sendMessage(context) {
        const startTime = Date.now();
        try {
            await this.checkAuthentication();
            await this.checkRateLimits(context);
            this.checkTokenLimits(context);
            this.checkPricingBudget(context);
            const response = await this.sendRequest(context);
            this.recordUsage(response, Date.now() - startTime);
            return response;
        }
        catch (error) {
            if (this.stats) {
                this.stats.recordRequest({
                    latencyMs: Date.now() - startTime,
                    success: false,
                    error: error instanceof Error ? error : new Error(String(error))
                });
            }
            if (error instanceof Errors_1.RateLimitError || error instanceof Errors_1.AuthenticationError) {
                this.emitBlockerEvent(this.createBlockerFromError(error));
            }
            throw error;
        }
    }
    async checkAuthentication() {
        if (!this.auth.isAuthenticated()) {
            if (this.auth.initialize) {
                await this.auth.initialize();
            }
            if (!this.auth.isAuthenticated()) {
                const blockerEvent = {
                    type: BlockerEvent_1.BlockerType.AUTH_REQUIRED,
                    severity: 'critical',
                    blocking: true,
                    message: `Authentication required for ${this.identity.displayName}`,
                    suggestedActions: [BlockerEvent_1.BlockerAction.AUTHENTICATE]
                };
                this.emitBlockerEvent(blockerEvent);
                throw new Errors_1.AuthenticationError('Authentication required');
            }
        }
    }
    async checkRateLimits(context) {
        const tokenEstimate = this.estimateTokens(context);
        if (this.limits.rate) {
            const rateCheck = this.limits.rate.checkLimit({
                tokens: tokenEstimate.input + tokenEstimate.output,
                requests: 1
            });
            if (!rateCheck.allowed) {
                const blockerEvent = {
                    type: BlockerEvent_1.BlockerType.RATE_LIMIT_EXCEEDED,
                    severity: 'warning',
                    blocking: true,
                    message: rateCheck.reason || 'Rate limit exceeded',
                    suggestedActions: [BlockerEvent_1.BlockerAction.WAIT, BlockerEvent_1.BlockerAction.SWITCH_MODEL],
                    data: {
                        waitMs: rateCheck.waitMs,
                        currentUsage: rateCheck.usage
                    }
                };
                this.emitBlockerEvent(blockerEvent);
                throw new Errors_1.RateLimitError(blockerEvent.message, rateCheck.waitMs);
            }
            if (this.limits.rate.isApproachingLimit()) {
                this.emitBlockerEvent({
                    type: BlockerEvent_1.BlockerType.RATE_LIMIT_WARNING,
                    severity: 'info',
                    blocking: false,
                    message: `Approaching rate limit for ${this.identity.displayName}`,
                    suggestedActions: [BlockerEvent_1.BlockerAction.SWITCH_MODEL]
                });
            }
        }
        if (this.limits.session) {
            const sessionCheck = this.limits.session.checkLimit({ tokens: tokenEstimate.input });
            if (!sessionCheck.allowed) {
                const blockerEvent = {
                    type: BlockerEvent_1.BlockerType.SESSION_LIMIT_EXCEEDED,
                    severity: 'error',
                    blocking: true,
                    message: sessionCheck.reason || 'Session limit exceeded',
                    suggestedActions: [BlockerEvent_1.BlockerAction.SWITCH_MODEL],
                    data: {
                        resetAt: sessionCheck.resetAt
                    }
                };
                this.emitBlockerEvent(blockerEvent);
                throw new Errors_1.RateLimitError(blockerEvent.message, undefined, 'session');
            }
        }
    }
    checkTokenLimits(context) {
        if (!this.limits.token) {
            return;
        }
        const tokenEstimate = this.estimateTokens(context);
        const tokenCheck = this.limits.token.checkLimit({
            inputTokens: tokenEstimate.input,
            requestedOutputTokens: tokenEstimate.output
        });
        if (!tokenCheck.allowed) {
            const blockerEvent = {
                type: BlockerEvent_1.BlockerType.CONTEXT_TOO_LARGE,
                severity: 'error',
                blocking: true,
                message: tokenCheck.reason || 'Context too large',
                suggestedActions: [BlockerEvent_1.BlockerAction.COMPRESS_CONTEXT, BlockerEvent_1.BlockerAction.SWITCH_MODEL],
                data: {
                    currentTokens: tokenEstimate.input,
                    maxTokens: tokenCheck.usage?.contextLimit
                }
            };
            this.emitBlockerEvent(blockerEvent);
            throw new Error(blockerEvent.message);
        }
    }
    checkPricingBudget(context) {
        if (!this.pricing) {
            return;
        }
        const tokenEstimate = this.estimateTokens(context);
        const estimatedCost = this.pricing.calculateCost({
            inputTokens: tokenEstimate.input,
            outputTokens: tokenEstimate.output,
            totalTokens: tokenEstimate.input + tokenEstimate.output
        });
        const budgetCheck = this.pricing.checkBudget(estimatedCost);
        if (!budgetCheck.allowed) {
            const blockerEvent = {
                type: BlockerEvent_1.BlockerType.DAILY_LIMIT_EXCEEDED,
                severity: 'error',
                blocking: true,
                message: budgetCheck.reason || 'Budget exceeded',
                suggestedActions: [BlockerEvent_1.BlockerAction.SWITCH_MODEL, BlockerEvent_1.BlockerAction.CANCEL],
                data: {
                    metadata: {
                        currentCost: budgetCheck.currentCost,
                        limit: budgetCheck.limit,
                        estimatedCost
                    }
                }
            };
            this.emitBlockerEvent(blockerEvent);
            throw new Error(blockerEvent.message);
        }
    }
    recordUsage(response, latencyMs) {
        if (this.stats && response.usage) {
            this.stats.recordRequest({
                latencyMs,
                tokens: response.usage.inputTokens + response.usage.outputTokens,
                success: true
            });
        }
        if (this.limits.rate && response.usage) {
            this.limits.rate.recordUsage({
                tokens: response.usage.inputTokens + response.usage.outputTokens,
                requests: 1
            });
        }
        if (this.limits.session && response.usage) {
            this.limits.session.recordUsage({ tokens: response.usage.inputTokens });
        }
        if (this.pricing && response.usage) {
            this.pricing.recordUsage(response.usage);
        }
    }
    emitBlockerEvent(event) {
        if (this.blockerHandler) {
            this.blockerHandler.handleBlocker(event);
        }
    }
    createBlockerFromError(error) {
        if (error instanceof Errors_1.RateLimitError) {
            return {
                type: BlockerEvent_1.BlockerType.RATE_LIMIT_EXCEEDED,
                severity: 'warning',
                blocking: true,
                message: error.message,
                suggestedActions: [BlockerEvent_1.BlockerAction.WAIT, BlockerEvent_1.BlockerAction.SWITCH_MODEL],
                data: { waitMs: error.retryAfterMs }
            };
        }
        if (error instanceof Errors_1.AuthenticationError) {
            return {
                type: BlockerEvent_1.BlockerType.AUTH_REQUIRED,
                severity: 'critical',
                blocking: true,
                message: error.message,
                suggestedActions: [BlockerEvent_1.BlockerAction.AUTHENTICATE]
            };
        }
        return {
            type: BlockerEvent_1.BlockerType.MODEL_ERROR,
            severity: 'error',
            blocking: true,
            message: error.message,
            suggestedActions: [BlockerEvent_1.BlockerAction.RETRY, BlockerEvent_1.BlockerAction.SWITCH_MODEL]
        };
    }
}
exports.Model = Model;
//# sourceMappingURL=Model.js.map