/**
 * Pricing Tracker Interface - Pluggable cost tracking
 *
 * @aiInstructions
 * IPricingTracker allows custom pricing/cost tracking implementations.
 * Useful for custom billing logic, cost allocation, etc.
 *
 * @aiExample
 * ```typescript
 * class CustomPricingTracker implements IPricingTracker {
 *   calculateCost(usage: TokenUsage): number {
 *     // Your custom pricing logic
 *     return usage.inputTokens * 0.000003;
 *   }
 *
 *   recordUsage(usage: TokenUsage): void {
 *     // Track for billing
 *   }
 *
 *   checkBudget(estimatedCost: number): BudgetCheck {
 *     return { allowed: true };
 *   }
 * }
 * ```
 */

import { TokenUsage } from '../types/Response';

export interface BudgetCheck {
    allowed: boolean;
    reason?: string;
    currentCost?: number;
    limit?: number;
}

/**
 * Pricing tracker interface
 */
export interface IPricingTracker {
    /**
     * Calculate cost for token usage
     */
    calculateCost(usage: TokenUsage): number;

    /**
     * Record actual usage and update totals
     */
    recordUsage(usage: TokenUsage): void;

    /**
     * Check if cost would exceed budget
     */
    checkBudget(estimatedCost: number): BudgetCheck;

    /**
     * Get total cost so far
     */
    getTotalCost(): number;

    /**
     * Get average cost per request
     */
    getAverageCost?(): number;

    /**
     * Reset all tracking
     */
    reset?(): void;
}
