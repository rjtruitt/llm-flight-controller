/**
 * AWS Bedrock API type definitions
 *
 * @aiInstruction
 * Type definitions for AWS Bedrock Converse API format.
 * Bedrock only accepts 'user' and 'assistant' roles (NOT 'tool' role).
 * Supports text, images, documents, and tool use/results.
 * System messages are passed separately in the 'system' field, not in messages array.
 */

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
