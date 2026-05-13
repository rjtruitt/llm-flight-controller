/**
 * Rate Limit Header Parsers for different providers
 *
 * @aiInstructions
 * HeaderParser extracts and normalizes rate limit information from provider
 * response headers. Each provider uses different header formats - these parsers
 * convert them all to a consistent ParsedRateLimits format.
 *
 * @aiExample
 * ```typescript
 * // OpenAI
 * const parsed = parseOpenAIHeaders(response.headers);
 * await limiter.syncFromHeaders(parsed);
 *
 * // Anthropic
 * const parsed = parseAnthropicHeaders(response.headers);
 * await limiter.syncFromHeaders(parsed);
 *
 * // Gemini
 * const parsed = parseGeminiHeaders(response.headers);
 * await limiter.syncFromHeaders(parsed);
 * ```
 *
 * @aiWhenToUse
 * Use HeaderParser when:
 * - Provider returns rate limit headers
 * - Need to sync limiter state with actual limits
 * - Want accurate remaining quota tracking
 * - Implementing provider-specific adapters
 */

export interface ParsedRateLimits {
  rpm?: {
    limit: number;
    remaining: number;
    reset: Date;
  };
  tpm?: {
    limit: number;
    remaining: number;
    reset: Date;
  };
}

/**
 * Parse OpenAI rate limit headers
 *
 * Headers:
 * - x-ratelimit-limit-requests: 10000
 * - x-ratelimit-remaining-requests: 9999
 * - x-ratelimit-reset-requests: "6s" (duration until reset)
 * - x-ratelimit-limit-tokens: 2000000
 * - x-ratelimit-remaining-tokens: 1995000
 * - x-ratelimit-reset-tokens: "15s"
 */
export function parseOpenAIHeaders(headers: Headers | Record<string, string>): ParsedRateLimits {
  const get = (key: string) => {
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    return headers[key] || headers[key.toLowerCase()];
  };

  const result: ParsedRateLimits = {};

  // Parse RPM
  const rpmLimit = get('x-ratelimit-limit-requests');
  const rpmRemaining = get('x-ratelimit-remaining-requests');
  const rpmReset = get('x-ratelimit-reset-requests');

  if (rpmLimit && rpmRemaining && rpmReset) {
    // Reset is duration like "6s" or "1m30s"
    const resetMs = parseDuration(rpmReset);
    result.rpm = {
      limit: parseInt(rpmLimit),
      remaining: parseInt(rpmRemaining),
      reset: new Date(Date.now() + resetMs)
    };
  }

  // Parse TPM
  const tpmLimit = get('x-ratelimit-limit-tokens');
  const tpmRemaining = get('x-ratelimit-remaining-tokens');
  const tpmReset = get('x-ratelimit-reset-tokens');

  if (tpmLimit && tpmRemaining && tpmReset) {
    const resetMs = parseDuration(tpmReset);
    result.tpm = {
      limit: parseInt(tpmLimit),
      remaining: parseInt(tpmRemaining),
      reset: new Date(Date.now() + resetMs)
    };
  }

  return result;
}

/**
 * Parse Anthropic rate limit headers
 *
 * Headers:
 * - anthropic-ratelimit-requests-limit: 5000
 * - anthropic-ratelimit-requests-remaining: 4999
 * - anthropic-ratelimit-requests-reset: 2024-01-01T00:00:00Z (ISO timestamp)
 * - anthropic-ratelimit-tokens-limit: 100000
 * - anthropic-ratelimit-tokens-remaining: 95000
 * - anthropic-ratelimit-tokens-reset: 2024-01-01T00:00:15Z
 */
export function parseAnthropicHeaders(headers: Headers | Record<string, string>): ParsedRateLimits {
  const get = (key: string) => {
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    return headers[key] || headers[key.toLowerCase()];
  };

  const result: ParsedRateLimits = {};

  // Parse RPM
  const rpmLimit = get('anthropic-ratelimit-requests-limit');
  const rpmRemaining = get('anthropic-ratelimit-requests-remaining');
  const rpmReset = get('anthropic-ratelimit-requests-reset');

  if (rpmLimit && rpmRemaining && rpmReset) {
    result.rpm = {
      limit: parseInt(rpmLimit),
      remaining: parseInt(rpmRemaining),
      reset: new Date(rpmReset) // ISO 8601 timestamp
    };
  }

  // Parse TPM
  const tpmLimit = get('anthropic-ratelimit-tokens-limit');
  const tpmRemaining = get('anthropic-ratelimit-tokens-remaining');
  const tpmReset = get('anthropic-ratelimit-tokens-reset');

  if (tpmLimit && tpmRemaining && tpmReset) {
    result.tpm = {
      limit: parseInt(tpmLimit),
      remaining: parseInt(tpmRemaining),
      reset: new Date(tpmReset)
    };
  }

  return result;
}

/**
 * Parse Google Gemini rate limit headers
 *
 * Headers (need to verify actual format):
 * - x-goog-quota-user-limit-requests-per-minute: 60
 * - x-goog-quota-user-remaining-requests-per-minute: 59
 * - x-goog-quota-user-limit-tokens-per-minute: 100000
 * - x-goog-quota-user-remaining-tokens-per-minute: 95000
 */
export function parseGeminiHeaders(headers: Headers | Record<string, string>): ParsedRateLimits {
  const get = (key: string) => {
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    return headers[key] || headers[key.toLowerCase()];
  };

  const result: ParsedRateLimits = {};

  // Parse RPM
  const rpmLimit = get('x-goog-quota-user-limit-requests-per-minute');
  const rpmRemaining = get('x-goog-quota-user-remaining-requests-per-minute');

  if (rpmLimit && rpmRemaining) {
    // Gemini resets at top of minute (estimate)
    const now = new Date();
    const nextMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

    result.rpm = {
      limit: parseInt(rpmLimit),
      remaining: parseInt(rpmRemaining),
      reset: nextMinute
    };
  }

  // Parse TPM
  const tpmLimit = get('x-goog-quota-user-limit-tokens-per-minute');
  const tpmRemaining = get('x-goog-quota-user-remaining-tokens-per-minute');

  if (tpmLimit && tpmRemaining) {
    const now = new Date();
    const nextMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

    result.tpm = {
      limit: parseInt(tpmLimit),
      remaining: parseInt(tpmRemaining),
      reset: nextMinute
    };
  }

  return result;
}

/**
 * Parse duration string to milliseconds
 * Formats: "6s", "1m30s", "1h5m30s"
 */
function parseDuration(duration: string): number {
  let totalMs = 0;

  // Match hours
  const hoursMatch = duration.match(/(\d+)h/);
  if (hoursMatch) {
    totalMs += parseInt(hoursMatch[1]) * 3600000;
  }

  // Match minutes
  const minutesMatch = duration.match(/(\d+)m/);
  if (minutesMatch) {
    totalMs += parseInt(minutesMatch[1]) * 60000;
  }

  // Match seconds
  const secondsMatch = duration.match(/(\d+)s/);
  if (secondsMatch) {
    totalMs += parseInt(secondsMatch[1]) * 1000;
  }

  // If no match, try parsing as plain number (seconds)
  if (totalMs === 0 && /^\d+$/.test(duration)) {
    totalMs = parseInt(duration) * 1000;
  }

  return totalMs;
}
