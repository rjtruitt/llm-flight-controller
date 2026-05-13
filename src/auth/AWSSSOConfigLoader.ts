/**
 * AWS SSO configuration loader
 *
 * @aiInstruction
 * Loads AWS SSO configuration from ~/.aws/config file.
 * Parses profile and sso-session sections to extract start_url, region, and scopes.
 * Use this to load SSO configuration before starting OAuth flow.
 *
 * @aiExample
 * import { loadSSOSessionConfig } from './AWSSSOConfigLoader';
 * const config = await loadSSOSessionConfig('my-profile');
 * console.log(`Start URL: ${config.sso_start_url}`);
 * console.log(`Region: ${config.sso_region}`);
 */

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

export interface SSOSessionConfig {
    sso_start_url: string;
    sso_region: string;
    sso_registration_scopes?: string;
    sessionName: string;
}

/**
 * Load SSO session config from ~/.aws/config
 */
export async function loadSSOSessionConfig(profile: string): Promise<SSOSessionConfig> {
    const configPath = join(homedir(), '.aws', 'config');
    const content = await readFile(configPath, 'utf-8');

    console.log(`[AWSSSOConfigLoader] Loading SSO config for profile: ${profile}`);

    // Parse profile to find sso_session name
    const profileMatch = content.match(new RegExp(`\\[profile ${profile}\\]([\\s\\S]*?)(?=\\[|$)`));
    if (!profileMatch) {
        console.error(`[AWSSSOConfigLoader] Profile ${profile} not found in config`);
        throw new Error(`Profile ${profile} not found in ~/.aws/config`);
    }

    console.log(`[AWSSSOConfigLoader] Found profile config:`, profileMatch[1]);

    const ssoSessionMatch = profileMatch[1].match(/sso_session\s*=\s*(.+)/);
    if (!ssoSessionMatch) {
        throw new Error(`Profile ${profile} does not have sso_session configured`);
    }

    const sessionName = ssoSessionMatch[1].trim();
    console.log(`[AWSSSOConfigLoader] SSO session name: ${sessionName}`);

    // Find sso-session config
    const sessionMatch = content.match(new RegExp(`\\[sso-session ${sessionName}\\]([\\s\\S]*?)(?=\\[|$)`));
    if (!sessionMatch) {
        throw new Error(`SSO session ${sessionName} not found in ~/.aws/config`);
    }

    const sessionConfig = sessionMatch[1];
    const startUrl = sessionConfig.match(/sso_start_url\s*=\s*(.+)/)?.[1].trim();
    const ssoRegion = sessionConfig.match(/sso_region\s*=\s*(.+)/)?.[1].trim();
    const scopes = sessionConfig.match(/sso_registration_scopes\s*=\s*(.+)/)?.[1].trim();

    if (!startUrl || !ssoRegion) {
        throw new Error(`SSO session ${sessionName} is missing required config (sso_start_url, sso_region)`);
    }

    return {
        sso_start_url: startUrl,
        sso_region: ssoRegion,
        sso_registration_scopes: scopes,
        sessionName
    };
}
