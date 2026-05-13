import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from './ModelRegistry';
import { Model, ModelConfig } from '../model/Model';
import { ModelIdentity } from '../model/ModelIdentity';
import { ModelCapabilities, ModelCapability } from '../types/Capabilities';
import { IAuthProvider } from '../../auth/IAuthProvider';
import { OpenAIContext } from '../types/Context';
import { ModelResponse } from '../types/Response';

// Mock model
class MockModel extends Model {
    protected async sendRequest(_context: OpenAIContext): Promise<ModelResponse> {
        return { content: 'mock', usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 } };
    }
    protected estimateTokens(_context: OpenAIContext): { input: number; output: number } {
        return { input: 100, output: 50 };
    }
}

// Mock auth
class MockAuth implements IAuthProvider {
    isAuthenticated(): boolean { return true; }
    async getHeaders(): Promise<Record<string, string>> { return {}; }
}

function createMockCapabilities(caps: ModelCapability[]): ModelCapabilities {
    return {
        capabilities: new Set(caps),
        features: {
            contextWindow: 100000,
            maxOutputTokens: 4096,
            supportsStreaming: false,
            supportsFunctions: false,
            supportsVision: caps.includes(ModelCapability.IMAGE_INPUT),
            supportsAudio: caps.includes(ModelCapability.AUDIO_INPUT)
        },
        toolHandling: { mode: 'native', maxTools: undefined, supportsParallel: true },
        inputTypes: new Set(['text']),
        outputTypes: new Set(['text'])
    };
}

describe('ModelRegistry', () => {
    let registry: ModelRegistry;
    let mockAuth: IAuthProvider;

    beforeEach(() => {
        registry = new ModelRegistry();
        mockAuth = new MockAuth();
    });

    describe('Registration', () => {
        it('should register a model', () => {
            const model = new MockModel({
                identity: new ModelIdentity({
                    id: 'test-model',
                    displayName: 'Test',
                    provider: { id: 'test', displayName: 'Test' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('test', model);
            expect(registry.has('test')).toBe(true);
        });

        it('should retrieve registered model', () => {
            const model = new MockModel({
                identity: new ModelIdentity({
                    id: 'test-model',
                    displayName: 'Test',
                    provider: { id: 'test', displayName: 'Test' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('test', model);
            const retrieved = registry.get('test');
            expect(retrieved).toBe(model);
        });

        it('should return undefined for unregistered model', () => {
            const model = registry.get('nonexistent');
            expect(model).toBeUndefined();
        });

        it('should register multiple models', () => {
            const model1 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-1',
                    displayName: 'Model 1',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const model2 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-2',
                    displayName: 'Model 2',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('model-1', model1);
            registry.register('model-2', model2);

            expect(registry.has('model-1')).toBe(true);
            expect(registry.has('model-2')).toBe(true);
        });

        it('should replace existing model', () => {
            const model1 = new MockModel({
                identity: new ModelIdentity({
                    id: 'old',
                    displayName: 'Old',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const model2 = new MockModel({
                identity: new ModelIdentity({
                    id: 'new',
                    displayName: 'New',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('model', model1);
            registry.register('model', model2);

            const retrieved = registry.get('model');
            expect(retrieved?.getIdentity().id).toBe('new');
        });
    });

    describe('Unregistration', () => {
        it('should unregister a model', () => {
            const model = new MockModel({
                identity: new ModelIdentity({
                    id: 'test',
                    displayName: 'Test',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('test', model);
            expect(registry.has('test')).toBe(true);

            const result = registry.unregister('test');
            expect(result).toBe(true);
            expect(registry.has('test')).toBe(false);
        });

        it('should return false for unregistering nonexistent model', () => {
            const result = registry.unregister('nonexistent');
            expect(result).toBe(false);
        });
    });

    describe('Listing', () => {
        it('should return all model names', () => {
            const model1 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-1',
                    displayName: 'Model 1',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const model2 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-2',
                    displayName: 'Model 2',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('model-1', model1);
            registry.register('model-2', model2);

            const names = registry.getNames();
            expect(names).toContain('model-1');
            expect(names).toContain('model-2');
            expect(names).toHaveLength(2);
        });

        it('should return all models', () => {
            const model1 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-1',
                    displayName: 'Model 1',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const model2 = new MockModel({
                identity: new ModelIdentity({
                    id: 'model-2',
                    displayName: 'Model 2',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('model-1', model1);
            registry.register('model-2', model2);

            const models = registry.getAll();
            expect(models).toHaveLength(2);
        });

        it('should return empty array when no models', () => {
            expect(registry.getNames()).toEqual([]);
            expect(registry.getAll()).toEqual([]);
        });
    });

    describe('Finding by capability', () => {
        it('should find models with specific capability', () => {
            const textOnly = new MockModel({
                identity: new ModelIdentity({
                    id: 'text-only',
                    displayName: 'Text Only',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const vision = new MockModel({
                identity: new ModelIdentity({
                    id: 'vision',
                    displayName: 'Vision',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION, ModelCapability.IMAGE_INPUT])
            });

            registry.register('text-only', textOnly);
            registry.register('vision', vision);

            const visionModels = registry.findByCapability(ModelCapability.IMAGE_INPUT);
            expect(visionModels).toHaveLength(1);
            expect(visionModels[0].getIdentity().id).toBe('vision');
        });

        it('should return empty array when no models match', () => {
            const model = new MockModel({
                identity: new ModelIdentity({
                    id: 'text',
                    displayName: 'Text',
                    provider: { id: 'provider', displayName: 'Provider' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('text', model);

            const audioModels = registry.findByCapability(ModelCapability.AUDIO_INPUT);
            expect(audioModels).toHaveLength(0);
        });
    });

    describe('Finding by provider', () => {
        it('should find models from specific provider', () => {
            const anthropic1 = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-1',
                    displayName: 'Claude 1',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const anthropic2 = new MockModel({
                identity: new ModelIdentity({
                    id: 'claude-2',
                    displayName: 'Claude 2',
                    provider: { id: 'anthropic', displayName: 'Anthropic' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            const openai = new MockModel({
                identity: new ModelIdentity({
                    id: 'gpt-4',
                    displayName: 'GPT-4',
                    provider: { id: 'openai', displayName: 'OpenAI' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('claude-1', anthropic1);
            registry.register('claude-2', anthropic2);
            registry.register('gpt-4', openai);

            const anthropicModels = registry.findByProvider('anthropic');
            expect(anthropicModels).toHaveLength(2);
        });

        it('should return empty array when no provider matches', () => {
            const model = new MockModel({
                identity: new ModelIdentity({
                    id: 'model',
                    displayName: 'Model',
                    provider: { id: 'provider-a', displayName: 'Provider A' }
                }),
                auth: mockAuth,
                capabilities: createMockCapabilities([ModelCapability.TEXT_GENERATION])
            });

            registry.register('model', model);

            const models = registry.findByProvider('provider-b');
            expect(models).toHaveLength(0);
        });
    });
});
