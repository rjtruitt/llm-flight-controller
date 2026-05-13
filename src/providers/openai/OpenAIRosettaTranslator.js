"use strict";
/**
 * OpenAI Rosetta Translator - Convert between OpenAI format and Rosetta
 *
 * @aiInstructions
 * Handles OpenAI chat completion format and all OpenAI-compatible providers:
 * - OpenAI (GPT-4, GPT-4o, o1, o3)
 * - DeepSeek (reasoning models)
 * - Groq
 * - Together AI
 * - Perplexity
 * - Ollama (local)
 * - LM Studio (local)
 * - vLLM (local)
 * - Any OpenAI-compatible endpoint
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIRosettaTranslator = void 0;
/**
 * OpenAI Rosetta Translator
 */
class OpenAIRosettaTranslator {
    getProviderId() {
        return 'openai';
    }
    /**
     * Convert OpenAI format to Rosetta
     */
    toRosetta(openaiRequest) {
        const messages = [];
        for (const msg of openaiRequest.messages) {
            const content = [];
            // Handle string content
            if (typeof msg.content === 'string') {
                content.push({ type: 'text', text: msg.content });
            }
            // Handle array content
            else if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    content.push(this.contentToRosetta(block));
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
                role: msg.role === 'tool' ? 'user' : msg.role, // Map tool → user for Rosetta
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
     * Convert Rosetta format to OpenAI
     */
    fromRosetta(rosettaContext) {
        const openaiMessages = [];
        for (const msg of rosettaContext.messages) {
            // Separate tool calls and tool results from other content
            const regularContent = [];
            const toolCalls = [];
            let toolCallId;
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
                }
                else if (block.type === 'tool_result') {
                    toolCallId = block.toolCallId;
                    regularContent.push({
                        type: 'text',
                        text: block.content || ''
                    });
                }
                else {
                    const converted = this.contentFromRosetta(block);
                    if (converted)
                        regularContent.push(converted);
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
                const message = {
                    role: msg.role,
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
            model: '', // Set by provider implementation
            messages: openaiMessages,
            max_tokens: rosettaContext.maxTokens,
            temperature: rosettaContext.temperature,
            top_p: rosettaContext.topP,
            tools: rosettaContext.tools?.map(tool => ({
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
     * Convert OpenAI response to Rosetta ModelResponse
     */
    responseToRosetta(openaiResponse) {
        const choice = openaiResponse.choices[0];
        const content = [];
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
        const usage = {
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
    /**
     * Convert single OpenAI content block to Rosetta
     */
    contentToRosetta(block) {
        if (block.type === 'text') {
            return { type: 'text', text: block.text };
        }
        if (block.type === 'image_url') {
            return {
                type: 'image',
                source: {
                    type: 'url',
                    data: block.image_url.url
                }
            };
        }
        // Fallback
        return { type: 'text', text: JSON.stringify(block) };
    }
    /**
     * Convert Rosetta content to OpenAI format
     */
    contentFromRosetta(rosetta) {
        if (rosetta.type === 'text') {
            return { type: 'text', text: rosetta.text };
        }
        if (rosetta.type === 'image') {
            if (rosetta.source?.type === 'url') {
                return {
                    type: 'image_url',
                    image_url: { url: rosetta.source.data || '' }
                };
            }
            if (rosetta.source?.type === 'base64') {
                return {
                    type: 'image_url',
                    image_url: { url: `data:${rosetta.source.mediaType};base64,${rosetta.source.data}` }
                };
            }
        }
        // Unsupported types (audio, video, etc.) - skip
        return null;
    }
}
exports.OpenAIRosettaTranslator = OpenAIRosettaTranslator;
//# sourceMappingURL=OpenAIRosettaTranslator.js.map