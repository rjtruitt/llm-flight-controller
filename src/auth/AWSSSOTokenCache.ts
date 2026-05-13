/**
 * AWS SSO token caching utilities
 *
 * @aiInstruction
 * Handles caching of AWS SSO tokens and OIDC client registrations.
 * Uses AWS SDK's official token cache paths for compatibility.
 * Tokens are cached in ~/.aws/sso/cache/ directory.
 * Client registrations are cached separately and valid for 90 days.
 *
 * @aiExample
 * import { loadCachedToken, saveCachedToken } from './AWSSSOTokenCache';
 * try {
 *   const token = await loadCachedToken('my-session');
 *   if (new Date(token.expiresAt) > new Date()) {
 *     console.log('Token still valid');
 *   }
 * } catch {
 *   console.log('No cached token');
 * }
 */

import { getSSOTokenFilepath, getSSOTokenFromFile } from '@smithy/shared-ini-file-loader';
import { SSOOIDCClient, RegisterClientCommand } from '@aws-sdk/client-sso-oidc';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';

export interface SSOToken {
    accessToken: string;
    expiresAt: string;
    refreshToken?: string;
    clientId: string;
    clientSecret: string;
    registeredAt: string;
}

export interface ClientCredentials {
    clientId: string;
    clientSecret: string;
    registeredAt: string;
}

/**
 * Load cached token using AWS SDK's official implementation
 */
export async function loadCachedToken(sessionName: string): Promise<SSOToken> {
    const path = getSSOTokenFilepath(sessionName);
    console.log(`[AWSSSOTokenCache] Loading token from: ${path}`);
    const token = await getSSOTokenFromFile(sessionName);
    return token as SSOToken;
}

/**
 * Save token to cache using AWS SDK's official path
 */
export async function saveCachedToken(sessionName: string, token: SSOToken): Promise<void> {
    const cachePath = getSSOTokenFilepath(sessionName);
    await mkdir(join(homedir(), '.aws', 'sso', 'cache'), { recursive: true });
    await writeFile(cachePath, JSON.stringify(token, null, 2), 'utf-8');
    console.log(`[AWSSSOTokenCache] Saved token to: ${cachePath}`);
}

/**
 * Get client cache path (for OIDC client registration)
 */
export function getClientCachePath(startUrl: string): string {
    const hash = createHash('sha1')
        .update(startUrl + '-client')
        .digest('hex');
    return join(homedir(), '.aws', 'sso', 'cache', `${hash}.json`);
}

/**
 * Load cached client registration
 * Returns undefined if no cached client or if expired (>90 days old)
 */
export async function loadCachedClient(startUrl: string): Promise<ClientCredentials | undefined> {
    const cachePath = getClientCachePath(startUrl);
    try {
        const cached = JSON.parse(await readFile(cachePath, 'utf-8'));
        // Check if still valid (valid for 90 days)
        const registeredAt = new Date(cached.registeredAt);
        if (Date.now() - registeredAt.getTime() < 90 * 24 * 60 * 60 * 1000) {
            console.log(`[AWSSSOTokenCache] Using cached client registration`);
            return cached;
        }
        console.log(`[AWSSSOTokenCache] Cached client registration expired`);
    } catch {
        console.log(`[AWSSSOTokenCache] No cached client registration found`);
    }
    return undefined;
}

/**
 * Register new OIDC client or load from cache
 */
export async function getOrRegisterClient(
    client: SSOOIDCClient,
    startUrl: string,
    scopes: string
): Promise<ClientCredentials> {
    // Try cached first
    const cached = await loadCachedClient(startUrl);
    if (cached) return cached;

    // Register new client
    console.log(`[AWSSSOTokenCache] Registering new OIDC client`);
    const registration = await client.send(new RegisterClientCommand({
        clientName: 'llm-flight-controller',
        clientType: 'public',
        scopes: scopes.split(',')
    }));

    const clientCreds: ClientCredentials = {
        clientId: registration.clientId!,
        clientSecret: registration.clientSecret!,
        registeredAt: new Date().toISOString()
    };

    // Cache it
    const cachePath = getClientCachePath(startUrl);
    await mkdir(join(homedir(), '.aws', 'sso', 'cache'), { recursive: true });
    await writeFile(cachePath, JSON.stringify(clientCreds, null, 2), 'utf-8');
    console.log(`[AWSSSOTokenCache] Cached client registration`);

    return clientCreds;
}
