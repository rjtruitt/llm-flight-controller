"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=IStatsTracker.js.map