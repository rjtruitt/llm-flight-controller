/**
 * Bottleneck-based Rate Limiter for LLM APIs
 *
 * Uses the battle-tested bottleneck library (44M downloads/month) for:
 * - RPM (requests per minute) limiting
 * - TPM (tokens per minute) limiting with weighted jobs
 * - Automatic reservoir refills
 * - Cross-process coordination (via Redis)
 */

import Bottleneck from 'bottleneck';
import { EventEmitter } from 'events';

export interface BottleneckLimitConfig {
    /** Requests per minute limit */
    rpm?: number;
    /** Tokens per minute limit */
    tpm?: number;
    /** Maximum concurrent requests */
    maxConcurrent?: number;
    /** Minimum time between requests (ms) */
    minTime?: number;
    /** Enable adaptive learning - adjusts limits when throttled */
    enableAdaptive?: boolean;
    /** Callback when limits are adapted */
    onLimitChanged?: (limits: { rpm?: number; tpm?: number }) => void;
}

export interface RateLimitCheckResult {
    allowed: boolean;
    waitMs: number;
}

/**
 * Bottleneck-based rate limiter supporting both RPM and TPM limits
 *
 * Events:
 * - 'throttled': Emitted when limits are adapted due to throttling
 *   Payload: { rpm: number, tpm: number, reason: string }
 */
export class BottleneckRateLimiter extends EventEmitter {
    private rpmLimiter?: Bottleneck;
    private tpmLimiter?: Bottleneck;
    private currentRpm?: number;
    private currentTpm?: number;
    private enableAdaptive: boolean;
    private onLimitChanged?: (limits: { rpm?: number; tpm?: number }) => void;

    constructor(config: BottleneckLimitConfig) {
        super();
        this.currentRpm = config.rpm;
        this.currentTpm = config.tpm;
        this.enableAdaptive = config.enableAdaptive ?? false;
        this.onLimitChanged = config.onLimitChanged;

        // Create RPM limiter if configured
        if (config.rpm) {
            this.rpmLimiter = new Bottleneck({
                reservoir: config.rpm,
                reservoirRefreshAmount: config.rpm,
                reservoirRefreshInterval: 60000, // 60 seconds
                maxConcurrent: config.maxConcurrent ?? null,
                minTime: config.minTime ?? Math.floor(60000 / config.rpm) // spread requests evenly
            });
        }

        // Create TPM limiter if configured
        if (config.tpm) {
            this.tpmLimiter = new Bottleneck({
                reservoir: config.tpm,
                reservoirRefreshAmount: config.tpm,
                reservoirRefreshInterval: 60000 // 60 seconds
            });
        }

        // Chain them together: requests go through RPM first, then TPM
        if (this.rpmLimiter && this.tpmLimiter) {
            this.rpmLimiter.chain(this.tpmLimiter);
        }
    }

    /**
     * Check if a request with given token count would be allowed
     * Note: This is approximate - bottleneck doesn't expose check() with weight
     */
    async check(_estimatedTokens: number): Promise<RateLimitCheckResult> {
        // Use RPM limiter for check (primary limiter in chain)
        const limiter = this.rpmLimiter || this.tpmLimiter;

        if (!limiter) {
            return { allowed: true, waitMs: 0 };
        }

        try {
            const wouldRun = await limiter.check();
            return {
                allowed: wouldRun,
                waitMs: wouldRun ? 0 : 1000 // Estimate 1s wait if not allowed
            };
        } catch (error) {
            return { allowed: true, waitMs: 0 };
        }
    }

