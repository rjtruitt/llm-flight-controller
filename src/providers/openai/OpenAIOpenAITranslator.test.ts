import { describe, it, expect } from 'vitest';
import { OpenAIOpenAITranslator } from './OpenAIOpenAITranslator';
import { OpenAIRequest, OpenAIResponse } from './OpenAITypes';
import { OpenAIContext } from '../../core/types/Context';

describe('OpenAIOpenAITranslator', () => {
    const translator = new OpenAIOpenAITranslator();

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
            expect(result.messages[0].content).toBe('Hello');
        });

        it('should keep system message in messages array', () => {
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

            expect(result.messages).toHaveLength(2);
            expect(result.messages[0].role).toBe('system');
            expect(result.messages[0].content).toBe('You are helpful');
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
                                    type: 'url',
                                    data: 'https://example.com/image.png'
                                }
                            }
                        ]
                    }
                ]
            };

            const result = translator.fromOpenAI(context);

            expect(Array.isArray(result.messages[0].content)).toBe(true);
            const content = result.messages[0].content as any[];
            expect(content[0].type).toBe('image_url');
            expect(content[0].image_url.url).toBe('https://example.com/image.png');
        });

        it('should convert base64 images', () => {
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

            const content = result.messages[0].content as any[];
            expect(content[0].image_url.url).toBe('data:image/png;base64,base64data');
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

            expect(result.messages[0].tool_calls).toHaveLength(1);
            expect(result.messages[0].tool_calls![0]).toEqual({
                id: 'call_123',
                type: 'function',
                function: {
                    name: 'get_weather',
                    arguments: JSON.stringify({ city: 'SF' })
                }
            });
        });

        it('should convert tool results to tool role message', () => {
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

            expect(result.messages[0].role).toBe('tool');
            expect(result.messages[0].tool_call_id).toBe('call_123');
            expect(result.messages[0].content).toBe('Sunny, 72F');
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
                type: 'function',
                function: {
                    name: 'get_weather',
                    description: 'Get weather',
                    parameters: { type: 'object', properties: {} }
                }
            });
        });

        it('should set generation parameters', () => {
            const context: OpenAIContext = {
                messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
                maxTokens: 200,
                temperature: 0.8,
                topP: 0.9
            };

            const result = translator.fromOpenAI(context);

            expect(result.max_tokens).toBe(200);
            expect(result.temperature).toBe(0.8);
            expect(result.top_p).toBe(0.9);
        });
    });

    describe('toOpenAI', () => {
        it('should convert OpenAI request to library context', () => {
            const openaiRequest: OpenAIRequest = {
                model: 'gpt-4',
                messages: [
                    {
                        role: 'user',
                        content: 'Hello'
                    }
                ]
            };

            const result = translator.toOpenAI(openaiRequest);

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');
            expect(result.messages[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
        });

        it('should convert array content', () => {
            const openaiRequest: OpenAIRequest = {
                model: 'gpt-4',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Hello' }
                        ]
                    }
                ]
            };

            const result = translator.toOpenAI(openaiRequest);

            expect(result.messages[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
        });

        it('should convert tool role to user and create tool_result', () => {
            const openaiRequest: OpenAIRequest = {
                model: 'gpt-4',
                messages: [
                    {
                        role: 'tool',
                        content: 'Result',
                        tool_call_id: 'call_123'
                    }
                ]
            };

            const result = translator.toOpenAI(openaiRequest);

            expect(result.messages[0].role).toBe('user');
            // Implementation creates both text content and tool_result
            expect(result.messages[0].content).toHaveLength(2);
            const textContent = result.messages[0].content[0];
            expect(textContent.type).toBe('text');
            const toolResult = result.messages[0].content[1];
            expect(toolResult.type).toBe('tool_result');
            expect((toolResult as any).toolCallId).toBe('call_123');
        });
    });

    describe('responseToOpenAI', () => {
        it('should convert OpenAI response', () => {
            const openaiResponse: OpenAIResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1234567890,
                model: 'gpt-4',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: 'Hello!'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15
                }
            };

            const result = translator.responseToOpenAI(openaiResponse);

            expect(result.id).toBe('chatcmpl-123');
            expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
            expect(result.usage.inputTokens).toBe(10);
            expect(result.usage.outputTokens).toBe(5);
            expect(result.usage.totalTokens).toBe(15);
            expect(result.finishReason).toBe('stop');
            expect(result.metadata.providerId).toBe('openai');
            expect(result.metadata.modelId).toBe('gpt-4');
        });

        it('should handle reasoning content (o1/o3)', () => {
            const openaiResponse: OpenAIResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1234567890,
                model: 'o1-preview',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: 'Answer',
                            reasoning_content: 'Thinking...'
                        },
                        finish_reason: 'stop'
                    }
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                    reasoning_tokens: 3
                }
            };

            const result = translator.responseToOpenAI(openaiResponse);

            expect(result.content).toHaveLength(2);
            expect(result.content[0]).toEqual({ type: 'text', text: 'Answer' });
            expect(result.content[1]).toEqual({ type: 'thinking', text: 'Thinking...' });
            expect(result.usage.reasoningTokens).toBe(3);
        });

        it('should handle tool calls in response', () => {
            const openaiResponse: OpenAIResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1234567890,
                model: 'gpt-4',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: null,
                            tool_calls: [
                                {
                                    id: 'call_123',
                                    type: 'function',
                                    function: {
                                        name: 'get_weather',
                                        arguments: JSON.stringify({ city: 'SF' })
                                    }
                                }
                            ]
                        },
                        finish_reason: 'tool_calls'
                    }
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15
                }
            };

            const result = translator.responseToOpenAI(openaiResponse);

            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toEqual({
                type: 'tool_call',
                id: 'call_123',
                name: 'get_weather',
                arguments: { city: 'SF' }
            });
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
                maxTokens: 100,
                temperature: 0.7
            };

            const openai = translator.fromOpenAI(original);
            const roundTrip = translator.toOpenAI(openai);

            expect(roundTrip.messages[0].content[0]).toEqual({ type: 'text', text: 'Test message' });
            expect(roundTrip.maxTokens).toBe(100);
            expect(roundTrip.temperature).toBe(0.7);
        });
    });
});
