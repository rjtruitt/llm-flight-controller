/**
 * Bedrock OpenAI Translator - Convert between AWS Bedrock Converse format and OpenAI
 *
 * @aiInstruction
 * Bedrock uses the Converse API which is similar to Anthropic's format.
 * CRITICAL: Bedrock only accepts 'user' and 'assistant' roles (NOT 'tool' role).
 * Tool results must be embedded as toolResult content in user messages.
 * Bedrock hosts multiple model providers (Anthropic, Meta, etc.) so format is flexible.
 *
 * @aiExample
 * import { BedrockOpenAITranslator } from './BedrockOpenAITranslator';
 * const translator = new BedrockOpenAITranslator();
 * const bedrockRequest = translator.fromOpenAI(openaiContext);
 * const bedrockResponse = await bedrockClient.converse(bedrockRequest);
 * const modelResponse = translator.responseToOpenAI(bedrockResponse);
 */

import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message';
import { ModelResponse, TokenUsage } from '../../core/types/Response';
import { BedrockRequest, BedrockResponse, BedrockMessage, BedrockContent } from './BedrockTypes';
import { contentToOpenAI, contentFromOpenAI } from './BedrockContentConverter';

/**
 * Bedrock OpenAI Translator
 */
export class BedrockOpenAITranslator implements IOpenAITranslator<BedrockRequest, BedrockResponse> {
    getProviderId(): string {
        return 'bedrock';
    }

    /**
     * Convert Bedrock format to OpenAI
     */
    toOpenAI(bedrockRequest: BedrockRequest): OpenAIContext {
        const messages: OpenAIMessage[] = [];

        // Convert system messages
        if (bedrockRequest.system) {
            messages.push({
                role: 'system',
                content: bedrockRequest.system.map(s => ({ type: 'text' as const, text: s.text }))
            });
        }

        // Convert messages
        for (const msg of bedrockRequest.messages) {
            const content: OpenAIContent[] = [];

            for (const block of msg.content) {
                content.push(contentToOpenAI(block));
            }

            messages.push({
                role: msg.role,
                content
            });
        }

        return {
            messages,
            tools: bedrockRequest.toolConfig?.tools.map(t => ({
                type: 'function',
                function: {
                    name: t.toolSpec.name,
                    description: t.toolSpec.description,
                    parameters: t.toolSpec.inputSchema.json
                }
            })),
            maxTokens: bedrockRequest.inferenceConfig?.maxTokens,
            temperature: bedrockRequest.inferenceConfig?.temperature,
            topP: bedrockRequest.inferenceConfig?.topP
        };
    }

    /**
     * Convert OpenAI format to Bedrock
     * IMPORTANT: Converts 'tool' role to 'user' since Bedrock only accepts user/assistant
     */
    fromOpenAI(openaiContext: OpenAIContext): BedrockRequest {
        const bedrockMessages: BedrockMessage[] = [];
        let systemPrompts: Array<{ text: string }> | undefined;

        // Extract system messages
        const systemMessages = openaiContext.messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            systemPrompts = systemMessages
                .flatMap(msg => msg.content)
                .filter(c => c.type === 'text')
                .map(c => ({ text: c.text }));
        }

        // Convert user/assistant/tool messages
        // NOTE: Bedrock only supports user/assistant roles
        // Tool results must be embedded as toolResult content in user messages
        for (const msg of openaiContext.messages) {
            if (msg.role === 'system') continue;

            const content: BedrockContent[] = [];

            for (const block of msg.content) {
                const converted = contentFromOpenAI(block);
                if (converted) content.push(converted);
            }

            if (content.length > 0) {
                // Convert any non-standard role to 'user' (Bedrock only accepts user/assistant)
                // This handles 'tool' role from some clients
                const role = (msg.role === 'assistant') ? 'assistant' : 'user';

                bedrockMessages.push({
                    role,
                    content
                });
            }
        }

        return {
            modelId: '',
            messages: bedrockMessages,
            system: systemPrompts,
            inferenceConfig: {
                maxTokens: openaiContext.maxTokens,
                temperature: openaiContext.temperature,
                topP: openaiContext.topP
            },
            // Enable prompt caching if system prompts exist
            promptCachingConfiguration: systemPrompts ? { enabled: true } : undefined,
            toolConfig: openaiContext.tools
                ? {
                      tools: openaiContext.tools.map(tool => ({
                          toolSpec: {
                              name: tool.function.name,
                              description: tool.function.description,
                              inputSchema: {
                                  json: tool.function.parameters
                              }
                          }
                      }))
                  }
                : undefined
        };
    }

    /**
     * Convert Bedrock response to OpenAI ModelResponse
     */
    responseToOpenAI(bedrockResponse: BedrockResponse): ModelResponse {
        const content: OpenAIContent[] = [];

        for (const block of bedrockResponse.output.message.content) {
            content.push(contentToOpenAI(block));
        }

        const usage: TokenUsage = {
            inputTokens: bedrockResponse.usage.inputTokens,
            outputTokens: bedrockResponse.usage.outputTokens,
            totalTokens: bedrockResponse.usage.totalTokens,
            cacheReadTokens: bedrockResponse.usage.cacheReadInputTokens,
            cacheWriteTokens: bedrockResponse.usage.cacheCreationInputTokens
        };

        // Map Bedrock finish reasons to OpenAI format
        const finishReasonMap: Record<string, any> = {
            'end_turn': 'stop',
            'max_tokens': 'length',
            'tool_use': 'tool_calls',
            'stop_sequence': 'stop',
            'content_filtered': 'content_filter'
        };

        return {
            id: `bedrock-${Date.now()}`,
            content,
            usage,
            finishReason: finishReasonMap[bedrockResponse.stopReason] || 'stop',
            metadata: {
                providerId: 'bedrock',
                modelId: 'unknown',
                custom: {
                    metrics: bedrockResponse.metrics
                }
            }
        };
    }
}
