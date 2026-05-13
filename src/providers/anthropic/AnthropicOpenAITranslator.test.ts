import { describe, it, expect } from 'vitest';
import { AnthropicOpenAITranslator } from './AnthropicOpenAITranslator';
import { AnthropicRequest, AnthropicResponse } from './AnthropicTypes';
import { OpenAIContext } from '../../core/types/Context';

describe('AnthropicOpenAITranslator', () => {
    const translator = new AnthropicOpenAITranslator();

    describe('fromOpenAI', () => {
        it('should convert simple text message', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Hello' }]
                    }
                ],
                maxTokens: 100
            };

            const result = translator.fromOpenAI(context);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
            expect(result.messages[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
            expect(result.max_tokens).toBe(100);
        });

        it('should convert system message to system field', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'system',
                        content: [{ type: 'text', text: 'You are helpful' }]
                    },
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Hi' }]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.system).toBe('You are helpful');
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
        });

        it('should handle prompt caching markers', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'system',
                        content: [
                            { type: 'text', text: 'System prompt' },
                            { type: 'cache_marker' as any, text: 'Cached part' }
                        ]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            // cache_marker content is filtered to just text types in the implementation
            expect(Array.isArray(result.system)).toBe(true);
            const system = result.system as any[];
            expect(system).toHaveLength(1);
            expect(system[0].text).toBe('System prompt');
        });

        it('should convert image content', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    mediaType: 'image/png',
                                    data: 'base64data'
                                }
                            }
                        ]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.messages[0].content[0]).toEqual({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: 'base64data'
                }
            });
        });

        it('should convert tool calls to tool_use', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'assistant',
                        content: [
                            {
                                type: 'tool_call',
                                id: 'call_123',
                                name: 'get_weather',
                                arguments: { city: 'SF' }
                            }
                        ]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.messages[0].content[0]).toEqual({
                type: 'tool_use',
                id: 'call_123',
                name: 'get_weather',
                input: { city: 'SF' }
            });
        });

        it('should convert tool results', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'tool_result',
                                toolCallId: 'call_123',
                                content: 'Sunny, 72F'
                            }
                        ]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.messages[0].content[0]).toEqual({
                type: 'tool_result',
                tool_use_id: 'call_123',
                content: 'Sunny, 72F'
            });
        });

        it('should convert tools definitions', () => {
            const context: OpenAIContext = {
                messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
                tools: [
                    {
                        type: 'function',
                        function: {
                            name: 'get_weather',
                            description: 'Get weather',
                            parameters: { type: 'object', properties: {} }
                        }
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.tools).toHaveLength(1);
            expect(result.tools![0]).toEqual({
                name: 'get_weather',
                description: 'Get weather',
                input_schema: { type: 'object', properties: {} }
            });
        });

        it('should default max_tokens to 4096 if not provided', () => {
            const context: OpenAIContext = {
                messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }]
            };

            const result = translator.fromOpenAI(context);

            expect(result.max_tokens).toBe(4096);
        });
    });

    describe('toOpenAI', () => {
        it('should convert Anthropic request to library context', () => {
            const anthropicRequest: AnthropicRequest = {
                model: 'claude-3-opus',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ],
                max_tokens: 100
            };

            const result = translator.toOpenAI(anthropicRequest);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
            expect(result.messages[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
            expect(result.maxTokens).toBe(100);
        });

        it('should convert string system to system message', () => {
            const anthropicRequest: AnthropicRequest = {
                model: 'claude-3-opus',
                messages: [],
                system: 'You are helpful',
                max_tokens: 100
            };

            const result = translator.toOpenAI(anthropicRequest);

            expect(result.messages[0].role).toBe('system');
            expect(result.messages[0].content).toEqual([{ type: 'text', text: 'You are helpful' }]);
        });

        it('should convert array system to system message', () => {
            const anthropicRequest: AnthropicRequest = {
                model: 'claude-3-opus',
                messages: [],
                system: [{ type: 'text', text: 'System prompt' }],
                max_tokens: 100
            };

            const result = translator.toOpenAI(anthropicRequest);

            expect(result.messages[0].role).toBe('system');
        });
    });

    describe('responseToOpenAI', () => {
        it('should convert Anthropic response', () => {
            const anthropicResponse: AnthropicResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello!' }],
                model: 'claude-3-opus-20240229',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 10,
                    output_tokens: 5
                }
            };

            const result = translator.responseToOpenAI(anthropicResponse);

            expect(result.id).toBe('msg_123');
            expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
            expect(result.usage.inputTokens).toBe(10);
            expect(result.usage.outputTokens).toBe(5);
            expect(result.usage.totalTokens).toBe(15);
            expect(result.finishReason).toBe('stop');
            expect(result.metadata.providerId).toBe('anthropic');
            expect(result.metadata.modelId).toBe('claude-3-opus-20240229');
        });

        it('should include cache metrics when present', () => {
            const anthropicResponse: AnthropicResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello!' }],
                model: 'claude-3-opus-20240229',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 10,
                    output_tokens: 5,
                    cache_read_input_tokens: 1000,
                    cache_creation_input_tokens: 500
                }
            };

            const result = translator.responseToOpenAI(anthropicResponse);

            expect(result.usage.cacheReadTokens).toBe(1000);
            expect(result.usage.cacheWriteTokens).toBe(500);
        });

        it('should map finish reasons correctly', () => {
            const response: AnthropicResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'test' }],
                model: 'claude',
                stop_reason: 'max_tokens',
                usage: { input_tokens: 1, output_tokens: 1 }
            };

            const result = translator.responseToOpenAI(response);
            expect(result.finishReason).toBe('length');
        });

        it('should map tool_use finish reason', () => {
            const response: AnthropicResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [
                    {
                        type: 'tool_use',
                        id: 'call_123',
                        name: 'get_weather',
                        input: { city: 'SF' }
                    }
                ],
                model: 'claude',
                stop_reason: 'tool_use',
                usage: { input_tokens: 1, output_tokens: 1 }
            };

            const result = translator.responseToOpenAI(response);
            expect(result.finishReason).toBe('tool_calls');
            expect(result.content[0]).toEqual({
                type: 'tool_call',
                id: 'call_123',
                name: 'get_weather',
                arguments: { city: 'SF' }
            });
        });
    });

    describe('round-trip conversion', () => {
        it('should preserve message content through round-trip', () => {
            const original: OpenAIContext = {
                messages: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Test message' }]
                    }
                ],
                maxTokens: 100,
                temperature: 0.7
            };

            const anthropic = translator.fromOpenAI(original);
            const roundTrip = translator.toOpenAI(anthropic);

            expect(roundTrip.messages[0].content[0]).toEqual({ type: 'text', text: 'Test message' });
            expect(roundTrip.maxTokens).toBe(100);
            expect(roundTrip.temperature).toBe(0.7);
        });
    });
});
