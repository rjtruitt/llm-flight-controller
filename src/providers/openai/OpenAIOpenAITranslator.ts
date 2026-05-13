/**
 * OpenAI OpenAI Translator - Convert between OpenAI format and OpenAI
 *
 * @aiInstruction
 * Handles OpenAI chat completion format and all OpenAI-compatible providers:
 * OpenAI (GPT-4, GPT-4o, o1, o3), DeepSeek, Groq, Together AI, Perplexity,
 * Ollama (local), LM Studio (local), vLLM (local), any OpenAI-compatible endpoint.
 * Supports text, images, tool calls, and reasoning content (o1/o3 models).
 *
 * @aiExample
 * import { OpenAIOpenAITranslator } from './OpenAIOpenAITranslator';
 * const translator = new OpenAIOpenAITranslator();
 * const request = translator.fromOpenAI(context);
 * const response = await openai.chat.completions.create(request);
 * const modelResponse = translator.responseToOpenAI(response);
 */

import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message';
import { ModelResponse, TokenUsage } from '../../core/types/Response';
import { OpenAIRequest, OpenAIResponse, OpenAINativeMessage, OpenAINativeContent, OpenAIToolCall } from './OpenAITypes';
import { contentToOpenAI, contentFromOpenAI } from './OpenAIContentConverter';

/**
 * OpenAI OpenAI Translator
 */
export class OpenAIOpenAITranslator implements IOpenAITranslator<OpenAIRequest, OpenAIResponse> {
    getProviderId(): string {
        return 'openai';
    }

    /**
     * Convert OpenAI native format to library format
     */
    toOpenAI(openaiRequest: OpenAIRequest): OpenAIContext {
        const messages: OpenAIMessage[] = [];

        for (const msg of openaiRequest.messages) {
            const content: OpenAIContent[] = [];

            // Handle string content
            if (typeof msg.content === 'string') {
                content.push({ type: 'text', text: msg.content });
            }
            // Handle array content
            else if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    const converted = contentToOpenAI(block);
                    if (converted) content.push(converted);
                }
            }

            // Handle tool calls
            if (msg.tool_calls) {
                for (const toolCall of msg.tool_calls) {
                    content.push({
                        type: 'tool_call',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        arguments: JSON.parse(toolCall.function.arguments)
                    });
                }
            }

            // Handle tool results
            if (msg.role === 'tool' && msg.tool_call_id) {
                content.push({
                    type: 'tool_result',
                    toolCallId: msg.tool_call_id,
                    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                });
            }

            messages.push({
                role: (msg.role === 'tool' ? 'user' : msg.role) as 'user' | 'assistant' | 'system',
                content
            });
        }

        return {
            messages,
            tools: openaiRequest.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }
            })),
            maxTokens: openaiRequest.max_tokens,
            temperature: openaiRequest.temperature,
            topP: openaiRequest.top_p
        };
    }

    /**
     * Convert library format to OpenAI native format
     */
    fromOpenAI(context: OpenAIContext): OpenAIRequest {
        const openaiMessages: OpenAINativeMessage[] = [];

        for (const msg of context.messages) {
            // Separate tool calls and tool results from other content
            const regularContent: OpenAINativeContent[] = [];
            const toolCalls: OpenAIToolCall[] = [];
            let toolCallId: string | undefined;

            for (const block of msg.content) {
                if (block.type === 'tool_call') {
                    toolCalls.push({
                        id: block.id || '',
                        type: 'function',
                        function: {
                            name: block.name || '',
                            arguments: JSON.stringify(block.arguments)
                        }
                    });
                } else if (block.type === 'tool_result') {
                    toolCallId = block.toolCallId;
                    regularContent.push({
                        type: 'text',
                        text: (block.content as string) || ''
                    });
                } else {
                    const converted = contentFromOpenAI(block);
                    if (converted) regularContent.push(converted);
                }
            }

            // Tool results get their own message
            if (toolCallId) {
                openaiMessages.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: regularContent.length > 0
                        ? regularContent[0].type === 'text' ? regularContent[0].text : JSON.stringify(regularContent)
                        : ''
                });
            }
            // Regular message
            else {
                const message: OpenAINativeMessage = {
                    role: msg.role as 'system' | 'user' | 'assistant',
                    content: regularContent.length === 1 && regularContent[0].type === 'text'
                        ? regularContent[0].text
                        : regularContent
                };

                if (toolCalls.length > 0) {
                    message.tool_calls = toolCalls;
                }

                openaiMessages.push(message);
            }
        }

        return {
            model: '',
            messages: openaiMessages,
            max_tokens: context.maxTokens,
            temperature: context.temperature,
            top_p: context.topP,
            tools: context.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.function.name,
                    description: tool.function.description,
                    parameters: tool.function.parameters
                }
            }))
        };
    }

    /**
     * Convert OpenAI response to library ModelResponse
     */
    responseToOpenAI(openaiResponse: OpenAIResponse): ModelResponse {
        const choice = openaiResponse.choices[0];
        const content: OpenAIContent[] = [];

        // Regular text content
        if (choice.message.content) {
            content.push({ type: 'text', text: choice.message.content });
        }

        // Reasoning content (o1/o3)
        if (choice.message.reasoning_content) {
            content.push({ type: 'thinking', text: choice.message.reasoning_content });
        }

        // Tool calls
        if (choice.message.tool_calls) {
            for (const toolCall of choice.message.tool_calls) {
                content.push({
                    type: 'tool_call',
                    id: toolCall.id,
                    name: toolCall.function.name,
                    arguments: JSON.parse(toolCall.function.arguments)
                });
            }
        }

        const usage: TokenUsage = {
            inputTokens: openaiResponse.usage.prompt_tokens,
            outputTokens: openaiResponse.usage.completion_tokens,
            totalTokens: openaiResponse.usage.total_tokens,
            reasoningTokens: openaiResponse.usage.reasoning_tokens
        };

        return {
            id: openaiResponse.id,
            content,
            usage,
            finishReason: choice.finish_reason,
            metadata: {
                providerId: 'openai',
                modelId: openaiResponse.model,
                custom: {
                    created: openaiResponse.created
                }
            }
        };
    }
}
