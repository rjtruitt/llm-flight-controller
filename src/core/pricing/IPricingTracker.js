"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=IPricingTracker.js.map