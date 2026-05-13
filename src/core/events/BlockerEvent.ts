/**
 * Blocker Events - Universal event system for all blockers
 *
 * @aiInstructions
 * BlockerEvent is the standardized event format for anything that blocks a request.
 * Auth, rate limits, context size, session limits - all use this same pattern.
 * Orchestrators handle all blockers uniformly.
 *
 * @aiExample
 * ```typescript
 * // Listen to blocker events
 * model.on('blocker', (event: BlockerEvent) => {
 *   console.log(`${event.type}: ${event.message}`);
 *   if (event.type === BlockerType.RATE_LIMIT_EXCEEDED) {
 *     console.log(`Wait ${event.data?.waitMs}ms`);
 *   }
 * });
 *
 * // Handle blockers
 * model.setBlockerHandler({
 *   async handleBlocker(event) {
 *     if (event.type === BlockerType.RATE_LIMIT_EXCEEDED) {
 *       return BlockerAction.WAIT;
 *     }
 *     return BlockerAction.CANCEL;
 *   }
 * });
 * ```
 */

/**
 * Blocker types - things that block requests
 */
export enum BlockerType {
    // Auth blockers
    AUTH_REQUIRED = 'auth_required',
    AUTH_EXPIRED = 'auth_expired',
    AUTH_BROWSER_NEEDED = 'auth_browser_needed',
    AUTH_REFRESH_NEEDED = 'auth_refresh_needed',
    AUTH_FAILED = 'auth_failed',

    // Rate limit blockers
    RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
    RATE_LIMIT_WARNING = 'rate_limit_warning',

    // Session limit blockers
    SESSION_LIMIT_EXCEEDED = 'session_limit_exceeded',
    DAILY_LIMIT_EXCEEDED = 'daily_limit_exceeded',
    MONTHLY_LIMIT_EXCEEDED = 'monthly_limit_exceeded',

    // Context blockers
    CONTEXT_TOO_LARGE = 'context_too_large',
    TOKEN_LIMIT_EXCEEDED = 'token_limit_exceeded',

    // Model blockers
    MODEL_OVERLOADED = 'model_overloaded',
    MODEL_UNAVAILABLE = 'model_unavailable',
    MODEL_ERROR = 'model_error',

    // Provider blockers
    PROVIDER_ERROR = 'provider_error',
    NETWORK_ERROR = 'network_error',
    TIMEOUT_ERROR = 'timeout_error'
}

/**
 * Actions orchestrator can take in response to blocker
 */
export enum BlockerAction {
    /** Retry the request */
    RETRY = 'retry',
    /** Wait and retry */
    WAIT = 'wait',
    /** Switch to different model */
    SWITCH_MODEL = 'switch_model',
    /** Compress context (external - context-manager library) */
    COMPRESS_CONTEXT = 'compress_context',
    /** Re-authenticate */
    AUTHENTICATE = 'authenticate',
    /** Cancel the request */
    CANCEL = 'cancel',
    /** Proceed anyway (if possible) */
    IGNORE = 'ignore'
}

/**
 * Blocker event - standardized across all blocker types
 */
export interface BlockerEvent {
    /** Type of blocker */
    type: BlockerType;

    /** Severity level */
    severity: 'info' | 'warning' | 'error' | 'critical';

    /** Does this block the request from proceeding? */
    blocking: boolean;

    /** Human-readable message */
    message: string;

    /** Suggested actions orchestrator can take */
    suggestedActions: BlockerAction[];

    /** Additional blocker-specific data */
    data?: {
        // Auth-specific
        authUrl?: string;
        expiresIn?: number;

        // Rate limit-specific
        waitMs?: number;
        resetAt?: Date;
        currentUsage?: {
            tpm?: number;
            rpm?: number;
            tpmLimit?: number;
            rpmLimit?: number;
        };

        // Context-specific
        currentTokens?: number;
        maxTokens?: number;
        availableTokens?: number;

        // Model-specific
        alternativeModels?: string[];
        modelId?: string;

        // Error-specific
        error?: Error;
        errorCode?: string;

        // Generic
        metadata?: Record<string, unknown>;
    };
}

/**
 * Blocker handler - orchestrator implements this
 */
export interface IBlockerHandler {
    /**
     * Handle any blocker event
     * Returns action for model to take
     */
    handleBlocker(event: BlockerEvent): Promise<BlockerAction>;
}
