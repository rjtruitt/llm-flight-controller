/**
 * AWS Profile Authentication - Load credentials from ~/.aws/credentials
 *
 * @aiInstructions
 * Use AwsProfileAuth to load AWS credentials from named profiles in ~/.aws/credentials.
 * Handles AWS SigV4 signing automatically.
 *
 * @aiExample
 * ```typescript
 * // Use default profile
 * const auth = new AwsProfileAuth({ region: 'us-east-1' });
 *
 * // Use named profile
 * const auth = new AwsProfileAuth({
 *   profile: 'my-bedrock-profile',
 *   region: 'us-east-1'
 * });
 *
 * const provider = new BedrockProvider(auth, 'us-east-1');
 * ```
 *
 * @aiWhenToUse
 * Use when:
 * - Working with AWS Bedrock
 * - Have AWS CLI profiles configured
 * - Need to support multiple AWS accounts
 */

import { IAuthProvider } from './IAuthProvider';

export interface AwsProfileAuthConfig {
    /** AWS profile name (default: 'default') */
    profile?: string;
    /** AWS region */
    region: string;
}

/**
 * AWS Profile Authentication
 *
 * Note: Requires @aws-sdk/credential-providers and @aws-sdk/signature-v4
 * Install: npm install @aws-sdk/credential-providers @aws-sdk/signature-v4
 */
export class AwsProfileAuth implements IAuthProvider {
    private readonly profileName: string;
    private readonly region: string;
    private credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };

    constructor(config: AwsProfileAuthConfig) {
        this.profileName = config.profile ?? 'default';
        this.region = config.region;
    }

    async initialize(): Promise<void> {
        try {
            // Dynamic import to avoid requiring AWS SDK if not used
            const { fromIni } = await import('@aws-sdk/credential-providers');

            const credentialProvider = fromIni({ profile: this.profileName });
            this.credentials = await credentialProvider();
        } catch (error) {
            const err = error as Error;
            throw new Error(
                `Failed to load AWS profile "${this.profileName}": ${err.message}\n` +
                `Make sure AWS CLI is configured and profile exists in ~/.aws/credentials`
            );
        }
    }

    async getHeaders(): Promise<Record<string, string>> {
        // Initialize on first use
        if (!this.credentials) {
            await this.initialize();
        }

        // Return basic headers - actual signing happens in provider
        // Provider will use these credentials to sign requests
        return {
            'Content-Type': 'application/json',
            'X-Amz-Region': this.region
        };
    }

    /**
     * Get credentials for signing
     * Called by provider to get creds for SigV4 signing
     */
    async getCredentials() {
        if (!this.credentials) {
            await this.initialize();
        }
        return this.credentials!;
    }

    isAuthenticated(): boolean {
        return !!this.credentials;
    }
}
