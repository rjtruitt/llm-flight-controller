/**
 * Bedrock Provider - Wraps AWS Bedrock Runtime SDK
 *
 * @aiInstructions
 * This provider wraps the official `@aws-sdk/client-bedrock-runtime` package.
 * Bedrock hosts multiple model providers (Anthropic Claude, Meta Llama, Amazon Titan, etc.)
 * Uses the Converse API for unified interface across all models.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { Model, ModelConfig } from '../../core/model/Model';
import { ModelResponse } from '../../core/types/Response';
import { OpenAIContext } from '../../core/types/Context';
import { BedrockOpenAITranslator } from './BedrockOpenAITranslator';
import { BottleneckRateLimiter, BottleneckLimitConfig } from '../../core/limits/BottleneckRateLimiter';
import { AWSSSOAuth } from '../../auth/AWSSSOAuth';
import { AWSAuthProvider } from '../../auth/AWSAuthProvider';
import { IAuthProvider } from '../../auth/IAuthProvider';
import { RateLimitError, AuthenticationError } from '../../core/errors/LLMError';

export interface BedrockProviderConfig extends Omit<ModelConfig, 'auth'> {
    /** AWS Bedrock model ID (e.g., "us.anthropic.claude-sonnet-4-20250514-v1:0") */
    modelId: string;
    /** AWS region */
    region: string;
    /** AWS credentials (optional - uses default credential chain if not provided) */
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    /** AWS profile name (optional - for profile-based auth) */
    profile?: string;

    /** Rate limit configuration using Bottleneck (RPM/TPM) */
    rateLimits?: BottleneckLimitConfig;

    /** Shared rate limiter instance (optional - for coordinating multiple model instances) */
    sharedRateLimiter?: BottleneckRateLimiter;
}

/**
 * Bedrock Provider
 * Wraps the official AWS Bedrock Runtime SDK
 */
export class BedrockProvider extends Model {
    private client: BedrockRuntimeClient;
    private translator: BedrockOpenAITranslator;
    private modelId: string;
    public readonly awsAuth: IAuthProvider;
    public readonly rateLimiter?: BottleneckRateLimiter;

    constructor(config: BedrockProviderConfig) {
        // Choose auth provider based on whether profile is specified
        // If profile specified → Use SSO (proper OAuth flow)
        // If no profile → Use simple credential chain (fromIni)
        const awsAuth: IAuthProvider = config.profile
            ? new AWSSSOAuth({
                profile: config.profile,
                region: config.region
              })
            : new AWSAuthProvider({
                region: config.region
              });

        super({
            identity: config.identity,
            auth: awsAuth,
            capabilities: config.capabilities,
            limits: config.limits,
            pricing: config.pricing,
            stats: config.stats,
            errorHandler: config.errorHandler
        });

        this.awsAuth = awsAuth;

        // Create Bedrock client with credentials
        const clientConfig: any = {
            region: config.region
        };

        if (config.credentials) {
            clientConfig.credentials = config.credentials;
        } else if (awsAuth instanceof AWSSSOAuth) {
            // SSO auth: Use SSO credentials
            clientConfig.credentials = async () => {
                const creds = await awsAuth.getCredentials();
                return await creds();
            };
        } else if (awsAuth instanceof AWSAuthProvider) {
            // Simple auth: Use fromIni credential chain
            clientConfig.credentials = awsAuth.getCredentials();
        }

        this.client = new BedrockRuntimeClient(clientConfig);
        this.translator = new BedrockOpenAITranslator();
        this.modelId = config.modelId;

        // Use shared rate limiter if provided, otherwise create new one
        // Shared rate limiter allows multiple model instances to coordinate on same quota
        if (config.sharedRateLimiter) {
            this.rateLimiter = config.sharedRateLimiter;
        } else if (config.rateLimits) {
            // Create Bottleneck rate limiter with configured RPM/TPM limits
            this.rateLimiter = new BottleneckRateLimiter(config.rateLimits);
        }
    }

    /**
     * Send request to Bedrock Converse API
     */
    protected async sendRequest(context: OpenAIContext): Promise<ModelResponse> {
        // Estimate tokens for rate limiting
        const estimatedTokens = this.estimateTokens(context);
        const totalTokens = estimatedTokens.input + estimatedTokens.output;

        // Execute request through Bottleneck rate limiter (handles both RPM and TPM)
        const executeRequest = async () => {
            // Translate OpenAI → Bedrock format
            const bedrockRequest = this.translator.fromOpenAI(context);
            bedrockRequest.modelId = this.modelId;

            // Call Bedrock SDK
            const command = new ConverseCommand(bedrockRequest as any);
            const response = await this.client.send(command);

            // Translate Bedrock → OpenAI format
            const rosettaResponse = this.translator.responseToOpenAI(response as any);

            // Update modelId in metadata
            if (rosettaResponse.metadata) {
                rosettaResponse.metadata.modelId = this.modelId;
            }

            return rosettaResponse;
        };

        // If rate limiter configured, schedule through Bottleneck
        // This handles both RPM (request count) and TPM (token count via weight)
        const rosettaResponse = this.rateLimiter
            ? await this.rateLimiter.schedule(totalTokens, executeRequest)
            : await executeRequest();

        try {
            return rosettaResponse;
        } catch (error: any) {
            // Check for auth errors first
            if (this.awsAuth.handleAuthError?.(error)) {
                // Auth error detected - throw clear error for application to handle
                if (this.awsAuth.refresh) {
                    await this.awsAuth.refresh(); // This will throw AuthenticationError with instructions
                }
            }

            // Parse Bedrock errors
            const errorName = error.name || 'Unknown';

            if (errorName === 'ThrottlingException' || error.message?.includes('Too many tokens')) {
                // Bedrock throttled us - adapt rate limiter if enabled
                if (this.rateLimiter) {
                    await this.rateLimiter.adaptOnThrottle(error.message);
                }

                // Throw RateLimitError so Model.sendMessage() can retry
                // Bottleneck will use adapted limits on retry
                throw new RateLimitError(
                    'Bedrock rate limit exceeded - request will be retried',
                    { provider: 'bedrock', modelId: this.modelId },
                    undefined, // No retryAfter from Bedrock
                    error
                );
            }

            if (errorName === 'ValidationException') {
                if (error.message?.includes('Input is too long')) {
                    throw new Error('Context window exceeded');
                }
                throw new Error(`Validation error: ${error.message}`);
            }

            if (errorName === 'AccessDeniedException') {
                throw new AuthenticationError(
                    'Access denied - check AWS credentials and model permissions',
                    { provider: 'bedrock', modelId: this.modelId },
                    error
                );
            }

            if (errorName === 'ResourceNotFoundException') {
                throw new Error(`Model not found: ${this.modelId}`);
            }

            throw error;
        }
    }

    /**
     * Estimate tokens for context (simplified)
     */
    protected estimateTokens(context: OpenAIContext): { input: number; output: number } {
        // Simplified estimation - real implementation would use model-specific tokenizer
        const textContent = context.messages
            .flatMap(m => m.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

        const inputTokens = Math.ceil(textContent.length / 4);
        const outputTokens = context.maxTokens || 4096;

        return { input: inputTokens, output: outputTokens };
    }
}
