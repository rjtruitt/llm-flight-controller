/**
 * Round-Robin Orchestrator - Cycle through models as each hits limits
 *
 * Works with ANY models, whether they have session limits or not:
 * - Session-limited models (paid subscriptions, free tiers) - rotates with cooldowns
 * - API-based models (unlimited use) - rotates on rate limits or other errors
 * - Mixed environments - intelligently handles both types
 *
 * Automatically switches between models as each hits blockers.
 */

import { Model } from '../src/core/model/Model';
import { ModelRegistry } from '../src/core/registry/ModelRegistry';
import { BlockerEvent, BlockerType, BlockerAction, IBlockerHandler } from '../src/core/events/BlockerEvent';
import { RosettaContext, ModelResponse } from '../src/core/types';

interface ModelSlot {
    name: string;
    model: Model;
    cooldownUntil?: Date;
    remainingRequests?: number;
    resetAt?: Date;
}

/**
 * Round-Robin Orchestrator
 * Automatically cycles through models, respecting cooldowns and limits
 */
class RoundRobinOrchestrator implements IBlockerHandler {
    private slots: ModelSlot[] = [];
    private currentIndex = 0;
    private registry: ModelRegistry;

    constructor(registry: ModelRegistry) {
        this.registry = registry;
    }

    /**
     * Add a model to the rotation
     * Cooldown settings are read from the model's SessionLimit configuration
     */
    addModel(name: string, model: Model): void {
        model.setBlockerHandler(this);
        this.slots.push({ name, model });

        // Get session limit info from model
        const sessionLimit = (model as any).limits?.session;
        const hasCooldown = sessionLimit?.getCooldownDuration?.() !== undefined;
        const cooldownInfo = hasCooldown ? `cooldown: ${sessionLimit.getCooldownDuration() / 1000 / 60}m` : 'no cooldown';

        console.log(`✅ Added model: ${name} (${cooldownInfo})`);
    }

    /**
     * Get current active model
     */
    getCurrentModel(): Model {
        return this.slots[this.currentIndex].model;
    }

    /**
     * Check health of all models
     * Useful for probing which models are available before actual use
     *
     * Works for all model types:
     * - Session-limited models: checks if session limit exceeded
     * - API-based models: checks auth and rate limit status
     */
    async checkAllHealth(): Promise<Map<string, {
        available: boolean;
        error?: string;
        remainingQuota?: number;
        hasSessionLimits?: boolean;
        errorType?: string;
    }>> {
        const results = new Map();

        console.log('\n🔍 Checking health of all models...');

        for (const slot of this.slots) {
            const health = await slot.model.checkHealth();
            results.set(slot.name, health);

            if (health.available) {
                const quota = health.remainingQuota !== undefined ? ` (${health.remainingQuota} left)` : '';
                const type = health.hasSessionLimits ? ' [session-limited]' : ' [API-based]';
                console.log(`  ✅ ${slot.name}: Available${quota}${type}`);
            } else {
                const errorType = health.errorType ? ` [${health.errorType}]` : '';
                console.log(`  ❌ ${slot.name}: ${health.error}${errorType}`);
            }
        }

        return results;
    }

    /**
     * Refresh cooldowns based on actual session health
     * Clears cooldown if session is actually available
     */
    async refreshCooldowns(): Promise<void> {
        const health = await this.checkAllHealth();

        for (const slot of this.slots) {
            const status = health.get(slot.name);
            if (status?.available) {
                // Session is available - clear cooldown
                if (slot.cooldownUntil) {
                    console.log(`  🔄 ${slot.name} cooldown cleared (session available)`);
                    slot.cooldownUntil = undefined;
                }
                slot.remainingRequests = status.remainingQuota;
            }
        }
    }

