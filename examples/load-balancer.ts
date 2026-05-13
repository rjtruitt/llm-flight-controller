/**
 * Load Balancer - Distribute requests across multiple model instances
 *
 * Use case: You have multiple API keys/accounts for the same model
 * (e.g., 5 OpenAI accounts) and want to distribute load to maximize throughput.
 *
 * Patterns:
 * - Round-robin: Fair distribution
 * - Least-loaded: Route to instance with most remaining quota
 * - Random: Simple distribution
 * - Weighted: Prefer certain instances (e.g., premium accounts)
 *
 * Stateless: Doesn't track long-term state, just checks current availability.
 */

import { Model } from '../src/core/model/Model';
import { RosettaContext, ModelResponse } from '../src/core/types';

type LoadBalanceStrategy = 'round-robin' | 'least-loaded' | 'random' | 'weighted';

interface WeightedInstance {
    model: Model;
    weight: number; // Higher = more likely to be selected
}

/**
 * Load Balancer
 * Distributes requests across multiple instances of the same model
 */
class LoadBalancer {
    private instances: Model[];
    private strategy: LoadBalanceStrategy;
    private weights?: Map<Model, number>;
    private lastUsedIndex = 0;

    constructor(instances: Model[], strategy: LoadBalanceStrategy = 'round-robin', weights?: Map<Model, number>) {
        this.instances = instances;
        this.strategy = strategy;
        this.weights = weights;
    }

    /**
     * Route request using configured strategy
     */
    async route(context: RosettaContext): Promise<ModelResponse> {
        const instance = await this.selectInstance();

        if (!instance) {
            throw new Error('No available instances');
        }

        const identity = instance.getIdentity();
        console.log(`→ Routing to: ${identity.displayName}`);

        return await instance.sendMessage(context);
    }

    /**
     * Select instance based on strategy
     */
    private async selectInstance(): Promise<Model | null> {
        switch (this.strategy) {
            case 'round-robin':
                return this.selectRoundRobin();

            case 'least-loaded':
                return await this.selectLeastLoaded();

            case 'random':
                return this.selectRandom();

            case 'weighted':
                return this.selectWeighted();

            default:
                return this.selectRoundRobin();
        }
    }

    /**
     * Round-robin: Cycle through instances sequentially
     */
    private selectRoundRobin(): Model | null {
        if (this.instances.length === 0) return null;

        this.lastUsedIndex = (this.lastUsedIndex + 1) % this.instances.length;
        return this.instances[this.lastUsedIndex];
    }

    /**
     * Least-loaded: Select instance with most remaining quota
     */
    private async selectLeastLoaded(): Promise<Model | null> {
        if (this.instances.length === 0) return null;

        console.log('  Checking quota on all instances...');

        const quotas = await Promise.all(
            this.instances.map(async instance => {
                const health = await instance.checkHealth();
                return {
                    instance,
                    available: health.available,
                    quota: health.remainingQuota ?? Infinity
                };
            })
        );

        // Filter to available instances
        const available = quotas.filter(q => q.available);
        if (available.length === 0) {
            console.log('  ❌ No instances available');
            return null;
        }

        // Sort by remaining quota (highest first)
        available.sort((a, b) => b.quota - a.quota);

        const winner = available[0];
        const quotaInfo = winner.quota !== Infinity ? ` (${winner.quota} left)` : '';
        console.log(`  ✅ Selected instance with most quota${quotaInfo}`);

        return winner.instance;
    }

    /**
     * Random: Random selection
     */
    private selectRandom(): Model | null {
        if (this.instances.length === 0) return null;

        const index = Math.floor(Math.random() * this.instances.length);
        return this.instances[index];
    }

    /**
     * Weighted: Select based on weights (higher weight = more likely)
     */
    private selectWeighted(): Model | null {
        if (this.instances.length === 0 || !this.weights) {
            return this.selectRandom();
        }

        // Calculate total weight
        const totalWeight = this.instances.reduce(
            (sum, instance) => sum + (this.weights!.get(instance) || 1),
            0
        );

        // Random selection weighted by weights
        let random = Math.random() * totalWeight;

        for (const instance of this.instances) {
            const weight = this.weights.get(instance) || 1;
            random -= weight;
            if (random <= 0) {
                return instance;
            }
        }

        return this.instances[0];
    }

