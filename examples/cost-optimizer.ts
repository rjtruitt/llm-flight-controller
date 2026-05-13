/**
 * Cost Optimizer - Route requests to cheapest model that meets requirements
 *
 * Use case: You have multiple models available (GPT-4, Claude, Gemini, DeepSeek)
 * and want to minimize costs while meeting quality/capability requirements.
 *
 * Stateless: Doesn't track usage history, just routes each request optimally.
 */

import { Model } from '../src/core/model/Model';
import { ModelRegistry } from '../src/core/registry/ModelRegistry';
import { ModelCapability } from '../src/core/types/Capabilities';
import { RosettaContext, ModelResponse } from '../src/core/types';

interface RouteRequirements {
    /** Required capabilities (e.g., vision, tools) */
    capabilities?: ModelCapability[];
    /** Maximum cost per request (in dollars) */
    maxCost?: number;
    /** Minimum context window size */
    minContextWindow?: number;
    /** Prefer speed over cost? */
    preferSpeed?: boolean;
}

/**
 * Cost Optimizer
 * Routes requests to the cheapest model that meets requirements
 */
class CostOptimizer {
    private registry: ModelRegistry;

    constructor(registry: ModelRegistry) {
        this.registry = registry;
    }

    /**
     * Find cheapest available model that meets requirements
     */
    async findBestModel(
        context: RosettaContext,
        requirements: RouteRequirements = {}
    ): Promise<{ model: Model; estimatedCost: number; reason: string } | null> {
        const allModels = Array.from(this.registry['models'].values());

        // Filter by capabilities
        let candidates = allModels;
        if (requirements.capabilities) {
            candidates = candidates.filter(model => {
                const caps = model.getCapabilities();
                return requirements.capabilities!.every(req => caps.capabilities.has(req));
            });
        }

        // Filter by context window
        if (requirements.minContextWindow) {
            candidates = candidates.filter(model => {
                const caps = model.getCapabilities();
                return caps.features.contextWindow >= requirements.minContextWindow!;
            });
        }

        if (candidates.length === 0) {
            console.log('❌ No models meet requirements');
            return null;
        }

        // Check health and estimate costs
        const evaluated: Array<{
            model: Model;
            available: boolean;
            cost: number;
            latency?: number;
        }> = [];

        for (const model of candidates) {
            const health = await model.checkHealth();

            // Estimate cost (simplified - would use actual token counting)
            const estimatedTokens = this.estimateTokens(context);
            const pricing = (model as any).pricing;
            const cost = pricing
                ? pricing.calculateCost({
                      inputTokens: estimatedTokens.input,
                      outputTokens: estimatedTokens.output,
                      totalTokens: estimatedTokens.input + estimatedTokens.output
                  })
                : 0;

            // Get latency estimate from stats
            const stats = model.getStats();
            const avgLatency = stats?.getAverageLatency?.();

            evaluated.push({
                model,
                available: health.available,
                cost,
                latency: avgLatency
            });

            console.log(
                `  ${health.available ? '✅' : '❌'} ${model.getIdentity().displayName}: ` +
                `$${cost.toFixed(4)} ${avgLatency ? `(${avgLatency}ms avg)` : ''}`
            );
        }

        // Filter to only available models
        const available = evaluated.filter(e => e.available);
        if (available.length === 0) {
            console.log('❌ No models currently available');
            return null;
        }

        // Apply max cost filter
        let filtered = available;
        if (requirements.maxCost !== undefined) {
            filtered = available.filter(e => e.cost <= requirements.maxCost!);
        }

        if (filtered.length === 0) {
            console.log(`❌ No models under $${requirements.maxCost} cost limit`);
            return null;
        }

        // Sort by preference
        if (requirements.preferSpeed && filtered.some(e => e.latency !== undefined)) {
            // Prefer speed: sort by latency, break ties with cost
            filtered.sort((a, b) => {
                if (a.latency === undefined) return 1;
                if (b.latency === undefined) return -1;
                if (a.latency !== b.latency) return a.latency - b.latency;
                return a.cost - b.cost;
            });
        } else {
            // Prefer cost: sort by cost, break ties with latency
            filtered.sort((a, b) => {
                if (a.cost !== b.cost) return a.cost - b.cost;
                if (a.latency !== undefined && b.latency !== undefined) {
                    return a.latency - b.latency;
                }
                return 0;
            });
        }

        const winner = filtered[0];
        const reason = requirements.preferSpeed && winner.latency
            ? `fastest (${winner.latency}ms avg, $${winner.cost.toFixed(4)})`
            : `cheapest ($${winner.cost.toFixed(4)})`;

        return {
            model: winner.model,
            estimatedCost: winner.cost,
            reason
        };
    }

