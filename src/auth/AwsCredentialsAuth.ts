/**
 * AWS Credentials Authentication - Direct AWS credentials
 *
 * @aiInstructions
 * Use AwsCredentialsAuth when you have AWS credentials directly (env vars, secrets, etc.).
 * More flexible than profile auth but requires explicit credentials.
 *
 * @aiExample
 * ```typescript
 * const auth = new AwsCredentialsAuth({
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   region: 'us-east-1',
 *   sessionToken: process.env.AWS_SESSION_TOKEN // Optional
 * });
 * ```
 */

import { IAuthProvider } from './IAuthProvider';

export interface AwsCredentialsAuthConfig {
    /** AWS access key ID */
    accessKeyId: string;
    /** AWS secret access key */
    secretAccessKey: string;
    /** AWS region */
    region: string;
    /** Session token (for temporary credentials) */
    sessionToken?: string;
}

export class AwsCredentialsAuth implements IAuthProvider {
    private readonly credentials: {
        accessKeyId: string;
        secretAccessKey: string;
        sessionToken?: string;
    };
    private readonly region: string;

    constructor(config: AwsCredentialsAuthConfig) {
        this.credentials = {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            sessionToken: config.sessionToken
        };
        this.region = config.region;
    }

    async getHeaders(): Promise<Record<string, string>> {
        return {
            'Content-Type': 'application/json',
            'X-Amz-Region': this.region
        };
    }

    async getCredentials() {
        return this.credentials;
    }

    isAuthenticated(): boolean {
        return !!this.credentials.accessKeyId && !!this.credentials.secretAccessKey;
    }
}
