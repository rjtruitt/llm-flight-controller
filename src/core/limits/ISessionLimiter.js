"use strict";
/**
 * Session Limiter Interface - Pluggable session/daily limits
 *
 * @aiInstructions
 * ISessionLimiter allows custom session limit implementations.
 * Useful for custom free tier logic, quotas, etc.
 *
 * @aiExample
 * ```typescript
 * class CustomSessionLimiter implements ISessionLimiter {
 *   checkLimit(usage: SessionUsage): SessionLimitCheck {
 *     // Your custom quota logic
 *     return { allowed: true };
 *   }
 *
 *   recordUsage(usage: SessionUsage): void {
 *     // Track usage
 *   }
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=ISessionLimiter.js.map