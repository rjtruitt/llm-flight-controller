"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCapability = void 0;
/**
 * Model capabilities enum
 */
var ModelCapability;
(function (ModelCapability) {
    // Text capabilities
    ModelCapability["TEXT_GENERATION"] = "text_generation";
    ModelCapability["TEXT_COMPLETION"] = "text_completion";
    ModelCapability["CHAT"] = "chat";
    ModelCapability["CODE_GENERATION"] = "code_generation";
    // Vision capabilities
    ModelCapability["IMAGE_INPUT"] = "image_input";
    ModelCapability["IMAGE_GENERATION"] = "image_generation";
    ModelCapability["IMAGE_EDITING"] = "image_editing";
    ModelCapability["OCR"] = "ocr";
    // Audio capabilities
    ModelCapability["AUDIO_INPUT"] = "audio_input";
    ModelCapability["AUDIO_GENERATION"] = "audio_generation";
    ModelCapability["TRANSCRIPTION"] = "transcription";
    ModelCapability["TEXT_TO_SPEECH"] = "text_to_speech";
    // Advanced features
    ModelCapability["FUNCTION_CALLING"] = "function_calling";
    ModelCapability["STREAMING"] = "streaming";
    ModelCapability["EMBEDDINGS"] = "embeddings";
    // Context
    ModelCapability["LONG_CONTEXT"] = "long_context";
    ModelCapability["PROMPT_CACHING"] = "prompt_caching";
    // Multimodal
    ModelCapability["MULTIMODAL_INPUT"] = "multimodal_input";
    ModelCapability["MULTIMODAL_OUTPUT"] = "multimodal_output";
})(ModelCapability || (exports.ModelCapability = ModelCapability = {}));
//# sourceMappingURL=Capabilities.js.map