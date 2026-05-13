/**
 * LLM Flight Controller - Main entry point
 *
 * Route, switch, and manage your LLM fleet. Seamlessly transition conversations
 * across any model or provider without losing context.
 *
 * @packageDocumentation
 */

// Providers
export { BedrockProvider, BedrockProviderConfig } from './providers/bedrock/BedrockProvider';
export { OpenAIProvider, OpenAIProviderConfig, OpenAIProviders } from './providers/openai/OpenAIProvider';
export { AnthropicProvider, AnthropicProviderConfig } from './providers/anthropic/AnthropicProvider';
export { GeminiProvider, GeminiProviderConfig } from './providers/gemini/GeminiProvider';

// Core model
export { Model, ModelConfig } from './core/model/Model';
export { ModelIdentity } from './core/model/ModelIdentity';
export { ITokenCounter } from './core/model/ITokenCounter';

// Rate limiting
export { CombinedRateLimiter, CombinedLimitConfig } from './core/limits/CombinedRateLimiter';
export { BottleneckRateLimiter, BottleneckLimitConfig } from './core/limits/BottleneckRateLimiter';
export { AdaptiveRateLimiter, RateLimitConfig } from './core/limits/AdaptiveRateLimiter';
export { RateLimit } from './core/limits/RateLimit';
export { SessionLimit } from './core/limits/SessionLimit';
export { IRateLimiter } from './core/limits/IRateLimiter';
export { ISessionLimiter } from './core/limits/ISessionLimiter';
export { IRateLimitStrategy } from './core/limits/IRateLimitStrategy';
export { TokenBucketStrategy } from './core/limits/TokenBucketStrategy';
export { FixedWindowStrategy } from './core/limits/FixedWindowStrategy';
export { IResetCalculator } from './core/limits/SessionResetCalculator';

// Types
export { OpenAIContext } from './core/types/Context';
export { OpenAIMessage, OpenAIContent } from './core/types/Message';
export { ModelResponse, TokenUsage } from './core/types/Response';
export { ModelCapabilities, ModelCapability, ContentType } from './core/types/Capabilities';

// Translators
export { IOpenAITranslator } from './core/translator/IOpenAITranslator';
export { BedrockOpenAITranslator } from './providers/bedrock/BedrockOpenAITranslator';
export { OpenAIOpenAITranslator } from './providers/openai/OpenAIOpenAITranslator';
export { AnthropicOpenAITranslator } from './providers/anthropic/AnthropicOpenAITranslator';
export { GeminiOpenAITranslator } from './providers/gemini/GeminiOpenAITranslator';

// Registry
export { ModelRegistry } from './core/registry/ModelRegistry';

// Error handling
export { IErrorHandler } from './core/errors/IErrorHandler';
export { IErrorClassifier } from './core/errors/IErrorClassifier';
export { DefaultErrorClassifier } from './core/errors/DefaultErrorClassifier';
export { BaseErrorHandler } from './core/errors/BaseErrorHandler';
export { BlockerEvent } from './core/events/BlockerEvent';
export {
    LLMError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    ModelNotFoundError,
    ProviderError,
    ContextLengthError,
    NetworkError,
    ParseError
} from './core/errors/LLMError';

// Auth providers
export { AWSAuthProvider } from './auth/AWSAuthProvider';
export { AWSSSOAuth } from './auth/AWSSSOAuth';
export { IAuthProvider, IAuthHandler, DeviceCodeInfo } from './auth/IAuthProvider';