    /**
     * Route request to optimal model
     */
    async route(
        context: RosettaContext,
        requirements: RouteRequirements = {}
    ): Promise<ModelResponse> {
        console.log('\n💰 Finding optimal model...');
        const result = await this.findBestModel(context, requirements);

        if (!result) {
            throw new Error('No suitable model available');
        }

        console.log(`✨ Selected: ${result.model.getIdentity().displayName} (${result.reason})`);
        return await result.model.sendMessage(context);
    }

    /**
     * Estimate tokens for context (simplified)
     */
    private estimateTokens(context: RosettaContext): { input: number; output: number } {
        // Simplified estimation - real implementation would use proper tokenizer
        const textContent = context.messages
            .flatMap(m => m.content)
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join(' ');

        const inputTokens = Math.ceil(textContent.length / 4);
        const outputTokens = context.maxTokens || 1000;

        return { input: inputTokens, output: outputTokens };
    }
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

async function example() {
    const registry = new ModelRegistry();

    // Setup models with different pricing
    // const gpt4 = factory.createModel(config.getModel('gpt-4'));        // $0.03/1k tokens
    // const claude = factory.createModel(config.getModel('claude'));     // $0.015/1k tokens
    // const gemini = factory.createModel(config.getModel('gemini'));     // $0.001/1k tokens
    // const deepseek = factory.createModel(config.getModel('deepseek')); // $0.00028/1k tokens

    // registry.register('gpt-4', gpt4);
    // registry.register('claude', claude);
    // registry.register('gemini', gemini);
    // registry.register('deepseek', deepseek);

    const optimizer = new CostOptimizer(registry);

    // Example 1: Cheapest model for simple task
    console.log('\n📝 Simple task (no requirements):');
    const context1: RosettaContext = {
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'What is 2+2?' }] }
        ]
    };

    // Will pick DeepSeek ($0.00028) - cheapest available
    // await optimizer.route(context1);

    // Example 2: Need vision capability
    console.log('\n\n🖼️  Task requiring vision:');
    const context2: RosettaContext = {
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'What do you see in this image?' },
                    { type: 'image', source: { type: 'url', data: 'https://...' } }
                ]
            }
        ]
    };

    // Will pick cheapest model WITH vision (GPT-4o or Gemini)
    // await optimizer.route(context2, {
    //     capabilities: [ModelCapability.IMAGE_INPUT]
    // });

    // Example 3: Cost-constrained task
    console.log('\n\n💵 Task with cost limit:');
    const context3: RosettaContext = {
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'Write a blog post about TypeScript' }] }
        ],
        maxTokens: 2000
    };

    // Will pick best model under $0.01 per request
    // await optimizer.route(context3, {
    //     maxCost: 0.01
    // });

    // Example 4: Speed preference
    console.log('\n\n⚡ Time-sensitive task:');
    const context4: RosettaContext = {
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'Quick question: what time is it?' }] }
        ]
    };

    // Will pick fastest model (based on historical latency stats)
    // await optimizer.route(context4, {
    //     preferSpeed: true
    // });

    console.log('\n\n💡 Benefits:');
    console.log('• Save money by using cheaper models when appropriate');
    console.log('• Automatically route to capable models for complex tasks');
    console.log('• Balance cost vs. speed based on requirements');
    console.log('• Stateless - works in serverless, distributed systems');
}

example().catch(console.error);
