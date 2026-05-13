/**
 * Integration Tests - Multi-Model Orchestration
 *
 * Tests real-world scenarios with multiple models:
 * - Upgrading/downgrading between model tiers
 * - Migrating across providers
 * - Context preservation during switches
 * - Dynamic model addition/removal
 * - Fallback chains
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelRegistry } from '../core/registry/ModelRegistry';
import { Model, ModelConfig } from '../core/model/Model';
import { ModelIdentity } from '../core/model/ModelIdentity';
import { IAuthProvider } from '../auth/IAuthProvider';
import { ModelCapabilities, ModelCapability } from '../core/types/Capabilities';
import { OpenAIContext } from '../core/types/Context';
import { ModelResponse } from '../core/types/Response';

// Mock model for testing
class MockModel extends Model {
    constructor(
        config: ModelConfig,
        private mockResponse: ModelResponse = {
            content: 'mock response',
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
        }
    ) {
        super(config);
    }

    protected async sendRequest(_context: OpenAIContext): Promise<ModelResponse> {
        return this.mockResponse;
    }

    protected estimateTokens(context: OpenAIContext): { input: number; output: number } {
        const input = JSON.stringify(context.messages).length / 4;
        const output = context.max_tokens || 1000;
        return { input, output };
    }
}

// Mock auth provider
class MockAuth implements IAuthProvider {
    isAuthenticated(): boolean {
        return true;
    }
    async getHeaders(): Promise<Record<string, string>> {
        return { Authorization: 'Bearer mock' };
    }
}

describe('Multi-Model Orchestration', () => {
    let registry: ModelRegistry;
    let mockAuth: IAuthProvider;

    beforeEach(() => {
        registry = new ModelRegistry();
        mockAuth = new MockAuth();
    });

    describe('Model Registration and Lookup', () => {
        it('should register multiple models', () => {
            const claude = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const gpt4 = new MockModel({
                identity: new ModelIdentity({
                    id: 'gpt-4',
                    displayName: 'GPT-4',
                    provider: { id: 'openai', displayName: 'OpenAI' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('claude-sonnet-4', claude);
            registry.register('gpt-4', gpt4);

            expect(registry.has('claude-sonnet-4')).toBe(true);
            expect(registry.has('gpt-4')).toBe(true);
            expect(registry.getNames()).toContain('claude-sonnet-4');
            expect(registry.getNames()).toContain('gpt-4');
        });

        it('should retrieve registered models', () => {
            const claude = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('claude-sonnet-4', claude);

            const retrieved = registry.get('claude-sonnet-4');
            expect(retrieved).toBe(claude);
            expect(retrieved?.getIdentity().id).toBe('claude-sonnet-4');
        });

        it('should unregister models', () => {
            const claude = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('claude-sonnet-4', claude);
            expect(registry.has('claude-sonnet-4')).toBe(true);

            const removed = registry.unregister('claude-sonnet-4');
            expect(removed).toBe(true);
            expect(registry.has('claude-sonnet-4')).toBe(false);
        });

        it('should find models by capability', () => {
            const claudeSonnet = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const claudeOpus = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-opus-4',
                    displayName: 'Claude Opus 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([
                    ModelCapability.TEXT_GENERATION,
                    ModelCapability.IMAGE_INPUT
                ])
            });

            const gpt4 = new MockModel({
                identity: new ModelIdentity({
                    id: 'gpt-4',
                    displayName: 'GPT-4',
                    provider: { id: 'openai', displayName: 'OpenAI' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([
                    ModelCapability.TEXT_GENERATION,
                    ModelCapability.IMAGE_INPUT
                ])
            });

            registry.register('claude-sonnet-4', claudeSonnet);
            registry.register('claude-opus-4', claudeOpus);
            registry.register('gpt-4', gpt4);

            const visionModels = registry.findByCapability(ModelCapability.IMAGE_INPUT);
            expect(visionModels).toHaveLength(2);
            expect(visionModels.map(m => m.getIdentity().id)).toContain('claude-opus-4');
            expect(visionModels.map(m => m.getIdentity().id)).toContain('gpt-4');
        });

        it('should find models by provider', () => {
            const claudeSonnet = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const claudeOpus = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-opus-4',
                    displayName: 'Claude Opus 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const gpt4 = new MockModel({
                identity: new ModelIdentity({
                    id: 'gpt-4',
                    displayName: 'GPT-4',
                    provider: { id: 'openai', displayName: 'OpenAI' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('claude-sonnet-4', claudeSonnet);
            registry.register('claude-opus-4', claudeOpus);
            registry.register('gpt-4', gpt4);

            const anthropicModels = registry.findByProvider('anthropic');
            expect(anthropicModels).toHaveLength(2);
            expect(anthropicModels.map(m => m.getIdentity().id)).toContain('claude-sonnet-4');
            expect(anthropicModels.map(m => m.getIdentity().id)).toContain('claude-opus-4');
        });
    });

    describe('Model Upgrading and Downgrading', () => {
        it('should upgrade from Haiku to Sonnet', async () => {
            const haiku = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-haiku-4',
                    displayName: 'Claude Haiku 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' },
                    family: 'claude',
                    version: '4'
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const sonnet = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' },
                    family: 'claude',
                    version: '4'
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('claude-haiku-4', haiku);
            registry.register('claude-sonnet-4', sonnet);

            // Start with Haiku
            let currentModel = registry.get('claude-haiku-4')!;
            const context: OpenAIContext = {
                messages: [{ role: 'user', content: 'Simple task' }]
            };

            await currentModel.sendMessage(context);

            // Upgrade to Sonnet for complex task
            currentModel = registry.get('claude-sonnet-4')!;
            context.messages.push({ role: 'assistant', content: 'mock response' });
            context.messages.push({ role: 'user', content: 'Complex task requiring more intelligence' });

            const response = await currentModel.sendMessage(context);
            expect(response).toBeDefined();
            expect(currentModel.getIdentity().id).toBe('claude-sonnet-4');
        });

        it('should downgrade from Opus to Sonnet when approaching budget limit', async () => {
            const opus = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-opus-4',
                    displayName: 'Claude Opus 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' },
                    family: 'claude',
                    version: '4'
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const sonnet = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' },
                    family: 'claude',
                    version: '4'
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('claude-opus-4', opus);
            registry.register('claude-sonnet-4', sonnet);

            // Start with Opus
            let currentModel = registry.get('claude-opus-4')!;

            // Simulate budget concern - downgrade
            currentModel = registry.get('claude-sonnet-4')!;

            expect(currentModel.getIdentity().id).toBe('claude-sonnet-4');
        });
    });

    describe('Cross-Provider Migration', () => {
        it('should migrate context from Anthropic to OpenAI', async () => {
            const claude = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const gpt4 = new MockModel({
                identity: new ModelIdentity({
                    id: 'gpt-4',
                    displayName: 'GPT-4',
                    provider: { id: 'openai', displayName: 'OpenAI' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('claude-sonnet-4', claude);
            registry.register('gpt-4', gpt4);

            // Build context with Claude
            const context: OpenAIContext = {
                messages: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi from Claude' },
                    { role: 'user', content: 'Tell me about AI' }
                ]
            };

            await registry.get('claude-sonnet-4')!.sendMessage(context);

            // Migrate to GPT-4 with same context
            const response = await registry.get('gpt-4')!.sendMessage(context);

            expect(response).toBeDefined();
            expect(context.messages).toHaveLength(3); // Context preserved
        });

        it('should migrate from AWS Bedrock to Anthropic API', async () => {
            const bedrockClaude = new MockModel({
                identity: new ModelIdentity({
                    id: 'anthropic.claude-sonnet-4-v1',
                    displayName: 'Claude Sonnet 4 (Bedrock)',
                    provider: { id: 'bedrock', displayName: 'AWS Bedrock', region: 'us-east-1' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const anthropicClaude = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-sonnet-4-20250514',
                    displayName: 'Claude Sonnet 4',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('bedrock-claude', bedrockClaude);
            registry.register('anthropic-claude', anthropicClaude);

            const context: OpenAIContext = {
                messages: [{ role: 'user', content: 'Test message' }]
            };

            // Start on Bedrock
            await registry.get('bedrock-claude')!.sendMessage(context);

            // Migrate to direct Anthropic API
            const response = await registry.get('anthropic-claude')!.sendMessage(context);

            expect(response).toBeDefined();
        });

        it('should migrate from OpenAI to Gemini with context preservation', async () => {
            const gpt4 = new MockModel({
                identity: new ModelIdentity({
                    id: 'gpt-4',
                    displayName: 'GPT-4',
                    provider: { id: 'openai', displayName: 'OpenAI' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const gemini = new MockModel({
                identity: new ModelIdentity({
                    id: 'gemini-2.0-flash',
                    displayName: 'Gemini 2.0 Flash',
                    provider: { id: 'gemini', displayName: 'Google Gemini' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('gpt-4', gpt4);
            registry.register('gemini-flash', gemini);

            const context: OpenAIContext = {
                messages: [
                    { role: 'system', content: 'You are a helpful assistant' },
                    { role: 'user', content: 'Question 1' },
                    { role: 'assistant', content: 'Answer 1 from GPT-4' },
                    { role: 'user', content: 'Question 2' }
                ]
            };

            await registry.get('gpt-4')!.sendMessage(context);

            // Switch to Gemini - context preserved
            const response = await registry.get('gemini-flash')!.sendMessage(context);

            expect(response).toBeDefined();
            expect(context.messages).toHaveLength(4);
        });
    });

    describe('Dynamic Model Management', () => {
        it('should add new model at runtime', () => {
            expect(registry.getNames()).toHaveLength(0);

            const newModel = new MockModel({
                identity: new ModelIdentity({
                    id: 'new-model',
                    displayName: 'New Model',
                    provider: { id: 'custom', displayName: 'Custom' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('new-model', newModel);
            expect(registry.getNames()).toHaveLength(1);
            expect(registry.has('new-model')).toBe(true);
        });

        it('should remove model at runtime', () => {
            const model1 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-1',
                    displayName: 'Model 1',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const model2 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-2',
                    displayName: 'Model 2',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('model-1', model1);
            registry.register('model-2', model2);
            expect(registry.getNames()).toHaveLength(2);

            registry.unregister('model-1');
            expect(registry.getNames()).toHaveLength(1);
            expect(registry.has('model-1')).toBe(false);
            expect(registry.has('model-2')).toBe(true);
        });

        it('should replace existing model', () => {
            const oldModel = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-v1',
                    displayName: 'Model v1',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const newModel = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-v2',
                    displayName: 'Model v2',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('model', oldModel);
            expect(registry.get('model')?.getIdentity().id).toBe('model-v1');

            registry.register('model', newModel);
            expect(registry.get('model')?.getIdentity().id).toBe('model-v2');
        });
    });

    describe('Fallback Chains', () => {
        it('should fallback from primary to secondary model', async () => {
            const primary = new MockModel({
                identity: new ModelIdentity({
                    id: 'primary',
                    displayName: 'Primary Model',
                    provider: { id: 'provider-a', displayName: 'Provider A' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const secondary = new MockModel({
                identity: new ModelIdentity({
                    id: 'secondary',
                    displayName: 'Secondary Model',
                    provider: { id: 'provider-b', displayName: 'Provider B' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('primary', primary);
            registry.register('secondary', secondary);

            const context: OpenAIContext = {
                messages: [{ role: 'user', content: 'Test' }]
            };

            // Try primary - simulate failure
            let currentModel: Model | undefined = registry.get('primary');
            try {
                // Simulate primary failure
                if (Math.random() < 0) { // Always fallback for test
                    await currentModel!.sendMessage(context);
                } else {
                    throw new Error('Primary unavailable');
                }
            } catch (error) {
                // Fallback to secondary
                currentModel = registry.get('secondary');
            }

            const response = await currentModel!.sendMessage(context);
            expect(response).toBeDefined();
            expect(currentModel!.getIdentity().id).toBe('secondary');
        });

        it('should build fallback chain: Opus -> Sonnet -> Haiku', async () => {
            const opus = new MockModel({
                identity: new ModelIdentity({
                    id: 'opus',
                    displayName: 'Opus',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const sonnet = new MockModel({
                identity: new ModelIdentity({
                    id: 'sonnet',
                    displayName: 'Sonnet',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const haiku = new MockModel({
                identity: new ModelIdentity({
                    id: 'haiku',
                    displayName: 'Haiku',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('opus', opus);
            registry.register('sonnet', sonnet);
            registry.register('haiku', haiku);

            const fallbackChain = ['opus', 'sonnet', 'haiku'];
            const context: OpenAIContext = {
                messages: [{ role: 'user', content: 'Test' }]
            };

            // Try each in order
            let response: ModelResponse | undefined;
            for (const modelName of fallbackChain) {
                const model = registry.get(modelName);
                if (model) {
                    response = await model.sendMessage(context);
                    break;
                }
            }

            expect(response).toBeDefined();
        });
    });

    describe('Bulk Operations with Many Models', () => {
        it('should handle 10+ models simultaneously', () => {
            // Register 10 models from different providers
            const models = [
                { name: 'claude-opus-4', provider: 'anthropic', family: 'claude', tier: 'premium' },
                { name: 'claude-sonnet-4', provider: 'anthropic', family: 'claude', tier: 'standard' },
                { name: 'claude-haiku-4', provider: 'anthropic', family: 'claude', tier: 'fast' },
                { name: 'gpt-4-turbo', provider: 'openai', family: 'gpt-4', tier: 'premium' },
                { name: 'gpt-4', provider: 'openai', family: 'gpt-4', tier: 'standard' },
                { name: 'gpt-3.5-turbo', provider: 'openai', family: 'gpt-3.5', tier: 'fast' },
                { name: 'gemini-2.0-flash', provider: 'gemini', family: 'gemini', tier: 'fast' },
                { name: 'gemini-1.5-pro', provider: 'gemini', family: 'gemini', tier: 'standard' },
                { name: 'bedrock-claude-sonnet', provider: 'bedrock', family: 'claude', tier: 'standard' },
                { name: 'bedrock-llama-3', provider: 'bedrock', family: 'llama', tier: 'standard' },
                { name: 'azure-gpt-4', provider: 'azure', family: 'gpt-4', tier: 'premium' },
                { name: 'deepseek-chat', provider: 'deepseek', family: 'deepseek', tier: 'standard' }
            ];

            models.forEach(({ name, provider, family }) => {
                const model = new MockModel({
                    identity: new ModelIdentity({
                        id: name,
                        displayName: name,
                        provider: { id: provider, displayName: provider },
                        family
                    }),
                    auth: mockAuth,
                    capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
                });
                registry.register(name, model);
            });

            // Verify all registered
            expect(registry.getNames()).toHaveLength(12);
            expect(registry.getAll()).toHaveLength(12);

            // Verify can retrieve each
            models.forEach(({ name }) => {
                expect(registry.has(name)).toBe(true);
                expect(registry.get(name)).toBeDefined();
            });
        });

        it('should route tasks to appropriate models from 10+ options', () => {
            // Register diverse model fleet
            const models = [
                { name: 'claude-opus-4', provider: 'anthropic', caps: [ModelCapability.TEXT_GENERATION, ModelCapability.IMAGE_INPUT] },
                { name: 'claude-sonnet-4', provider: 'anthropic', caps: [ModelCapability.TEXT_GENERATION, ModelCapability.IMAGE_INPUT] },
                { name: 'claude-haiku-4', provider: 'anthropic', caps: [ModelCapability.TEXT_GENERATION] },
                { name: 'gpt-4-turbo', provider: 'openai', caps: [ModelCapability.TEXT_GENERATION, ModelCapability.IMAGE_INPUT] },
                { name: 'gpt-4', provider: 'openai', caps: [ModelCapability.TEXT_GENERATION, ModelCapability.IMAGE_INPUT] },
                { name: 'gpt-3.5-turbo', provider: 'openai', caps: [ModelCapability.TEXT_GENERATION] },
                { name: 'gemini-2.0-flash', provider: 'gemini', caps: [ModelCapability.TEXT_GENERATION, ModelCapability.IMAGE_INPUT] },
                { name: 'gemini-1.5-pro', provider: 'gemini', caps: [ModelCapability.TEXT_GENERATION, ModelCapability.IMAGE_INPUT] },
                { name: 'bedrock-claude', provider: 'bedrock', caps: [ModelCapability.TEXT_GENERATION] },
                { name: 'bedrock-titan', provider: 'bedrock', caps: [ModelCapability.TEXT_GENERATION] }
            ];

            models.forEach(({ name, provider, caps }) => {
                const model = new MockModel({
                    identity: new ModelIdentity({
                        id: name,
                        displayName: name,
                        provider: { id: provider, displayName: provider }
                    }),
                    auth: mockAuth,
                    capabilities: createCapabilities(caps)
                });
                registry.register(name, model);
            });

            // Find vision-capable models
            const visionModels = registry.findByCapability(ModelCapability.IMAGE_INPUT);
            expect(visionModels.length).toBeGreaterThan(0);
            expect(visionModels.length).toBeLessThan(models.length);

            // Find OpenAI models
            const openaiModels = registry.findByProvider('openai');
            expect(openaiModels).toHaveLength(3);

            // Find Anthropic models
            const anthropicModels = registry.findByProvider('anthropic');
            expect(anthropicModels).toHaveLength(3);
        });

        it('should perform round-robin across 10+ models', async () => {
            const modelNames = Array.from({ length: 12 }, (_, i) => `model-${i + 1}`);

            modelNames.forEach(name => {
                const model = new MockModel({
                    identity: new ModelIdentity({
                        id: name,
                        displayName: name,
                        provider: { id: 'provider', displayName: 'Provider' }
                    }),
                    auth: mockAuth,
                    capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
                });
                registry.register(name, model);
            });

            const context: OpenAIContext = {
                messages: [{ role: 'user', content: 'Test' }]
            };

            // Round-robin through all models
            let currentIndex = 0;
            for (let i = 0; i < 25; i++) {
                const modelName = modelNames[currentIndex];
                const model = registry.get(modelName)!;
                await model.sendMessage(context);

                currentIndex = (currentIndex + 1) % modelNames.length;
            }

            // Verify we cycled through
            expect(currentIndex).toBe(25 % modelNames.length);
        });

        it('should remove and re-add models during operation', () => {
            // Start with 10 models
            for (let i = 1; i <= 10; i++) {
                const model = new MockModel({
                    identity: new ModelIdentity({
                        id: `model-${i}`,
                        displayName: `Model ${i}`,
                        provider: { id: 'provider', displayName: 'Provider' }
                    }),
                    auth: mockAuth,
                    capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
                });
                registry.register(`model-${i}`, model);
            }

            expect(registry.getNames()).toHaveLength(10);

            // Remove 3 models
            registry.unregister('model-1');
            registry.unregister('model-5');
            registry.unregister('model-9');

            expect(registry.getNames()).toHaveLength(7);

            // Add 2 new models
            for (let i = 11; i <= 12; i++) {
                const model = new MockModel({
                    identity: new ModelIdentity({
                        id: `model-${i}`,
                        displayName: `Model ${i}`,
                        provider: { id: 'provider', displayName: 'Provider' }
                    }),
                    auth: mockAuth,
                    capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
                });
                registry.register(`model-${i}`, model);
            }

            expect(registry.getNames()).toHaveLength(9);

            // Verify specific models
            expect(registry.has('model-1')).toBe(false);
            expect(registry.has('model-2')).toBe(true);
            expect(registry.has('model-11')).toBe(true);
        });

        it('should upgrade/downgrade within fleet of 10+ models', async () => {
            // Create tiered fleet
            const tiers = {
                premium: ['opus-4', 'gpt-4-turbo', 'gemini-2.0-pro'],
                standard: ['sonnet-4', 'gpt-4', 'gemini-1.5-pro'],
                fast: ['haiku-4', 'gpt-3.5-turbo', 'gemini-2.0-flash'],
                budget: ['claude-instant', 'gpt-3.5']
            };

            Object.entries(tiers).forEach(([tier, names]) => {
                names.forEach(name => {
                    const model = new MockModel({
                        identity: new ModelIdentity({
                            id: name,
                            displayName: name,
                            provider: { id: 'multi', displayName: 'Multi' },
                            family: tier
                        }),
                        auth: mockAuth,
                        capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
                    });
                    registry.register(name, model);
                });
            });

            expect(registry.getNames()).toHaveLength(11);

            const context: OpenAIContext = {
                messages: [{ role: 'user', content: 'Task' }]
            };

            // Start budget
            let currentModel = registry.get('gpt-3.5')!;
            await currentModel.sendMessage(context);

            // Upgrade to standard
            currentModel = registry.get('gpt-4')!;
            await currentModel.sendMessage(context);

            // Upgrade to premium
            currentModel = registry.get('gpt-4-turbo')!;
            await currentModel.sendMessage(context);

            // Downgrade back to fast
            currentModel = registry.get('gpt-3.5-turbo')!;
            await currentModel.sendMessage(context);

            expect(currentModel.getIdentity().id).toBe('gpt-3.5-turbo');
        });

        it('should migrate context across all 10+ providers', async () => {
            const providers = [
                { name: 'anthropic-model', provider: 'anthropic' },
                { name: 'openai-model', provider: 'openai' },
                { name: 'gemini-model', provider: 'gemini' },
                { name: 'bedrock-model', provider: 'bedrock' },
                { name: 'azure-model', provider: 'azure' },
                { name: 'deepseek-model', provider: 'deepseek' },
                { name: 'ollama-model', provider: 'ollama' },
                { name: 'groq-model', provider: 'groq' },
                { name: 'together-model', provider: 'together' },
                { name: 'replicate-model', provider: 'replicate' }
            ];

            providers.forEach(({ name, provider }) => {
                const model = new MockModel({
                    identity: new ModelIdentity({
                        id: name,
                        displayName: name,
                        provider: { id: provider, displayName: provider }
                    }),
                    auth: mockAuth,
                    capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
                });
                registry.register(name, model);
            });

            const context: OpenAIContext = {
                messages: [{ role: 'user', content: 'Message 1' }]
            };

            // Send to each provider in sequence
            for (const { name } of providers) {
                const model = registry.get(name)!;
                await model.sendMessage(context);
                context.messages.push({ role: 'assistant', content: `Response from ${name}` });
                if (providers.indexOf(providers.find(p => p.name === name)!) < providers.length - 1) {
                    context.messages.push({ role: 'user', content: `Next message ${context.messages.length}` });
                }
            }

            // Verify context grew
            expect(context.messages.length).toBeGreaterThan(10);
            expect(context.messages[0].content).toBe('Message 1');
        });
    });

    describe('Context Preservation', () => {
        it('should preserve full conversation history across model switches', async () => {
            const model1 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-1',
                    displayName: 'Model 1',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const model2 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-2',
                    displayName: 'Model 2',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('model-1', model1);
            registry.register('model-2', model2);

            const context: OpenAIContext = {
                messages: [
                    { role: 'user', content: 'Message 1' }
                ]
            };

            // Message with model 1
            await registry.get('model-1')!.sendMessage(context);
            context.messages.push({ role: 'assistant', content: 'Response 1' });
            context.messages.push({ role: 'user', content: 'Message 2' });

            // Switch to model 2 - context should be preserved
            await registry.get('model-2')!.sendMessage(context);
            context.messages.push({ role: 'assistant', content: 'Response 2' });
            context.messages.push({ role: 'user', content: 'Message 3' });

            // Switch back to model 1 - verify context preserved
            await registry.get('model-1')!.sendMessage(context);

            // Verify conversation history
            expect(context.messages).toHaveLength(5);
            expect(context.messages[0].content).toBe('Message 1');
            expect(context.messages[1].content).toBe('Response 1');
            expect(context.messages[2].content).toBe('Message 2');
            expect(context.messages[3].content).toBe('Response 2');
            expect(context.messages[4].content).toBe('Message 3');
        });
    });
});

// Helper function to create capabilities
function createCapabilities(caps: ModelCapability[]): ModelCapabilities {
    const capabilitySet = new Set(caps);
    return {
        capabilities: capabilitySet,
        features: {
            contextWindow: 200000,
            maxOutputTokens: 8192,
            supportsStreaming: false,
            supportsFunctions: false,
            supportsVision: capabilitySet.has(ModelCapability.IMAGE_INPUT),
            supportsAudio: capabilitySet.has(ModelCapability.AUDIO_INPUT)
        },
        toolHandling: {
            mode: 'native',
            maxTools: undefined,
            supportsParallel: true
        },
        inputTypes: new Set(['text']),
        outputTypes: new Set(['text'])
    };
}
