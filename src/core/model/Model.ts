/**
 * Model - Base model class integrating all components
 *
 * @aiInstruction
 * Base class for all LLM models. Handles authentication, rate limiting, token limits, pricing, and usage tracking.
 * Subclasses must implement sendRequest() for provider-specific API calls and estimateTokens() for token counting.
 * Use checkHealth() to probe model availability without affecting rate limits.
 *
 * @aiExample
 * class MyModel extends Model {
 *   protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
 *     // Provider-specific API call
 *   }
 *   protected estimateTokens(context: OpenAIContext) {
 *     return { input: 100, output: 50 };
 *   }
 * }
 */

import { ModelIdentity } from './ModelIdentity';
import { IAuthProvider } from '../../auth/IAuthProvider';
import { ModelCapabilities } from '../types/Capabilities';
import { IRateLimiter } from '../limits/IRateLimiter';
import { ISessionLimiter } from '../limits/ISessionLimiter';
import { ITokenLimiter } from '../limits/ITokenLimiter';
import { IPricingTracker } from '../pricing/IPricingTracker';
import { IStatsTracker } from '../stats/IStatsTracker';
import { IErrorHandler } from '../errors/IErrorHandler';
import { BlockerEvent, IBlockerHandler } from '../events/BlockerEvent';
import { OpenAIContext } from '../types/Context';
import { ModelResponse } from '../types/Response';
import { RateLimitError, AuthenticationError } from '../errors/LLMError';
import { checkModelHealth, extractRemainingQuota, HealthCheckResult } from './ModelHealth';
import { ModelLimitChecker } from './ModelLimitChecker';
import { ModelUsageRecorder } from './ModelUsageRecorder';
import { ModelBlockerEventFactory } from './ModelBlockerEventFactory';

export interface ModelLimits {
    rate?: IRateLimiter;
    session?: ISessionLimiter;
    token?: ITokenLimiter;
}

export interface RetryConfig {
    /** Maximum number of retry attempts for rate limit errors (default: 3) */
    maxRetries?: number;
    /** Total timeout in milliseconds for all retries (default: 300000 / 5 minutes) */
    timeoutMs?: number;
    /** Maximum wait time between retries in milliseconds (default: 60000 / 60 seconds) */
    maxBackoffMs?: number;
    /** Base delay for exponential backoff in milliseconds (default: 1000 / 1 second) */
    baseBackoffMs?: number;
}

export interface ModelConfig {
    identity: ModelIdentity;
    auth: IAuthProvider;
    capabilities: ModelCapabilities;
    limits?: ModelLimits;
    pricing?: IPricingTracker;
    stats?: IStatsTracker;
    errorHandler?: IErrorHandler;
    retry?: RetryConfig;
}

export abstract class Model {
    protected readonly identity: ModelIdentity;
    protected readonly auth: IAuthProvider;
    protected readonly capabilities: ModelCapabilities;
    protected readonly limits: ModelLimits;
    protected readonly pricing?: IPricingTracker;
    protected readonly stats?: IStatsTracker;
    protected readonly errorHandler?: IErrorHandler;
    protected readonly retryConfig: Required<RetryConfig>;
    protected blockerHandler?: IBlockerHandler;
    private limitChecker: ModelLimitChecker;
    private usageRecorder: ModelUsageRecorder;

    constructor(config: ModelConfig) {
        this.identity = config.identity;
        this.auth = config.auth;
        this.capabilities = config.capabilities;
        this.limits = config.limits || {};
        this.pricing = config.pricing;
        this.stats = config.stats;
        this.errorHandler = config.errorHandler;

        // Set retry config with defaults
        this.retryConfig = {
            maxRetries: config.retry?.maxRetries ?? 3,
            timeoutMs: config.retry?.timeoutMs ?? 300000, // 5 minutes
            maxBackoffMs: config.retry?.maxBackoffMs ?? 60000, // 60 seconds
            baseBackoffMs: config.retry?.baseBackoffMs ?? 1000 // 1 second
        };

        this.limitChecker = new ModelLimitChecker({
            identity: this.identity,
            auth: this.auth,
            rateLimiter: this.limits.rate,
            sessionLimiter: this.limits.session,
            tokenLimiter: this.limits.token,
            pricingTracker: this.pricing,
            blockerHandler: this.blockerHandler,
            estimateTokens: this.estimateTokens.bind(this)
        });

        this.usageRecorder = new ModelUsageRecorder({
            stats: this.stats,
            rateLimiter: this.limits.rate,
            sessionLimiter: this.limits.session,
            pricingTracker: this.pricing
        });
    }

