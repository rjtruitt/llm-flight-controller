/**
 * Capabilities Types - Model capability definitions
 *
 * @aiInstructions
 * Capabilities define what a model can do. Use these to:
 * - Select the right model for a task
 * - Validate requests before sending
 * - Handle provider differences gracefully
 *
 * @aiExample
 * ```typescript
 * // Check if model supports vision
 * if (model.capabilities.has(ModelCapability.IMAGE_INPUT)) {
 *   // Send image
 * }
 *
 * // Find models that support function calling
 * const functionModels = registry.findByCapability(
 *   ModelCapability.FUNCTION_CALLING
 * );
 * ```
 *
 * @aiWhenToUse
 * Use capabilities when:
 * - Selecting models dynamically based on requirements
 * - Validating features before use
 * - Building capability-aware orchestrators
 * - Handling graceful degradation
 */

/**
 * Model capabilities enum
 */
export enum ModelCapability {
    // Text capabilities
    TEXT_GENERATION = 'text_generation',
    TEXT_COMPLETION = 'text_completion',
    CHAT = 'chat',
    CODE_GENERATION = 'code_generation',

    // Vision capabilities
    IMAGE_INPUT = 'image_input',
    IMAGE_GENERATION = 'image_generation',
    IMAGE_EDITING = 'image_editing',
    OCR = 'ocr',

    // Audio capabilities
    AUDIO_INPUT = 'audio_input',
    AUDIO_GENERATION = 'audio_generation',
    TRANSCRIPTION = 'transcription',
    TEXT_TO_SPEECH = 'text_to_speech',

    // Advanced features
    FUNCTION_CALLING = 'function_calling',
    STREAMING = 'streaming',
    EMBEDDINGS = 'embeddings',

    // Context
    LONG_CONTEXT = 'long_context',     // >100k tokens
    PROMPT_CACHING = 'prompt_caching',

    // Multimodal
    MULTIMODAL_INPUT = 'multimodal_input',
    MULTIMODAL_OUTPUT = 'multimodal_output'
}

/**
 * Tool handling mode
 */
export type ToolHandlingMode =
    | 'native'   // Provider has native function calling
    | 'context'  // Tools injected as text in context
    | 'none';    // No tool support

/**
 * Input/output types
 */
export type ContentType = 'text' | 'image' | 'audio' | 'video';

/**
 * Detailed feature information
 */
export interface ModelFeatures {
    /** Maximum context window size in tokens */
    contextWindow: number;
    /** Maximum output tokens per request */
    maxOutputTokens: number;
    /** Supports streaming responses */
    supportsStreaming: boolean;
    /** Supports function/tool calling */
    supportsFunctions: boolean;
    /** Supports vision/image input */
    supportsVision: boolean;
    /** Supports audio input */
    supportsAudio: boolean;
}

/**
 * Tool handling configuration
 */
export interface ToolHandling {
    /** How this model handles tools */
    mode: ToolHandlingMode;
    /** Maximum number of tools that can be provided */
    maxTools?: number;
    /** Supports parallel tool calls */
    supportsParallel?: boolean;
}

/**
 * Model capabilities
 */
export interface ModelCapabilities {
    /** Set of capabilities this model has */
    capabilities: Set<ModelCapability>;
    /** Detailed feature information */
    features: ModelFeatures;
    /** Tool handling configuration */
    toolHandling: ToolHandling;
    /** Supported input types */
    inputTypes: Set<ContentType>;
    /** Supported output types */
    outputTypes: Set<ContentType>;
}
