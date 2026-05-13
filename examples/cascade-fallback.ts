/**
 * Cascade Fallback - Try models in priority order until one succeeds
 *
 * Use case: Start with best/fastest model, fallback to alternatives if it fails.
 * Common pattern:
 * 1. Try premium model (GPT-4, Claude Opus)
 * 2. Fallback to mid-tier (GPT-3.5, Claude Sonnet)
 * 3. Last resort: free tier or local model
 *
 * Stateless: Doesn't track failure history, just tries cascade on each request.
 */

import { Model } from '../src/core/model/Model';
import { ModelRegistry } from '../src/core/registry/ModelRegistry';
import { RosettaContext, ModelResponse } from '../src/core/types';
import { TranslatorRegistry } from '../src/core/translator/TranslatorRegistry';

interface CascadeLevel {
    name: string;
    models: Model[];
    /** If true, try all models at this level in parallel, use fastest */
    parallel?: boolean;
}

/**
 * Cascade Fallback
 * Tries models in priority order until one succeeds
 */
class CascadeFallback {
    private levels: CascadeLevel[];
    private translator: TranslatorRegistry;

    constructor(levels: CascadeLevel[], translator: TranslatorRegistry) {
        this.levels = levels;
        this.translator = translator;
    }

    /**
     * Try cascade - attempts each level until success
     */
    async execute(context: RosettaContext): Promise<{
        response: ModelResponse;
        model: Model;
        level: string;
        attempts: number;
    }> {
        let totalAttempts = 0;

        for (const level of this.levels) {
            console.log(`\n🎯 Trying level: ${level.name}`);

            if (level.parallel && level.models.length > 1) {
                // Try all models in parallel, return fastest success
                const result = await this.tryParallel(level, context);
                if (result) {
                    return { ...result, level: level.name, attempts: totalAttempts + 1 };
                }
            } else {
                // Try models sequentially
                for (const model of level.models) {
                    totalAttempts++;
                    const result = await this.tryModel(model, context);
                    if (result) {
                        return { ...result, level: level.name, attempts: totalAttempts };
                    }
                }
            }
        }

        throw new Error(`Cascade failed - all ${totalAttempts} attempts exhausted`);
    }

    /**
     * Try single model
     */
    private async tryModel(
        model: Model,
        context: RosettaContext
    ): Promise<{ response: ModelResponse; model: Model } | null> {
        const identity = model.getIdentity();

        try {
            console.log(`  → ${identity.displayName}...`);

            // Translate context if needed
            const translatedContext = this.translator.fromRosetta(
                context,
                identity.provider.id,
                model.getCapabilities()
            );

            const response = await model.sendMessage(translatedContext);

            console.log(`  ✅ ${identity.displayName} succeeded`);
            return { response, model };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`  ❌ ${identity.displayName} failed: ${errorMsg.substring(0, 60)}...`);
            return null;
        }
    }

    /**
     * Try models in parallel, return fastest success
     */
    private async tryParallel(
        level: CascadeLevel,
        context: RosettaContext
    ): Promise<{ response: ModelResponse; model: Model } | null> {
        console.log(`  ⚡ Racing ${level.models.length} models in parallel...`);

        const promises = level.models.map(model =>
            this.tryModel(model, context).then(result => (result ? { ...result, model } : null))
        );

        try {
            // Race - return first success
            const results = await Promise.allSettled(promises);
            const successes = results
                .filter(r => r.status === 'fulfilled' && r.value !== null)
                .map(r => (r as PromiseFulfilledResult<any>).value);

            if (successes.length > 0) {
                const winner = successes[0];
                console.log(`  🏆 Winner: ${winner.model.getIdentity().displayName}`);
                return winner;
            }

            console.log(`  ❌ All parallel attempts failed`);
            return null;
        } catch (error) {
            console.log(`  ❌ Parallel execution error: ${error}`);
            return null;
        }
    }
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

async function example() {
    const registry = new ModelRegistry();
    const translator = new TranslatorRegistry();

    // Setup models
    // const gpt4 = factory.createModel(config.getModel('gpt-4'));
    // const claude = factory.createModel(config.getModel('claude'));
    // const gpt35 = factory.createModel(config.getModel('gpt-3.5'));
    // const gemini = factory.createModel(config.getModel('gemini'));
    // const ollama = factory.createModel(config.getModel('ollama-llama3'));

    // Example 1: Simple priority cascade
    console.log('\n📊 Example 1: Simple Priority Cascade\n');
    const simpleCascade = new CascadeFallback(
        [
            { name: 'Premium', models: [] }, // [gpt4]
            { name: 'Mid-tier', models: [] }, // [claude, gpt35]
            { name: 'Free/Local', models: [] } // [ollama]
        ],
        translator
    );

    // Try premium first, fallback to mid-tier if it fails, last resort is local
    const context1: RosettaContext = {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Explain quantum computing' }] }]
    };
    // const result1 = await simpleCascade.execute(context1);
    // console.log(`✨ Success on level: ${result1.level} (${result1.attempts} attempts)`);

    // Example 2: Parallel racing
    console.log('\n\n⚡ Example 2: Parallel Racing\n');
    const racingCascade = new CascadeFallback(
        [
            {
                name: 'Fast models',
                models: [], // [gpt35, gemini, claude]
                parallel: true // Race these, use fastest
            },
            {
                name: 'Fallback',
                models: [] // [ollama]
            }
        ],
        translator
    );

    // Try GPT-3.5, Gemini, Claude in parallel - use whichever responds first
    const context2: RosettaContext = {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Quick question: what is 2+2?' }] }]
    };
    // const result2 = await racingCascade.execute(context2);
    // console.log(`🏆 Winner: ${result2.model.getIdentity().displayName} (${result2.attempts} attempts)`);

    // Example 3: Capability-aware cascade
    console.log('\n\n🎨 Example 3: Capability-Aware Cascade\n');
    const visionCascade = new CascadeFallback(
        [
            { name: 'Vision models', models: [] }, // [gpt4o, gemini-pro-vision]
            { name: 'Text-only fallback', models: [] } // [claude] - will strip image, describe in text
        ],
        translator
    );

    // Try vision models first, fallback to text-only (adapter will convert image to description)
    const context3: RosettaContext = {
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What do you see?' },
                    { type: 'image', source: { type: 'url', data: 'https://example.com/image.jpg' } }
                ]
            }
        ]
    };
    // const result3 = await visionCascade.execute(context3);

    console.log('\n\n💡 Use Cases:');
    console.log('• Reliability: Always have fallback if premium model is down');
    console.log('• Cost optimization: Try cheap model first, upgrade if needed');
    console.log('• Speed: Race multiple models, use fastest response');
    console.log('• Capability degradation: Try best model, gracefully degrade features');
    console.log('• Geographic routing: Try local region first, fallback to distant');
}

example().catch(console.error);
