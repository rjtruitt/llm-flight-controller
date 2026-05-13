/**
 * Tool-related Content Types
 */

/**
 * Tool call from assistant
 */
export interface ToolCallContent {
    type: 'tool_call';
    /** Unique ID for this tool call */
    id: string;
    /** Name of the function to call */
    name: string;
    /** Arguments as JSON object */
    args: Record<string, any>;
}

/**
 * Tool result from user
 */
export interface ToolResultContent {
    type: 'tool_result';
    /** ID matching the tool_call */
    id: string;
    /** Result content (can be text or structured) */
    result: string | Record<string, any>;
    /** Whether the tool call succeeded */
    success?: boolean;
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
    /** Function name */
    name: string;
    /** Human-readable description */
    description: string;
    /** Input schema (JSON Schema) */
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}
