import { describe, it, expect } from 'vitest';
import { BedrockOpenAITranslator } from './BedrockOpenAITranslator';
import { BedrockRequest, BedrockResponse } from './BedrockTypes';
import { OpenAIContext } from '../../core/types/Context';

describe('BedrockOpenAITranslator', () => {
    const translator = new BedrockOpenAITranslator();

    describe('fromOpenAI', () => {
        it('should convert simple text message', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Hello' }]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
            expect(result.messages[0].content).toEqual([{ text: 'Hello' }]);
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

            expect(result.system).toEqual([{ text: 'You are helpful' }]);
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
        });

        it('should convert tool role to user (Bedrock requirement)', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'tool' as any,
                        content: [{ type: 'text', text: 'Tool result' }]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.messages[0].role).toBe('user');
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
                                    data: 'YmFzZTY0ZGF0YQ=='
                                }
                            }
                        ]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.messages[0].content[0]).toHaveProperty('image');
            const imageContent = result.messages[0].content[0] as any;
            expect(imageContent.image.format).toBe('png');
        });

        it('should convert tool calls', () => {
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

            expect(result.messages[0].content[0]).toHaveProperty('toolUse');
            const toolUse = result.messages[0].content[0] as any;
            expect(toolUse.toolUse.name).toBe('get_weather');
            expect(toolUse.toolUse.input).toEqual({ city: 'SF' });
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
                                content: 'Sunny'
                            }
                        ]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.messages[0].content[0]).toHaveProperty('toolResult');
            const toolResult = result.messages[0].content[0] as any;
            expect(toolResult.toolResult.toolUseId).toBe('call_123');
            expect(toolResult.toolResult.content).toEqual([{ text: 'Sunny' }]);
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

            expect(result.toolConfig?.tools).toHaveLength(1);
            expect(result.toolConfig!.tools[0].toolSpec).toEqual({
                name: 'get_weather',
                description: 'Get weather',
                inputSchema: {
                    json: { type: 'object', properties: {} }
                }
            });
        });

        it('should set inference config', () => {
            const context: OpenAIContext = {
                messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
                maxTokens: 200,
                temperature: 0.8,
                topP: 0.9
            };

            const result = translator.fromOpenAI(context);

            expect(result.inferenceConfig).toEqual({
                maxTokens: 200,
                temperature: 0.8,
                topP: 0.9
            });
        });
    });

    describe('toOpenAI', () => {
        it('should convert Bedrock request to OpenAI context', () => {
            const bedrockRequest: BedrockRequest = {
                modelId: 'test-model',
                messages: [
                    {
                        role: 'user',
                        content: [{ text: 'Hello' }]
                    }
                ]
            };

            const result = translator.toOpenAI(bedrockRequest);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
            expect(result.messages[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
        });

        it('should convert system field to system message', () => {
            const bedrockRequest: BedrockRequest = {
                modelId: 'test',
                messages: [],
                system: [{ text: 'You are helpful' }]
            };

            const result = translator.toOpenAI(bedrockRequest);

            expect(result.messages[0].role).toBe('system');
            expect(result.messages[0].content).toEqual([{ type: 'text', text: 'You are helpful' }]);
        });
    });

    describe('responseToOpenAI', () => {
        it('should convert Bedrock response', () => {
            const bedrockResponse: BedrockResponse = {
                output: {
                    message: {
                        role: 'assistant',
                        content: [{ text: 'Hello!' }]
                    }
                },
                stopReason: 'end_turn',
                usage: {
                    inputTokens: 10,
                    outputTokens: 5,
                    totalTokens: 15
                }
            };

            const result = translator.responseToOpenAI(bedrockResponse);

            expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
            expect(result.usage.inputTokens).toBe(10);
            expect(result.usage.outputTokens).toBe(5);
            expect(result.usage.totalTokens).toBe(15);
            expect(result.finishReason).toBe('stop');
            expect(result.metadata.providerId).toBe('bedrock');
        });

        it('should map finish reasons correctly', () => {
            const response: BedrockResponse = {
                output: {
                    message: {
                        role: 'assistant',
                        content: [{ text: 'test' }]
                    }
                },
                stopReason: 'max_tokens',
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
            };

            const result = translator.responseToOpenAI(response);
            expect(result.finishReason).toBe('length');
        });

        it('should map tool_use finish reason', () => {
            const response: BedrockResponse = {
                output: {
                    message: {
                        role: 'assistant',
                        content: [{ text: 'test' }]
                    }
                },
                stopReason: 'tool_use',
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
            };

            const result = translator.responseToOpenAI(response);
            expect(result.finishReason).toBe('tool_calls');
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
                maxTokens: 100
            };

            const bedrock = translator.fromOpenAI(original);
            const roundTrip = translator.toOpenAI(bedrock);

            expect(roundTrip.messages[0].content[0]).toEqual({ type: 'text', text: 'Test message' });
            expect(roundTrip.maxTokens).toBe(100);
        });
    });
});
