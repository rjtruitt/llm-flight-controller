"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockerAction = exports.BlockerType = void 0;
/**
 * Blocker types - things that block requests
 */
var BlockerType;
(function (BlockerType) {
    // Auth blockers
    BlockerType["AUTH_REQUIRED"] = "auth_required";
    BlockerType["AUTH_EXPIRED"] = "auth_expired";
    BlockerType["AUTH_BROWSER_NEEDED"] = "auth_browser_needed";
    BlockerType["AUTH_REFRESH_NEEDED"] = "auth_refresh_needed";
    BlockerType["AUTH_FAILED"] = "auth_failed";
    // Rate limit blockers
    BlockerType["RATE_LIMIT_EXCEEDED"] = "rate_limit_exceeded";
    BlockerType["RATE_LIMIT_WARNING"] = "rate_limit_warning";
    // Session limit blockers
    BlockerType["SESSION_LIMIT_EXCEEDED"] = "session_limit_exceeded";
    BlockerType["DAILY_LIMIT_EXCEEDED"] = "daily_limit_exceeded";
    BlockerType["MONTHLY_LIMIT_EXCEEDED"] = "monthly_limit_exceeded";
    // Context blockers
    BlockerType["CONTEXT_TOO_LARGE"] = "context_too_large";
    BlockerType["TOKEN_LIMIT_EXCEEDED"] = "token_limit_exceeded";
    // Model blockers
    BlockerType["MODEL_OVERLOADED"] = "model_overloaded";
    BlockerType["MODEL_UNAVAILABLE"] = "model_unavailable";
    BlockerType["MODEL_ERROR"] = "model_error";
    // Provider blockers
    BlockerType["PROVIDER_ERROR"] = "provider_error";
    BlockerType["NETWORK_ERROR"] = "network_error";
    BlockerType["TIMEOUT_ERROR"] = "timeout_error";
})(BlockerType || (exports.BlockerType = BlockerType = {}));
/**
 * Actions orchestrator can take in response to blocker
 */
var BlockerAction;
(function (BlockerAction) {
    /** Retry the request */
    BlockerAction["RETRY"] = "retry";
    /** Wait and retry */
    BlockerAction["WAIT"] = "wait";
    /** Switch to different model */
    BlockerAction["SWITCH_MODEL"] = "switch_model";
    /** Compress context (external - context-manager library) */
    BlockerAction["COMPRESS_CONTEXT"] = "compress_context";
    /** Re-authenticate */
    BlockerAction["AUTHENTICATE"] = "authenticate";
    /** Cancel the request */
    BlockerAction["CANCEL"] = "cancel";
    /** Proceed anyway (if possible) */
    BlockerAction["IGNORE"] = "ignore";
})(BlockerAction || (exports.BlockerAction = BlockerAction = {}));
//# sourceMappingURL=BlockerEvent.js.map