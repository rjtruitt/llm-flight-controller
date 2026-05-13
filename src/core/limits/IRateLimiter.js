"use strict";
/**
 * Rate Limiter Interface - Pluggable rate limiting
 *
 * @aiInstructions
 * IRateLimiter allows custom rate limiting implementations.
 * Implement this to use your own throttling logic.
 *
 * @aiExample
 * ```typescript
 * class CustomRateLimiter implements IRateLimiter {
 *   checkLimit(usage: UsageRecord): RateLimitCheck {
 *     // Your custom logic
 *     return { allowed: true };
 *   }
 *
 *   recordUsage(usage: UsageRecord): void {
 *     // Track usage your way
 *   }
 *
 *   isApproachingLimit(): boolean {
 *     return false;
 *   }
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=IRateLimiter.js.map