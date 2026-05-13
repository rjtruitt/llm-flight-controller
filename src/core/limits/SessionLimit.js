"use strict";
/**
 * Session Limit - Track session and daily limits for free tiers
 *
 * @aiInstructions
 * SessionLimit tracks usage limits for free tier models (e.g., Claude API free: 50 messages/day).
 * Different from RateLimit which tracks per-minute/hour limits.
 *
 * @aiExample
 * ```typescript
 * const sessionLimit = new SessionLimit({
 *   type: 'free',
 *   messagesPerDay: 50,
 *   sessionsPerDay: 10,
 *   tokensPerDay: 100000
 * });
 *
 * // Check if can make request
 * const check = sessionLimit.checkLimit({ messages: 1 });
 * if (!check.allowed) {
 *   console.log(`Daily limit reached! Resets at ${check.resetAt}`);
 * }
 *
 * // Record usage
 * sessionLimit.recordUsage({ messages: 1, tokens: 500 });
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionLimit = void 0;
const RollingWindow_1 = require("./RollingWindow");
/**
 * Session Limit - Tracks and enforces session-based limits
 */
class SessionLimit {
    constructor(config) {
        this.messageCount = 0;
        this.sessionCount = 0;
        this.config = {
            ...config,
            messagesPerDay: config.messagesPerDay ?? Infinity,
            sessionsPerDay: config.sessionsPerDay ?? Infinity,
            tokensPerDay: config.tokensPerDay ?? Infinity,
            tokensPerMonth: config.tokensPerMonth ?? Infinity
        };
        this.dayWindow = new RollingWindow_1.RollingWindow({ windowMs: 24 * 60 * 60 * 1000 });
        this.monthWindow = new RollingWindow_1.RollingWindow({ windowMs: 30 * 24 * 60 * 60 * 1000 });
        this.lastResetDate = this.getCurrentDate();
    }
    /**
     * Check if this model has session limits configured
     */
    hasSessionLimits() {
        return this.config.messagesPerDay !== Infinity ||
            this.config.sessionsPerDay !== Infinity ||
            this.config.tokensPerDay !== Infinity ||
            this.config.tokensPerMonth !== Infinity;
    }
    /**
     * Get cooldown duration (if configured)
     */
    getCooldownDuration() {
        return this.config.cooldownDuration;
    }
    /**
     * Get reset time calculator (if configured)
     */
    getResetTimeCalculator() {
        return this.config.calculateResetTime;
    }
    /**
     * Check if usage would exceed limits
     */
    checkLimit(usage) {
        this.resetIfNewDay();
        const now = Date.now();
        // Check messages per day
        if (usage.messages) {
            if (this.messageCount + usage.messages > this.config.messagesPerDay) {
                return {
                    allowed: false,
                    reason: 'messages_per_day_exceeded',
                    resetAt: this.getNextDayReset()
                };
            }
        }
        // Check sessions per day
        if (usage.sessions) {
            if (this.sessionCount + usage.sessions > this.config.sessionsPerDay) {
                return {
                    allowed: false,
                    reason: 'sessions_per_day_exceeded',
                    resetAt: this.getNextDayReset()
                };
            }
        }
        // Check tokens per day
        if (usage.tokens) {
            const dayTokens = this.dayWindow.getTotal(now);
            if (dayTokens + usage.tokens > this.config.tokensPerDay) {
                return {
                    allowed: false,
                    reason: 'tokens_per_day_exceeded',
                    resetAt: this.getNextDayReset()
                };
            }
            // Check tokens per month
            const monthTokens = this.monthWindow.getTotal(now);
            if (monthTokens + usage.tokens > this.config.tokensPerMonth) {
                return {
                    allowed: false,
                    reason: 'tokens_per_month_exceeded',
                    resetAt: this.getNextMonthReset()
                };
            }
        }
        return { allowed: true };
    }
    /**
     * Record actual usage
     */
    recordUsage(usage, timestamp = Date.now()) {
        this.resetIfNewDay();
        if (usage.messages) {
            this.messageCount += usage.messages;
        }
        if (usage.sessions) {
            this.sessionCount += usage.sessions;
        }
        if (usage.tokens) {
            this.dayWindow.add(usage.tokens, timestamp);
            this.monthWindow.add(usage.tokens, timestamp);
        }
    }
    /**
     * Get current usage
     */
    getUsage(now = Date.now()) {
        this.resetIfNewDay();
        return {
            messagesPerDay: this.messageCount,
            sessionsPerDay: this.sessionCount,
            tokensPerDay: this.dayWindow.getTotal(now),
            tokensPerMonth: this.monthWindow.getTotal(now)
        };
    }
    /**
     * Reset daily counters if new day
     */
    resetIfNewDay() {
        const currentDate = this.getCurrentDate();
        if (currentDate !== this.lastResetDate) {
            this.messageCount = 0;
            this.sessionCount = 0;
            this.lastResetDate = currentDate;
        }
    }
    /**
     * Get current date string (YYYY-MM-DD)
     */
    getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }
    /**
     * Get next day reset time
     */
    getNextDayReset() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
    }
    /**
     * Get next month reset time
     */
    getNextMonthReset() {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);
        nextMonth.setHours(0, 0, 0, 0);
        return nextMonth;
    }
    /**
     * Reset all tracking
     */
    reset() {
        this.messageCount = 0;
        this.sessionCount = 0;
        this.dayWindow.clear();
        this.monthWindow.clear();
    }
}
exports.SessionLimit = SessionLimit;
//# sourceMappingURL=SessionLimit.js.map