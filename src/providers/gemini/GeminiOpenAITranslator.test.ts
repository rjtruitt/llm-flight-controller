import { describe, it, expect } from 'vitest';
import { GeminiOpenAITranslator } from './GeminiOpenAITranslator';
import { GeminiRequest, GeminiResponse } from './GeminiTypes';
import { OpenAIContext } from '../../core/types/Context';

describe('GeminiOpenAITranslator', () => {
    const translator = new GeminiOpenAITranslator();

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

            expect(result.contents).toHaveLength(1);
            expect(result.contents[0].role).toBe('user');
            expect(result.contents[0].parts).toEqual([{ text: 'Hello' }]);
            expect(result.generationConfig?.maxOutputTokens).toBe(100);
        });

        it('should convert system message to systemInstruction', () => {
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

            expect(result.systemInstruction).toEqual({
                role: 'user',
                parts: [{ text: 'You are helpful' }]
            });
            expect(result.contents).toHaveLength(1);
            expect(result.contents[0].role).toBe('user');
        });

        it('should convert assistant role to model', () => {
            const context: OpenAIContext = {
                messages: [
                    {
                        role: 'assistant',
                        content: [{ type: 'text', text: 'Hello!' }]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(result.contents[0].role).toBe('model');
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

            expect(result.contents[0].parts[0]).toEqual({
                inlineData: {
                    mimeType: 'image/png',
                    data: 'base64data'
                }
            });
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

            expect(result.contents[0].parts[0]).toEqual({
                functionCall: {
                    name: 'get_weather',
                    args: { city: 'SF' }
                }
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
            expect(result.tools![0].functionDeclarations[0]).toEqual({
                name: 'get_weather',
                description: 'Get weather',
                parameters: { type: 'object', properties: {} }
            });
        });
    });

    describe('toOpenAI', () => {
        it('should convert Gemini request to OpenAI context', () => {
            const geminiRequest: GeminiRequest = {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: 'Hello' }]
                    }
                ],
                generationConfig: {
                    maxOutputTokens: 100,
                    temperature: 0.7
                }
            };

            const result = translator.toOpenAI(geminiRequest);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
            expect(result.messages[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
            expect(result.maxTokens).toBe(100);
            expect(result.temperature).toBe(0.7);
        });

        it('should convert model role to assistant', () => {
            const geminiRequest: GeminiRequest = {
                contents: [
                    {
                        role: 'model',
                        parts: [{ text: 'Hi!' }]
                    }
                ]
            };

            const result = translator.toOpenAI(geminiRequest);

            expect(result.messages[0].role).toBe('assistant');
        });
    });

    describe('responseToOpenAI', () => {
        it('should convert Gemini response', () => {
            const geminiResponse: GeminiResponse = {
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Hello!' }],
                            role: 'model'
                        },
                        finishReason: 'STOP',
                        index: 0
                    }
                ],
                usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 5,
                    totalTokenCount: 15
                }
            };

            const result = translator.responseToOpenAI(geminiResponse);

            expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
            expect(result.usage.inputTokens).toBe(10);
            expect(result.usage.outputTokens).toBe(5);
            expect(result.usage.totalTokens).toBe(15);
            expect(result.finishReason).toBe('stop');
            expect(result.metadata.providerId).toBe('gemini');
        });

        it('should map finish reasons correctly', () => {
            const response: GeminiResponse = {
                candidates: [
                    {
                        content: { parts: [{ text: 'test' }], role: 'model' },
                        finishReason: 'MAX_TOKENS',
                        index: 0
                    }
                ]
            };

            const result = translator.responseToOpenAI(response);
            expect(result.finishReason).toBe('length');
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
                temperature: 0.5
            };

            const gemini = translator.fromOpenAI(original);
            const roundTrip = translator.toOpenAI(gemini);

            expect(roundTrip.messages[0].content[0]).toEqual({ type: 'text', text: 'Test message' });
            expect(roundTrip.maxTokens).toBe(100);
            expect(roundTrip.temperature).toBe(0.5);
        });
    });
});
