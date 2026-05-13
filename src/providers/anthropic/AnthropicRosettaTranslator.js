"use strict";
/**
 * Anthropic Rosetta Translator - Convert between Anthropic format and Rosetta
 *
 * @aiInstructions
 * Translates Anthropic's message format to/from Rosetta universal format.
 * Handles Anthropic-specific features like prompt caching, thinking blocks, etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicRosettaTranslator = void 0;
/**
 * Anthropic Rosetta Translator
 */
class AnthropicRosettaTranslator {
    getProviderId() {
        return 'anthropic';
    }
    /**
     * Convert Anthropic format to Rosetta
     */
    toRosetta(anthropicRequest) {
        const messages = [];
        // Convert system message if present
        if (anthropicRequest.system) {
            if (typeof anthropicRequest.system === 'string') {
                messages.push({
                    role: 'system',
                    content: [{ type: 'text', text: anthropicRequest.system }]
                });
            }
            else {
                messages.push({
                    role: 'system',
                    content: anthropicRequest.system.map(block => this.contentToRosetta(block))
                });
            }
        }
        // Convert messages
        for (const msg of anthropicRequest.messages) {
            const content = [];
            if (typeof msg.content === 'string') {
                content.push({ type: 'text', text: msg.content });
            }
            else {
                content.push(...msg.content.map(block => this.contentToRosetta(block)));
            }
            messages.push({
                role: msg.role,
                content
            });
        }
        return {
            messages,
            tools: anthropicRequest.tools?.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.input_schema
                }
            })),
            maxTokens: anthropicRequest.max_tokens,
            temperature: anthropicRequest.temperature,
            topP: anthropicRequest.top_p
        };
    }
    /**
     * Convert Rosetta format to Anthropic
     */
    fromRosetta(rosettaContext) {
        const anthropicMessages = [];
        let systemPrompt;
        // Extract system message
        const systemMessages = rosettaContext.messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            const systemContent = systemMessages.flatMap(msg => msg.content);
            const hasCache = systemContent.some(c => c.type === 'cache_marker');
            if (hasCache || systemContent.length > 1) {
                // Use array format for caching
                systemPrompt = systemContent
                    .filter(c => c.type === 'text')
                    .map(c => ({
                    type: 'text',
                    text: c.text,
                    ...(c.type === 'cache_marker' ? { cache_control: { type: 'ephemeral' } } : {})
                }));
            }
            else {
                // Simple string format
                systemPrompt = systemContent.find(c => c.type === 'text')?.text;
            }
        }
        // Convert user/assistant messages
        for (const msg of rosettaContext.messages) {
            if (msg.role === 'system')
                continue;
            const content = msg.content.map(block => this.contentFromRosetta(block));
            anthropicMessages.push({
                role: msg.role,
                content
            });
        }
        return {
            model: '', // Set by provider implementation
            messages: anthropicMessages,
            system: systemPrompt,
            max_tokens: rosettaContext.maxTokens || 4096,
            temperature: rosettaContext.temperature,
            top_p: rosettaContext.topP,
            tools: rosettaContext.tools?.map(tool => ({
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters
            }))
        };
    }
    /**
     * Convert Anthropic response to Rosetta ModelResponse
     */
    responseToRosetta(anthropicResponse) {
        const content = anthropicResponse.content.map(block => this.contentToRosetta(block));
        const usage = {
            inputTokens: anthropicResponse.usage.input_tokens,
            outputTokens: anthropicResponse.usage.output_tokens,
            totalTokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens,
            cacheReadTokens: anthropicResponse.usage.cache_read_input_tokens,
            cacheWriteTokens: anthropicResponse.usage.cache_creation_input_tokens
        };
        return {
            id: anthropicResponse.id,
            content,
            usage,
            finishReason: anthropicResponse.stop_reason,
            metadata: {
                providerId: 'anthropic',
                modelId: anthropicResponse.model,
                custom: {
                    stopSequence: anthropicResponse.stop_sequence
                }
            }
        };
    }
    /**
     * Convert single Anthropic content block to Rosetta
     */
    contentToRosetta(block) {
        if (block.type === 'text') {
            if ('cache_control' in block && block.cache_control) {
                return { type: 'cache_marker', text: block.text };
            }
            return { type: 'text', text: block.text };
        }
        if (block.type === 'image') {
            return {
                type: 'image',
                source: {
                    type: block.source.type === 'base64' ? 'base64' : 'url',
                    mediaType: block.source.media_type,
                    data: block.source.data
                }
            };
        }
        if (block.type === 'tool_use') {
            return {
                type: 'tool_call',
                id: block.id,
                name: block.name,
                arguments: block.input
            };
        }
        if (block.type === 'tool_result') {
            return {
                type: 'tool_result',
                toolCallId: block.tool_use_id,
                content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
            };
        }
        // Fallback
        return { type: 'text', text: JSON.stringify(block) };
    }
    /**
     * Convert Rosetta content to Anthropic format
     */
    contentFromRosetta(rosetta) {
        if (rosetta.type === 'text') {
            return { type: 'text', text: rosetta.text };
        }
        if (rosetta.type === 'cache_marker') {
            return {
                type: 'text',
                text: rosetta.text || '',
                cache_control: { type: 'ephemeral' }
            };
        }
        if (rosetta.type === 'image') {
            return {
                type: 'image',
                source: {
                    type: rosetta.source?.type === 'url' ? 'url' : 'base64',
                    media_type: rosetta.source?.mediaType || 'image/png',
                    data: rosetta.source?.data || ''
                }
            };
        }
        if (rosetta.type === 'tool_call') {
            return {
                type: 'tool_use',
                id: rosetta.id || '',
                name: rosetta.name || '',
                input: rosetta.arguments
            };
        }
        if (rosetta.type === 'tool_result') {
            return {
                type: 'tool_result',
                tool_use_id: rosetta.toolCallId || '',
                content: rosetta.content || ''
            };
        }
        // Fallback - convert unknown types to text
        return {
            type: 'text',
            text: `[${rosetta.type}]: ${JSON.stringify(rosetta)}`
        };
    }
}
exports.AnthropicRosettaTranslator = AnthropicRosettaTranslator;
//# sourceMappingURL=AnthropicRosettaTranslator.js.map