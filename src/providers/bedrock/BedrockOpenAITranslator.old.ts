/**
 * Bedrock OpenAI Translator - Convert between AWS Bedrock Converse format and OpenAI
 *
 * @aiInstructions
 * Bedrock uses the Converse API which is similar to Anthropic's format but with
 * slight differences. Bedrock hosts multiple model providers (Anthropic, Meta, etc.)
 * so the format needs to be flexible.
 */

import { IOpenAITranslator } from '../../core/translator/IOpenAITranslator';
import { OpenAIContext } from '../../core/types/Context';
import { OpenAIMessage, OpenAIContent } from '../../core/types/Message';
import { ModelResponse, TokenUsage } from '../../core/types/Response';

/**
 * Bedrock Converse API message format
 */
export interface BedrockMessage {
    role: 'user' | 'assistant';
    content: BedrockContent[];
}

export type BedrockContent =
    | { text: string }
    | { image: { format: string; source: { bytes: Buffer } } }
    | { document: { format: string; name: string; source: { bytes: Buffer } } }
    | { toolUse: { toolUseId: string; name: string; input: any } }
    | { toolResult: { toolUseId: string; content: BedrockContent[]; status?: string } };

export interface BedrockRequest {
    modelId: string;
    messages: BedrockMessage[];
    system?: Array<{ text: string }>;
    inferenceConfig?: {
        maxTokens?: number;
        temperature?: number;
        topP?: number;
        stopSequences?: string[];
    };
    toolConfig?: {
        tools: Array<{
            toolSpec: {
                name: string;
                description?: string;
                inputSchema: {
                    json: any;
                };
            };
        }>;
    };
}

export interface BedrockResponse {
    output: {
        message: {
            role: 'assistant';
            content: BedrockContent[];
        };
    };
    stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'content_filtered';
    usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
    };
    metrics?: {
        latencyMs: number;
    };
}

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
                content.push(this.contentToOpenAI(block));
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
     */
    fromOpenAI(rosettaContext: OpenAIContext): BedrockRequest {
        const bedrockMessages: BedrockMessage[] = [];
        let systemPrompts: Array<{ text: string }> | undefined;

        // Extract system messages
        const systemMessages = rosettaContext.messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            systemPrompts = systemMessages
                .flatMap(msg => msg.content)
                .filter(c => c.type === 'text')
                .map(c => ({ text: c.text }));
        }

        // Convert user/assistant/tool messages
        // NOTE: Bedrock only supports user/assistant roles
        // Tool results must be embedded as toolResult content in user messages
        for (const msg of rosettaContext.messages) {
            if (msg.role === 'system') continue;

            const content: BedrockContent[] = [];

            for (const block of msg.content) {
                const converted = this.contentFromOpenAI(block);
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
            modelId: '', // Set by provider implementation
            messages: bedrockMessages,
            system: systemPrompts,
            inferenceConfig: {
                maxTokens: rosettaContext.maxTokens,
                temperature: rosettaContext.temperature,
                topP: rosettaContext.topP
            },
            toolConfig: rosettaContext.tools
                ? {
                      tools: rosettaContext.tools.map(tool => ({
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
            content.push(this.contentToOpenAI(block));
        }

        const usage: TokenUsage = {
            inputTokens: bedrockResponse.usage.inputTokens,
            outputTokens: bedrockResponse.usage.outputTokens,
            totalTokens: bedrockResponse.usage.totalTokens
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
            id: `bedrock-${Date.now()}`, // Bedrock doesn't return ID
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

    /**
     * Convert single Bedrock content block to OpenAI
     */
    private contentToOpenAI(block: BedrockContent): OpenAIContent {
        if ('text' in block) {
            return { type: 'text', text: block.text };
        }

        if ('image' in block) {
            return {
                type: 'image',
                source: {
                    type: 'base64',
                    mediaType: `image/${block.image.format}`,
                    data: block.image.source.bytes.toString('base64')
                }
            };
        }

        if ('document' in block) {
            return {
                type: 'document',
                url: `data:application/${block.document.format};base64,${block.document.source.bytes.toString('base64')}`,
                mimeType: `application/${block.document.format}`,
                text: block.document.source.bytes.toString('utf-8'),
                metadata: {
                    title: block.document.name
                }
            };
        }

        if ('toolUse' in block) {
            return {
                type: 'tool_call',
                id: block.toolUse.toolUseId,
                name: block.toolUse.name,
                arguments: block.toolUse.input
            };
        }

        if ('toolResult' in block) {
            const resultText = block.toolResult.content
                .filter(c => 'text' in c)
                .map(c => (c as any).text)
                .join('\n');

            return {
                type: 'tool_result',
                toolCallId: block.toolResult.toolUseId,
                content: resultText
            };
        }

        // Fallback
        return { type: 'text', text: JSON.stringify(block) };
    }

    /**
     * Convert OpenAI content to Bedrock format
     */
    private contentFromOpenAI(rosetta: OpenAIContent): BedrockContent | null {
        if (rosetta.type === 'text') {
            return { text: rosetta.text };
        }

        if (rosetta.type === 'image') {
            if (rosetta.source?.type === 'base64') {
                const format = rosetta.source.mediaType?.split('/')[1] || 'png';
                return {
                    image: {
                        format,
                        source: {
                            bytes: Buffer.from(rosetta.source.data || '', 'base64')
                        }
                    }
                };
            }
        }

        if (rosetta.type === 'document') {
            // Extract format from mimeType (e.g., "application/pdf" → "pdf")
            const format = rosetta.mimeType?.split('/')[1] || 'txt';
            return {
                document: {
                    format: format as any,
                    name: rosetta.metadata?.title || 'document',
                    source: {
                        bytes: Buffer.from(rosetta.text || '', 'utf-8')
                    }
                }
            };
        }

        if (rosetta.type === 'tool_call') {
            return {
                toolUse: {
                    toolUseId: rosetta.id || '',
                    name: rosetta.name || '',
                    input: rosetta.arguments
                }
            };
        }

        if (rosetta.type === 'tool_result') {
            return {
                toolResult: {
                    toolUseId: rosetta.toolCallId || '',
                    content: [{ text: (rosetta.content as string) || (rosetta.result as string) || '' }]
                }
            };
        }

        // Unsupported types - skip
        return null;
    }
}