    /**
     * Schedule a request with automatic rate limiting
     * @param estimatedTokens - Estimated token count for TPM limiting
     * @param fn - Function to execute
     */
    async schedule<T>(estimatedTokens: number, fn: () => Promise<T>): Promise<T> {
        // If we have BOTH limiters, we need to handle them separately
        // RPM should always consume weight 1, TPM should consume estimated tokens
        if (this.rpmLimiter && this.tpmLimiter) {
            // Schedule through RPM first (weight 1), then manually schedule through TPM
            return this.rpmLimiter.schedule({ weight: 1 }, async () => {
                return this.tpmLimiter!.schedule({ weight: Math.ceil(estimatedTokens) }, fn);
            });
        }

        // If only one limiter, use it directly
        const limiter = this.rpmLimiter || this.tpmLimiter;

        if (!limiter) {
            // No rate limiting configured
            return fn();
        }

        // Single limiter: RPM uses weight 1, TPM uses estimated tokens
        const weight = this.rpmLimiter ? 1 : Math.ceil(estimatedTokens);
        return limiter.schedule({ weight }, fn);
    }

    /**
     * Get current limiter state (for monitoring)
     */
    async getState(): Promise<{
        rpm?: { reservoir: number; running: number };
        tpm?: { reservoir: number; running: number };
    }> {
        const state: any = {};

        if (this.rpmLimiter) {
            const counts = await this.rpmLimiter.counts();
            state.rpm = {
                reservoir: counts.RECEIVED - counts.EXECUTING - (counts.DONE ?? 0),
                running: counts.EXECUTING
            };
        }

        if (this.tpmLimiter) {
            const counts = await this.tpmLimiter.counts();
            state.tpm = {
                reservoir: counts.RECEIVED - counts.EXECUTING - (counts.DONE ?? 0),
                running: counts.EXECUTING
            };
        }

        return state;
    }

    /**
     * Adapt limits after throttling (reduce by 10%)
     * Called by provider when ThrottlingException occurs
     *
     * @param errorMessage - Error message from provider to determine which limit to reduce
     */
    async adaptOnThrottle(errorMessage?: string): Promise<void> {
        if (!this.enableAdaptive) {
            return;
        }

        // Parse error message to determine if it's TPM or RPM throttle
        const isTpmThrottle = errorMessage?.toLowerCase().includes('token');
        const isRpmThrottle = errorMessage?.toLowerCase().includes('request') ||
                              errorMessage?.toLowerCase().includes('rate limit');

        // If we can't tell, reduce both
        const reduceTpm = isTpmThrottle || (!isTpmThrottle && !isRpmThrottle);
        const reduceRpm = isRpmThrottle || (!isTpmThrottle && !isRpmThrottle);

        // Reduce TPM by 10%
        if (reduceTpm && this.currentTpm) {
            this.currentTpm = Math.max(10000, Math.floor(this.currentTpm * 0.9));

            if (this.tpmLimiter) {
                await this.tpmLimiter.updateSettings({
                    reservoir: this.currentTpm,
                    reservoirRefreshAmount: this.currentTpm
                });
            }
        }

        // Reduce RPM by 10%
        if (reduceRpm && this.currentRpm) {
            this.currentRpm = Math.max(10, Math.floor(this.currentRpm * 0.9));

            if (this.rpmLimiter) {
                await this.rpmLimiter.updateSettings({
                    reservoir: this.currentRpm,
                    reservoirRefreshAmount: this.currentRpm
                });
            }
        }

        // Emit event for external listeners
        this.emit('throttled', {
            rpm: this.currentRpm,
            tpm: this.currentTpm,
            reason: errorMessage || 'Unknown throttle',
            reducedRpm: reduceRpm,
            reducedTpm: reduceTpm
        });

        // Notify callback if provided
        if (this.onLimitChanged) {
            this.onLimitChanged({
                rpm: this.currentRpm,
                tpm: this.currentTpm
            });
        }
    }

    /**
     * Get current effective limits (may differ from initial config if adapted)
     */
    getCurrentLimits(): { rpm?: number; tpm?: number } {
        return {
            rpm: this.currentRpm,
            tpm: this.currentTpm
        };
    }

    /**
     * Stop the rate limiter and clean up
     */
    async stop(): Promise<void> {
        if (this.rpmLimiter) {
            await this.rpmLimiter.stop();
        }
        if (this.tpmLimiter) {
            await this.tpmLimiter.stop();
        }
    }
}
