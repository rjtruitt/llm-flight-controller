/**
 * Model Pricing - Cost calculations and budget tracking
 *
 * @aiInstructions
 * ModelPricing tracks costs for model usage. Calculates costs per request,
 * enforces budgets, and provides cost estimates.
 *
 * @aiExample
 * ```typescript
 * const pricing = new ModelPricing({
 *   inputTokens: 3.00,    // $3 per million input tokens
 *   outputTokens: 15.00,  // $15 per million output tokens
 *   cacheRead: 0.30,      // Cache read cost (optional)
 *   cacheWrite: 3.75      // Cache write cost (optional)
 * });
 *
 * // Calculate cost for request
 * const cost = pricing.calculateCost({
 *   inputTokens: 10000,
 *   outputTokens: 2000
 * });
 * console.log(`Cost: $${cost.toFixed(4)}`);
 *
 * // Track total cost
 * pricing.recordUsage({ inputTokens: 10000, outputTokens: 2000 });
 * console.log(`Total spent: $${pricing.getTotalCost()}`);
 * ```
 */

import { TokenUsage } from '../types/Response';
import { IPricingTracker } from './IPricingTracker';

export interface PricingConfig {
    /** Cost per million input tokens */
    inputTokens: number;
    /** Cost per million output tokens */
    outputTokens: number;
    /** Cost per million cached input tokens (if prompt caching supported) */
    cacheRead?: number;
    /** Cost per million cache write tokens */
    cacheWrite?: number;
    /** Fixed cost per request (if applicable) */
    perRequest?: number;
    /** Fixed cost per image (for image generation models) */
    perImage?: number;
}

export interface Budget {
    /** Daily budget limit */
    daily?: number;
    /** Monthly budget limit */
    monthly?: number;
    /** Per-request budget limit */
    perRequest?: number;
}

export class ModelPricing implements IPricingTracker {
    private readonly config: PricingConfig;
    private totalCost = 0;
    private requestCount = 0;

    constructor(config: PricingConfig, private budget?: Budget) {
        this.config = config;
    }

    /**
     * Calculate cost for token usage
     */
    calculateCost(usage: TokenUsage): number {
        let cost = 0;

        // Input tokens
        cost += (usage.inputTokens / 1_000_000) * this.config.inputTokens;

        // Output tokens
        cost += (usage.outputTokens / 1_000_000) * this.config.outputTokens;

        // Cache tokens
        if (usage.cacheReadTokens && this.config.cacheRead) {
            cost += (usage.cacheReadTokens / 1_000_000) * this.config.cacheRead;
        }
        if (usage.cacheWriteTokens && this.config.cacheWrite) {
            cost += (usage.cacheWriteTokens / 1_000_000) * this.config.cacheWrite;
        }

        // Per-request cost
        if (this.config.perRequest) {
            cost += this.config.perRequest;
        }

        return cost;
    }

    /**
     * Record actual usage and update totals
     */
    recordUsage(usage: TokenUsage): void {
        const cost = this.calculateCost(usage);
        this.totalCost += cost;
        this.requestCount++;
    }

    /**
     * Check if cost would exceed budget
     */
    checkBudget(estimatedCost: number): {
        allowed: boolean;
        reason?: string;
        currentCost?: number;
        limit?: number;
    } {
        // Check per-request budget
        if (this.budget?.perRequest && estimatedCost > this.budget.perRequest) {
            return {
                allowed: false,
                reason: 'per_request_budget_exceeded',
                currentCost: estimatedCost,
                limit: this.budget.perRequest
            };
        }

        // Check daily budget (simplified - would need rolling window)
        if (this.budget?.daily && this.totalCost + estimatedCost > this.budget.daily) {
            return {
                allowed: false,
                reason: 'daily_budget_exceeded',
                currentCost: this.totalCost,
                limit: this.budget.daily
            };
        }

        // Check monthly budget
        if (this.budget?.monthly && this.totalCost + estimatedCost > this.budget.monthly) {
            return {
                allowed: false,
                reason: 'monthly_budget_exceeded',
                currentCost: this.totalCost,
                limit: this.budget.monthly
            };
        }

        return { allowed: true };
    }

    /**
     * Get total cost so far
     */
    getTotalCost(): number {
        return this.totalCost;
    }

    /**
     * Get average cost per request
     */
    getAverageCost(): number {
        return this.requestCount > 0 ? this.totalCost / this.requestCount : 0;
    }

    /**
     * Get request count
     */
    getRequestCount(): number {
        return this.requestCount;
    }

    /**
     * Reset all tracking
     */
    reset(): void {
        this.totalCost = 0;
        this.requestCount = 0;
    }
}