    /**
     * Handle blocker events - automatic rotation!
     */
    async handleBlocker(event: BlockerEvent): Promise<BlockerAction> {
        console.log(`\n⚠️  Blocker: ${event.type} - ${event.message}`);

        // Session limit hit - mark cooldown and rotate
        if (event.type === BlockerType.SESSION_LIMIT_EXCEEDED) {
            const current = this.slots[this.currentIndex];

            // Get cooldown config from model's SessionLimit
            const sessionLimit = (current.model as any).limits?.session;
            const resetTimeCalculator = sessionLimit?.getResetTimeCalculator?.();
            const cooldownDuration = sessionLimit?.getCooldownDuration?.();

            // Calculate reset time
            let resetAt: Date;
            if (resetTimeCalculator) {
                // Use custom reset time calculator (e.g., midnight PT for Gemini)
                resetAt = resetTimeCalculator(new Date());
            } else if (cooldownDuration !== undefined) {
                // Use configured cooldown duration
                resetAt = new Date(Date.now() + cooldownDuration);
            } else {
                // No cooldown configured - try next model immediately
                console.log(`⚠️  ${current.name} has no cooldown configured - trying next model`);
                const nextSlot = this.findNextAvailable();
                if (nextSlot) {
                    this.currentIndex = this.slots.indexOf(nextSlot);
                    console.log(`🔄 Switching to ${nextSlot.name}`);
                    return BlockerAction.SWITCH_MODEL;
                }
                return BlockerAction.WAIT;
            }

            current.cooldownUntil = resetAt;
            current.remainingRequests = 0;
            current.resetAt = resetAt;

            console.log(`⏰ ${current.name} exhausted until ${resetAt.toLocaleTimeString()}`);

            // Find next available model
            const nextSlot = this.findNextAvailable();

            if (!nextSlot) {
                console.log('😴 All models exhausted!');
                console.log('   Waiting for next reset...');
                this.printCooldownStatus();

                // Find earliest reset time
                const earliestReset = this.getEarliestResetTime();
                if (earliestReset) {
                    const waitMs = earliestReset.getTime() - Date.now();
                    console.log(`⏳ Next model available in ${Math.ceil(waitMs / 60000)} minutes`);
                }

                return BlockerAction.WAIT;
            }

            // Switch to next model
            this.currentIndex = this.slots.indexOf(nextSlot);
            console.log(`🔄 Switching to ${nextSlot.name}`);

            return BlockerAction.SWITCH_MODEL;
        }

        // Rate limit warning - getting close!
        if (event.type === BlockerType.RATE_LIMIT_WARNING) {
            console.log(`⚠️  Approaching limit on ${this.slots[this.currentIndex].name}`);
            console.log('   Will auto-switch when exhausted');
        }

        return BlockerAction.RETRY;
    }

    /**
     * Track quota from response metadata
     * SDKs expose this differently:
     */
    trackQuota(response: ModelResponse): void {
        const current = this.slots[this.currentIndex];

        // OpenAI SDK exposes headers in response:
        // response._request.headers['x-ratelimit-remaining-requests']
        // response._request.headers['x-ratelimit-reset-requests']

        // Anthropic SDK similar:
        // response.headers['anthropic-ratelimit-requests-remaining']
        // response.headers['anthropic-ratelimit-requests-reset']

        // Gemini doesn't expose session limits via API (web-based subscription)

        // Parse from response metadata
        const headers = response.metadata?.custom?.headers as Record<string, string> | undefined;

        if (headers) {
            // OpenAI format
            const remainingRequests = headers['x-ratelimit-remaining-requests'];
            const resetTime = headers['x-ratelimit-reset-requests'];

            // Anthropic format
            const anthropicRemaining = headers['anthropic-ratelimit-requests-remaining'];
            const anthropicReset = headers['anthropic-ratelimit-requests-reset'];

            if (remainingRequests) {
                current.remainingRequests = parseInt(remainingRequests);
                if (resetTime) {
                    // Parse RFC3339 timestamp or epoch
                    current.resetAt = new Date(resetTime);
                }
            } else if (anthropicRemaining) {
                current.remainingRequests = parseInt(anthropicRemaining);
                if (anthropicReset) {
                    current.resetAt = new Date(anthropicReset);
                }
            }

            // Predictive switch: if less than 10 requests left, prepare to switch
            if (current.remainingRequests !== undefined && current.remainingRequests < 10) {
                console.log(`📊 Only ${current.remainingRequests} requests left on ${current.name}`);
                console.log('   Will switch proactively soon');
            }
        }
    }