    setBlockerHandler(handler: IBlockerHandler): void {
        this.blockerHandler = handler;
        // Update limit checker with new handler
        this.limitChecker = new ModelLimitChecker({
            identity: this.identity,
            auth: this.auth,
            rateLimiter: this.limits.rate,
            sessionLimiter: this.limits.session,
            tokenLimiter: this.limits.token,
            pricingTracker: this.pricing,
            blockerHandler: handler,
            estimateTokens: this.estimateTokens.bind(this)
        });
    }

    getIdentity(): ModelIdentity {
        return this.identity;
    }

    getCapabilities(): ModelCapabilities {
        return this.capabilities;
    }

    getStats(): IStatsTracker | undefined {
        return this.stats;
    }

    /**
     * Check if model is healthy and available RIGHT NOW
     *
     * STATELESS - just probes the model, doesn't track history or cooldowns
     * Your orchestrator decides what to do with this information
     */
    async checkHealth(): Promise<HealthCheckResult> {
        return checkModelHealth({
            sendRequest: this.sendRequest.bind(this),
            errorHandler: this.errorHandler,
            hasSessionLimits: () => !!this.limits.session
        });
    }

    /**
     * Extract remaining quota from response metadata/headers
     * STATELESS - just parses the response, doesn't track anything
     */
    extractRemainingQuota(response: ModelResponse): number | undefined {
        return extractRemainingQuota(response);
    }

    /**
     * Get session limit configuration (if configured)
     * Returns the cooldown duration configured in model config
     */
    getSessionLimitConfig(): { cooldownDuration?: number; hasSessionLimits: boolean } | undefined {
        const sessionLimit = this.limits.session;
        if (!sessionLimit) return undefined;

        return {
            cooldownDuration: undefined, // Not exposed in ISessionLimiter interface
            hasSessionLimits: true
        };
    }

    /**
     * Send message with automatic rate limit retry
     *
     * @param context - OpenAI-compatible context
     * @param options - Override retry configuration for this request
     * @returns Model response
     */
    async sendMessage(context: OpenAIContext, options?: Partial<RetryConfig>): Promise<ModelResponse> {
        const startTime = Date.now();

        // Merge options with instance config
        const config: Required<RetryConfig> = {
            maxRetries: options?.maxRetries ?? this.retryConfig.maxRetries,
            timeoutMs: options?.timeoutMs ?? this.retryConfig.timeoutMs,
            maxBackoffMs: options?.maxBackoffMs ?? this.retryConfig.maxBackoffMs,
            baseBackoffMs: options?.baseBackoffMs ?? this.retryConfig.baseBackoffMs
        };

        let lastError: Error | undefined;

        for (let attempt = 0; attempt < config.maxRetries; attempt++) {
            // Check if we've exceeded total timeout
            if (Date.now() - startTime > config.timeoutMs) {
                throw new Error(`Request timed out after ${config.timeoutMs}ms across ${attempt} retries`);
            }

            try {
                await this.limitChecker.checkAllLimits(context);

                const response = await this.sendRequest(context);
                this.usageRecorder.recordSuccess(response, Date.now() - startTime);

                return response;
            } catch (error) {
                const errorObj = error instanceof Error ? error : new Error(String(error));
                lastError = errorObj;
                this.usageRecorder.recordFailure(errorObj, Date.now() - startTime);

                if (error instanceof RateLimitError) {
                    // Emit blocker event
                    this.emitBlockerEvent(ModelBlockerEventFactory.createFromError(errorObj));

                    // If this is the last retry, throw
                    if (attempt === config.maxRetries - 1) {
                        throw error;
                    }

                    // Wait as recommended by rate limiter, or use exponential backoff
                    const rateLimitError = error as RateLimitError;
                    const waitMs = rateLimitError.retryAfter
                        ? Math.min(rateLimitError.retryAfter, config.maxBackoffMs)
                        : Math.min(config.baseBackoffMs * Math.pow(2, attempt), config.maxBackoffMs);

                    // Don't wait if it would exceed timeout
                    if (Date.now() - startTime + waitMs > config.timeoutMs) {
                        throw new Error(`Cannot retry: would exceed timeout (${config.timeoutMs}ms)`);
                    }

                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                    continue; // Retry
                }

                if (error instanceof AuthenticationError) {
                    this.emitBlockerEvent(ModelBlockerEventFactory.createFromError(errorObj));
                    // Don't retry auth errors - they need user intervention
                    throw error;
                }

                // Other errors - throw immediately
                throw error;
            }
        }

        // All retries exhausted
        throw lastError || new Error('Request failed after all retries');
    }

    protected abstract sendRequest(context: OpenAIContext): Promise<ModelResponse>;
    protected abstract estimateTokens(context: OpenAIContext): { input: number; output: number };

    private emitBlockerEvent(event: BlockerEvent): void {
        if (this.blockerHandler) {
            this.blockerHandler.handleBlocker(event);
        }
    }
}
