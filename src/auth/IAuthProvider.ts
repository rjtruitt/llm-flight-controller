/**
 * Auth Provider Interface - Authentication abstraction
 *
 * @aiInstructions
 * IAuthProvider is the interface all authentication methods implement.
 * Providers use this to get auth headers without knowing auth details.
 *
 * @aiExample
 * ```typescript
 * // Implement custom auth
 * class MyCustomAuth implements IAuthProvider {
 *   async getHeaders() {
 *     return { 'Authorization': 'Bearer my-token' };
 *   }
 *
 *   isAuthenticated() {
 *     return true;
 *   }
 * }
 *
 * // Use with provider
 * const provider = new BedrockProvider(new MyCustomAuth(), 'us-east-1');
 * ```
 *
 * @aiWhenToUse
 * Implement IAuthProvider when:
 * - Creating custom authentication methods
 * - Integrating with proprietary auth systems
 * - Need special credential handling
 */

/**
 * Device code authentication info
 * Used by AWS SSO, GitHub, Azure DevOps, and other device code flows
 */
export interface DeviceCodeInfo {
    /** Device verification URL (user opens this) */
    verificationUrl: string;
    /** User code to enter (e.g., "ABCD-1234") */
    userCode: string;
    /** Complete URL with code embedded (optional - some providers give this) */
    verificationUrlComplete?: string;
    /** Seconds until code expires */
    expiresIn: number;
    /** Seconds between polling attempts */
    interval: number;
}

/**
 * Auth handler interface - orchestrator implements this
 */
export interface IAuthHandler {
    /**
     * Handle device code authentication flow
     * Used by AWS SSO, GitHub Device Flow, Azure DevOps, etc.
     * Application shows the code/URL to user, library polls for token
     */
    handleDeviceCodeAuth(info: DeviceCodeInfo): Promise<void>;

    /**
     * Handle browser-based OAuth authentication (no device code)
     * Opens URL, waits for callback/redirect
     */
    handleBrowserAuth(url: string): Promise<string>;

    /**
     * Handle token refresh prompt
     * Returns true if user wants to refresh
     */
    handleRefreshPrompt(message: string): Promise<boolean>;

    /**
     * Handle authentication error
     */
    handleAuthError(error: Error): Promise<void>;

    /**
     * Handle authentication failure
     */
    onAuthenticationFailed(info: {
        provider: string;
        reason: string;
        canRetry: boolean;
    }): void;
}

/**
 * Auth provider interface
 */
export interface IAuthProvider {
    /**
     * Get authentication headers for request
     */
    getHeaders(): Promise<Record<string, string>>;

    /**
     * Initialize authentication (load profiles, get tokens, etc.)
     * Called automatically on first use if not authenticated
     */
    initialize?(): Promise<void>;

    /**
     * Refresh credentials if needed
     */
    refresh?(): Promise<void>;

    /**
     * Check if currently authenticated
     */
    isAuthenticated(): boolean;

    /**
     * Set auth handler for interactive flows
     */
    setAuthHandler?(handler: IAuthHandler): void;

    /**
     * Handle authentication error from API call
     * Returns true if error is auth-related
     */
    handleAuthError?(error: Error): boolean;
}

/**
 * Re-export AuthenticationError from core types
 */
export { AuthenticationError } from '../core/errors/LLMError';
