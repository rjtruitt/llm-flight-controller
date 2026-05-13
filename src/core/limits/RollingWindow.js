"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollingWindow = void 0;
/**
 * Rolling Window - Tracks values over a sliding time window
 */
class RollingWindow {
    constructor(config) {
        this.entries = [];
        this.windowMs = config.windowMs;
        this.maxEntries = config.maxEntries ?? 10000;
    }
    /**
     * Add a value to the window
     */
    add(value, timestamp = Date.now()) {
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
    getTotal(now = Date.now()) {
        this.cleanup(now);
        return this.entries.reduce((sum, entry) => sum + entry.value, 0);
    }
    /**
     * Get count of entries in the window
     */
    getCount(now = Date.now()) {
        this.cleanup(now);
        return this.entries.length;
    }
    /**
     * Get all entries in the window
     */
    getEntries(now = Date.now()) {
        this.cleanup(now);
        return [...this.entries];
    }
    /**
     * Check if window is empty
     */
    isEmpty(now = Date.now()) {
        this.cleanup(now);
        return this.entries.length === 0;
    }
    /**
     * Clear all entries
     */
    clear() {
        this.entries = [];
    }
    /**
     * Get window start time
     */
    getWindowStart(now = Date.now()) {
        return now - this.windowMs;
    }
    /**
     * Remove entries outside the window
     */
    cleanup(now) {
        const cutoff = now - this.windowMs;
        this.entries = this.entries.filter(entry => entry.timestamp > cutoff);
    }
}
exports.RollingWindow = RollingWindow;
//# sourceMappingURL=RollingWindow.js.map