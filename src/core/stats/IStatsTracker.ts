/**
 * Stats Tracker Interface - Pluggable statistics tracking
 *
 * @aiInstructions
 * IStatsTracker allows custom stats/metrics implementations.
 * Useful for custom observability, APM integration, etc.
 *
 * @aiExample
 * ```typescript
 * class DatadogStatsTracker implements IStatsTracker {
 *   recordRequest(record: RequestRecord): void {
 *     // Send to Datadog
 *     statsd.timing('model.latency', record.latencyMs);
 *     statsd.increment(record.success ? 'model.success' : 'model.error');
 *   }
 *
 *   getAverageLatency(): number {
 *     // Retrieve from metrics backend
 *     return 0;
 *   }
 * }
 * ```
 */

export interface RequestRecord {
    latencyMs: number;
    tokens?: number;
    success: boolean;
    error?: Error;
    timestamp?: number;
}

export interface StatsSnapshot {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRate: number;
    successRate: number;
    avgLatencyMs: number;
    minLatencyMs?: number;
    maxLatencyMs?: number;
    p95LatencyMs?: number;
    p99LatencyMs?: number;
    totalTokens: number;
    tokensPerSecond: number;
}

/**
 * Stats tracker interface
 */
export interface IStatsTracker {
    /**
     * Record a request
     */
    recordRequest(record: RequestRecord): void;

    /**
     * Get average latency
     */
    getAverageLatency(): number;

    /**
     * Get error rate (0-100)
     */
    getErrorRate(): number;

    /**
     * Get all stats as snapshot
     */
    getStats?(): StatsSnapshot;

    /**
     * Reset all stats
     */
    reset?(): void;
}