    /**
     * Find next available subscription (not on cooldown)
     */
    private findNextAvailable(): SubscriptionSlot | undefined {
        const now = new Date();

        // Try each slot in round-robin order
        for (let i = 1; i <= this.slots.length; i++) {
            const index = (this.currentIndex + i) % this.slots.length;
            const slot = this.slots[index];

            // Check if cooldown has expired
            if (!slot.cooldownUntil || slot.cooldownUntil < now) {
                return slot;
            }
        }

        // All exhausted
        return undefined;
    }

    /**
     * Get earliest reset time across all subscriptions
     */
    private getEarliestResetTime(): Date | undefined {
        const now = new Date();
        let earliest: Date | undefined;

        for (const slot of this.slots) {
            if (slot.cooldownUntil && slot.cooldownUntil > now) {
                if (!earliest || slot.cooldownUntil < earliest) {
                    earliest = slot.cooldownUntil;
                }
            }
        }

        return earliest;
    }

    /**
     * Print status of all models
     */
    printCooldownStatus(): void {
        console.log('\n📊 Model Status:');
        const now = new Date();

        this.slots.forEach((slot, i) => {
            const isCurrent = i === this.currentIndex;
            const prefix = isCurrent ? '▶️ ' : '  ';

            if (!slot.cooldownUntil || slot.cooldownUntil < now) {
                const remaining = slot.remainingRequests !== undefined
                    ? ` (${slot.remainingRequests} requests left)`
                    : '';
                console.log(`${prefix}${slot.name}: ✅ Available${remaining}`);
            } else {
                const minutesLeft = Math.ceil((slot.cooldownUntil.getTime() - now.getTime()) / 60000);
                console.log(`${prefix}${slot.name}: ⏰ Cooldown (${minutesLeft}m left)`);
            }
        });
    }

    /**
     * Send message with auto-rotation
     */
    async chat(context: RosettaContext): Promise<ModelResponse> {
        const maxAttempts = 10; // Try up to 10 times (switching models as needed)
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const current = this.getCurrentModel();
                console.log(`\n💬 Sending to ${this.slots[this.currentIndex].name}...`);

                // Send request (blocker handler will catch limits)
                const response = await current.sendMessage(context);

                // Track quota from response
                this.trackQuota(response);

                console.log(`✅ Success! (${response.usage.totalTokens} tokens)`);
                this.printCooldownStatus();

                return response;

            } catch (error) {
                attempts++;
                console.log(`❌ Attempt ${attempts} failed: ${error}`);

                if (attempts >= maxAttempts) {
                    throw new Error('All subscriptions exhausted and max attempts reached');
                }

                // Blocker handler already switched models if possible
                // Wait a bit before retry
                await this.sleep(1000);
            }
        }

        throw new Error('Unreachable');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

