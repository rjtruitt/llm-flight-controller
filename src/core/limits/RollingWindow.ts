/**
 * Rolling Window - Track values over a rolling time window
 *
 * @aiInstructions
 * RollingWindow tracks events (like API calls or tokens) over a sliding time window.
 * Used for rate limiting - track "tokens per minute" or "requests per hour".
 *
 * @aiExample
 * ```typescript
 * // Track tokens per minute
 * const window = new RollingWindow({ windowMs: 60_000 });
 *
 * // Add token usage
 * window.add(1000);
 * window.add(500);
 *
 * // Get total in window
 * console.log(window.getTotal()); // 1500
 *
 * // Check if within limit
 * if (window.getTotal() + 2000 > 100000) {
 *   console.log('Would exceed TPM limit!');
 * }
 * ```
 *
 * @aiWhenToUse
 * Use RollingWindow when:
 * - Implementing rate limiting (TPM, RPM)
 * - Tracking metrics over time
 * - Need sliding window (not fixed intervals)
 */

export interface RollingWindowConfig {
    /** Window size in milliseconds */
    windowMs: number;
    /** Maximum number of entries to keep (prevents memory leak) */
    maxEntries?: number;
}

export interface WindowEntry {
    timestamp: number;
    value: number;
}

/**
 * Rolling Window - Tracks values over a sliding time window
 */
export class RollingWindow {
    private readonly windowMs: number;
    private readonly maxEntries: number;
    private entries: WindowEntry[] = [];

    constructor(config: RollingWindowConfig) {
        this.windowMs = config.windowMs;
        this.maxEntries = config.maxEntries ?? 10000;
    }

    /**
     * Add a value to the window
     */
    add(value: number, timestamp: number = Date.now()): void {
        // Clean old entries first
        this.cleanup(timestamp);

        // Add new entry
        this.entries.push({ timestamp, value });

        // Enforce max entries (keep most recent)
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(-this.maxEntries);
        }
    }

    /**
     * Get total of all values in the window
     */
    getTotal(now: number = Date.now()): number {
        this.cleanup(now);
        return this.entries.reduce((sum, entry) => sum + entry.value, 0);
    }

    /**
     * Get count of entries in the window
     */
    getCount(now: number = Date.now()): number {
        this.cleanup(now);
        return this.entries.length;
    }

    /**
     * Get all entries in the window
     */
    getEntries(now: number = Date.now()): WindowEntry[] {
        this.cleanup(now);
        return [...this.entries];
    }

    /**
     * Check if window is empty
     */
    isEmpty(now: number = Date.now()): boolean {
        this.cleanup(now);
        return this.entries.length === 0;
    }

    /**
     * Clear all entries
     */
    clear(): void {
        this.entries = [];
    }

    /**
     * Get window start time
     */
    getWindowStart(now: number = Date.now()): number {
        return now - this.windowMs;
    }

    /**
     * Remove entries outside the window
     */
    private cleanup(now: number): void {
        const cutoff = now - this.windowMs;
        this.entries = this.entries.filter(entry => entry.timestamp > cutoff);
    }
}