    /**
     * Get current load distribution
     */
    async getLoadDistribution(): Promise<
        Array<{
            model: string;
            available: boolean;
            remainingQuota?: number;
            weight?: number;
        }>
    > {
        const results = await Promise.all(
            this.instances.map(async instance => {
                const health = await instance.checkHealth();
                const identity = instance.getIdentity();
                return {
                    model: identity.displayName,
                    available: health.available,
                    remainingQuota: health.remainingQuota,
                    weight: this.weights?.get(instance)
                };
            })
        );

        return results;
    }
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

async function example() {
    // Setup: 5 OpenAI accounts with same model
    // const openaiAccount1 = factory.createModel({ ... apiKey: 'key1' });
    // const openaiAccount2 = factory.createModel({ ... apiKey: 'key2' });
    // const openaiAccount3 = factory.createModel({ ... apiKey: 'key3' });
    // const openaiAccount4 = factory.createModel({ ... apiKey: 'key4' });
    // const openaiAccount5 = factory.createModel({ ... apiKey: 'key5' });

    // Example 1: Round-robin load balancing
    console.log('\n🔄 Example 1: Round-Robin Load Balancing\n');
    const roundRobin = new LoadBalancer(
        [], // [openaiAccount1, openaiAccount2, openaiAccount3],
        'round-robin'
    );

    const context: RosettaContext = {
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello!' }] }]
    };

    // Distributes requests evenly across accounts
    // await roundRobin.route(context); // → Account 1
    // await roundRobin.route(context); // → Account 2
    // await roundRobin.route(context); // → Account 3
    // await roundRobin.route(context); // → Account 1

    console.log('✅ Requests distributed evenly across 3 accounts');

    // Example 2: Least-loaded balancing
    console.log('\n\n📊 Example 2: Least-Loaded Balancing\n');
    const leastLoaded = new LoadBalancer(
        [], // [openaiAccount1, openaiAccount2, openaiAccount3],
        'least-loaded'
    );

    // Checks remaining quota on each account, routes to account with most left
    // await leastLoaded.route(context);
    console.log('✅ Routed to account with most remaining quota');

    // Example 3: Weighted balancing
    console.log('\n\n⚖️  Example 3: Weighted Balancing\n');

    // Account 1 is premium (higher limits), give it 3x weight
    // Account 2 and 3 are standard
    const weights = new Map([
        // [openaiAccount1, 3],  // 60% of traffic
        // [openaiAccount2, 1],  // 20% of traffic
        // [openaiAccount3, 1]   // 20% of traffic
    ]);

    const weighted = new LoadBalancer(
        [], // [openaiAccount1, openaiAccount2, openaiAccount3],
        'weighted',
        weights
    );

    // Distributes more traffic to premium account
    console.log('Simulating 100 requests...');
    // for (let i = 0; i < 100; i++) {
    //     await weighted.route(context);
    // }
    console.log('✅ Premium account handled ~60% of traffic');

    // Example 4: Monitor load distribution
    console.log('\n\n📈 Example 4: Monitor Load Distribution\n');
    const distribution = await roundRobin.getLoadDistribution();

    console.log('Current load across instances:');
    // distribution.forEach(d => {
    //     const quota = d.remainingQuota !== undefined ? ` - ${d.remainingQuota} left` : '';
    //     console.log(`  ${d.available ? '✅' : '❌'} ${d.model}${quota}`);
    // });

    console.log('\n\n💡 Benefits:');
    console.log('• Maximize throughput: Use multiple accounts in parallel');
    console.log('• Avoid rate limits: Distribute load across instances');
    console.log('• High availability: Continue if one account fails');
    console.log('• Cost optimization: Balance between premium/standard accounts');
    console.log('• Geographic distribution: Route to closest instances');
    console.log('• Stateless: Works in serverless, no shared state needed');
}

example().catch(console.error);