async function example() {
    const registry = new ModelRegistry();

    // User defines session limits in models.json config:
    /*
    {
      "models": {
        "claude-pro": {
          "provider": "anthropic",
          "modelId": "claude-sonnet-4",
          "auth": { "type": "browser_oauth", ... },
          "limits": {
            "messagesPerDay": 50,
            "cooldownDuration": 10800000,  // 3 hours in ms
            "contextWindow": 200000,
            "maxOutputTokens": 8192
          }
        },
        "gemini-advanced": {
          "provider": "gemini",
          "modelId": "gemini-1.5-pro",
          "auth": { "type": "browser_oauth", ... },
          "limits": {
            "messagesPerDay": 60,
            "cooldownDuration": 28800000  // 8 hours (until midnight PT estimate)
          }
        },
        "gpt-4-api": {
          "provider": "openai",
          "modelId": "gpt-4-turbo",
          "auth": { "type": "api_key", "apiKey": "..." },
          "limits": {
            "tpm": 150000,  // API-based - rate limits, not session limits
            "rpm": 500
          }
        }
      }
    }
    */

    // Load models from config
    // const config = await ModelConfig.fromFile('models.json');
    // const factory = new ModelFactory();

    // const claudePro = factory.createModel(config.getModel('claude-pro'));
    // const geminiAdv = factory.createModel(config.getModel('gemini-advanced'));
    // const gpt4Api = factory.createModel(config.getModel('gpt-4-api'));

    // registry.register('claude-pro', claudePro);
    // registry.register('gemini-advanced', geminiAdv);
    // registry.register('gpt-4-api', gpt4Api);

    // Create rotator - automatically reads cooldown settings from models
    const orchestrator = new RoundRobinOrchestrator(registry);

    // Add models with session limits
    // rotator.addModel('Claude Pro', claudePro);        // Has session limits
    // rotator.addModel('Gemini Advanced', geminiAdv);   // Has session limits
    // rotator.addModel('GPT-4 API', gpt4Api);           // No session limits (API-based)

    console.log('🚀 Starting with Claude Pro...\n');

    // Use throughout the day
    const context: RosettaContext = {
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'Explain TypeScript generics' }] }
        ]
    };

    // First request - works on Claude Pro
    // await rotator.chat(context);

    // ... 50 more requests on Claude Pro ...

    // Request 51 - Claude Pro hits session limit!
    console.log('\n--- After 50 requests on Claude Pro ---');
    console.log('⚠️  Session limit hit!');
    console.log('🔄 Auto-switching to Gemini Advanced...');
    console.log('✨ Context automatically translated:');
    console.log('   Anthropic format → Rosetta → Gemini format');
    console.log('   Tools, messages, everything preserved!');

    // await rotator.chat(context); // Now uses Gemini

    // ... 50 more requests on Gemini ...

    console.log('\n--- After 50 requests on Gemini Advanced ---');
    console.log('⚠️  Session limit hit!');
    console.log('🔄 Auto-switching to ChatGPT Plus...');

    // await rotator.chat(context); // Now uses ChatGPT

    // ... 50 more requests on ChatGPT ...

    console.log('\n--- After 50 requests on ChatGPT Plus ---');
    console.log('⚠️  Session limit hit!');
    console.log('🔄 Looking for available subscription...');
    console.log('⏰ Claude Pro cooldown expires in 30 minutes');
    console.log('🔄 Switching back to Claude Pro!');
    console.log('✨ Full round-robin cycle complete!');

    // The magic:
    // 1. Each model tracks remaining quota from API headers
    // 2. On SESSION_LIMIT_EXCEEDED, mark cooldown and rotate
    // 3. Context translates seamlessly via Rosetta Stone
    // 4. All 3 subscriptions used efficiently throughout the day
    // 5. No wasted subscription - maximize value!
}

// Show how quota tracking works with real SDK responses
console.log('\n📋 How SDKs expose quota information:\n');

console.log('OpenAI SDK:');
console.log(`const response = await openai.chat.completions.create({ ... });
// Response headers (via _request or similar):
response._request.headers = {
  'x-ratelimit-remaining-requests': '45',
  'x-ratelimit-remaining-tokens': '85000',
  'x-ratelimit-reset-requests': '2026-05-12T00:30:00Z'
};`);

console.log('\nAnthropic SDK:');
console.log(`const response = await anthropic.messages.create({ ... });
// Response headers:
response.headers = {
  'anthropic-ratelimit-requests-remaining': '48',
  'anthropic-ratelimit-tokens-remaining': '90000',
  'anthropic-ratelimit-requests-reset': '2026-05-12T01:15:00Z'
};`);

console.log('\nGemini SDK (web-based):');
console.log(`// Session-based - no quota headers exposed
// Must handle SESSION_LIMIT_EXCEEDED blocker reactively`);

console.log('\n\n📋 Session Health Checking:\n');
console.log(`// Check if all subscriptions are available
const health = await rotator.checkAllHealth();
// Output:
// 🔍 Checking health of all subscriptions...
//   ✅ Claude Pro: Available (48 left)
//   ❌ Gemini Advanced: Session limit exceeded
//   ✅ ChatGPT Plus: Available (35 left)

// Refresh cooldowns based on actual availability
await rotator.refreshCooldowns();
// Clears cooldowns if sessions are actually available

// Useful for:
// 1. Startup - check which subscriptions are available before use
// 2. After long idle - clear stale cooldowns
// 3. Manual recovery - force re-check after suspected reset
// 4. Quota monitoring - track remaining requests across subscriptions`);

example().catch(console.error);
