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

export interface ModelConfig {
    identity: ModelIdentity;
    auth: IAuthProvider;
    capabilities: ModelCapabilities;
    limits?: ModelLimits;
    pricing?: IPricingTracker;
    stats?: IStatsTracker;
    errorHandler?: IErrorHandler;
}

export abstract class Model {
    protected readonly identity: ModelIdentity;
    protected readonly auth: IAuthProvider;
    protected readonly capabilities: ModelCapabilities;
    protected readonly limits: ModelLimits;
    protected readonly pricing?: IPricingTracker;
    protected readonly stats?: IStatsTracker;
    protected readonly errorHandler?: IErrorHandler;
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

    async sendMessage(context: OpenAIContext): Promise<ModelResponse> {
        const startTime = Date.now();

        try {
            await this.limitChecker.checkAllLimits(context);

            const response = await this.sendRequest(context);
            this.usageRecorder.recordSuccess(response, Date.now() - startTime);

            return response;
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            this.usageRecorder.recordFailure(errorObj, Date.now() - startTime);

            if (error instanceof RateLimitError || error instanceof AuthenticationError) {
                this.emitBlockerEvent(ModelBlockerEventFactory.createFromError(errorObj));
            }

            throw error;
        }
    }

    protected abstract sendRequest(context: OpenAIContext): Promise<ModelResponse>;
    protected abstract estimateTokens(context: OpenAIContext): { input: number; output: number };

    private emitBlockerEvent(event: BlockerEvent): void {
        if (this.blockerHandler) {
            this.blockerHandler.handleBlocker(event);
        }
    }
}
