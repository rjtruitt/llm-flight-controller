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

import { RollingWindow } from './RollingWindow';
import { ISessionLimiter, SessionUsage, SessionLimitCheck } from './ISessionLimiter';
import { IResetCalculator, DailyResetCalculator, MonthlyResetCalculator, CustomResetCalculator } from './SessionResetCalculator';

export type SessionLimitType = 'free' | 'paid' | 'enterprise';

export interface SessionLimitConfig {
    /** Limit type */
    type: SessionLimitType;
    /** Messages per day */
    messagesPerDay?: number;
    /** Sessions per day */
    sessionsPerDay?: number;
    /** Tokens per day */
    tokensPerDay?: number;
    /** Tokens per month */
    tokensPerMonth?: number;
    /** Cooldown duration in milliseconds when limit is hit */
    cooldownDuration?: number;
    /** Custom reset time calculator (e.g., midnight in specific timezone) */
    calculateResetTime?: (hitTime: Date) => Date;
    /** Injectable reset calculator interface */
    resetCalculator?: IResetCalculator;
}

/**
 * Session Limit - Tracks and enforces session-based limits
 */
export class SessionLimit implements ISessionLimiter {
    private readonly config: SessionLimitConfig & {
        messagesPerDay: number;
        sessionsPerDay: number;
        tokensPerDay: number;
        tokensPerMonth: number;
    };
    private readonly dayWindow: RollingWindow;  // 24 hours
    private readonly monthWindow: RollingWindow; // 30 days
    private readonly dailyResetCalculator: IResetCalculator;
    private readonly monthlyResetCalculator: IResetCalculator;
    private messageCount = 0;
    private sessionCount = 0;
    private lastResetDate: string;

    constructor(config: SessionLimitConfig) {
        this.config = {
            ...config,
            messagesPerDay: config.messagesPerDay ?? Infinity,
            sessionsPerDay: config.sessionsPerDay ?? Infinity,
            tokensPerDay: config.tokensPerDay ?? Infinity,
            tokensPerMonth: config.tokensPerMonth ?? Infinity
        };

        this.dayWindow = new RollingWindow({ windowMs: 24 * 60 * 60 * 1000 });
        this.monthWindow = new RollingWindow({ windowMs: 30 * 24 * 60 * 60 * 1000 });
        this.lastResetDate = this.getCurrentDate();

        // Use injectable reset calculators or defaults
        this.dailyResetCalculator = config.resetCalculator ??
          (config.calculateResetTime ? new CustomResetCalculator(config.calculateResetTime) : new DailyResetCalculator());
        this.monthlyResetCalculator = new MonthlyResetCalculator();
    }

    /**
     * Check if this model has session limits configured
     */
    hasSessionLimits(): boolean {
        return this.config.messagesPerDay !== Infinity ||
               this.config.sessionsPerDay !== Infinity ||
               this.config.tokensPerDay !== Infinity ||
               this.config.tokensPerMonth !== Infinity;
    }

    /**
     * Get cooldown duration (if configured)
     */
    getCooldownDuration(): number | undefined {
        return this.config.cooldownDuration;
    }

    /**
     * Get reset time calculator (if configured)
     */
    getResetTimeCalculator(): ((hitTime: Date) => Date) | undefined {
        return this.config.calculateResetTime;
    }

    /**
     * Check if usage would exceed limits
     */
    checkLimit(usage: SessionUsage): SessionLimitCheck {
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
    recordUsage(usage: SessionUsage, timestamp: number = Date.now()): void {
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
    getUsage(now: number = Date.now()): {
        messagesPerDay: number;
        sessionsPerDay: number;
        tokensPerDay: number;
        tokensPerMonth: number;
    } {
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
    private resetIfNewDay(): void {
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
    private getCurrentDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Get next day reset time
     */
    private getNextDayReset(): Date {
        return this.dailyResetCalculator.calculateResetTime(new Date());
    }

    /**
     * Get next month reset time
     */
    private getNextMonthReset(): Date {
        return this.monthlyResetCalculator.calculateResetTime(new Date());
    }

    /**
     * Reset all tracking
     */
    reset(): void {
        this.messageCount = 0;
        this.sessionCount = 0;
        this.dayWindow.clear();
        this.monthWindow.clear();
    }
}
