# LLM Flight Controller

Universal orchestration layer for LLM providers. Switch between models seamlessly with automatic context translation, intelligent routing, and adaptive rate limiting.

## Features

- 🔄 **Universal Translation**: OpenAI format as interchange between all providers (Anthropic, OpenAI, Gemini, Bedrock)
- 🎯 **Smart Routing**: Find cheapest, fastest, or most capable model for each request
- 📊 **Adaptive Rate Limiting**: Learns actual limits from provider behavior, supports token bucket and fixed window strategies
- 🔌 **Injectable Architecture**: Swap auth, rate limiting, error handling, token counting - all interfaced
- 💰 **Cost Tracking**: Monitor spending across providers with customizable pricing trackers
- 🏗️ **Modular Design**: 92 focused modules, tree-shakeable exports, extensive interfaces for customization

## Installation

```bash
npm install llm-flight-controller
```

## Quick Start

```typescript
import { OpenAIProvider } from 'llm-flight-controller';

const model = new OpenAIProvider({
    identity: { id: 'gpt-4', displayName: 'GPT-4', provider: { id: 'openai', displayName: 'OpenAI' } },
    apiKey: process.env.OPENAI_API_KEY,
    modelId: 'gpt-4-turbo'
});

const response = await model.sendMessage({
    messages: [
        { role: 'user', content: [{ type: 'text', text: 'Hello!' }] }
    ]
});

console.log(response.content[0].text);
```

## Core Concepts

### Universal Message Format

All providers translate to/from OpenAI's message format:

```
Provider Format → OpenAI Format → Target Provider Format
```

This means you write code once and switch providers without changes.

### Adaptive Rate Limiting

Rate limiters learn actual limits from provider throttling:

```typescript
import { AdaptiveRateLimiter } from 'llm-flight-controller';

const limiter = new AdaptiveRateLimiter({
  type: 'tpm',
  enableLearning: true // Discovers limits automatically
});

// Inject custom strategies
import { TokenBucketStrategy, IRateLimitStrategy } from 'llm-flight-controller';

class MyStrategy implements IRateLimitStrategy {
  check(state, units) { /* custom logic */ }
  consume(state, units) { /* custom logic */ }
}

const customLimiter = new AdaptiveRateLimiter({
  type: 'rpm',
  customStrategy: new MyStrategy()
});
```

### Injectable Interfaces

Customize every component:

```typescript
// Custom error classification
import { IErrorClassifier, BaseErrorHandler } from 'llm-flight-controller';

class MyErrorClassifier implements IErrorClassifier {
  isRateLimitError(context) { return context.statusCode === 429; }
  isAuthError(context) { return context.statusCode === 401; }
  isSessionLimitError(context) { /* custom logic */ }
  getRetryAfter(context) { return 60000; }
}

const handler = new BaseErrorHandler('my-provider', new MyErrorClassifier());

// Custom token counting
import { ITokenCounter } from 'llm-flight-controller';

class MyTokenCounter implements ITokenCounter {
  estimateTokens(context) {
    // Use provider-specific tokenizer
    return { input: 100, output: 50 };
  }
}

// Custom reset calculators for session limits
import { IResetCalculator, SessionLimit } from 'llm-flight-controller';

class TimezoneResetCalculator implements IResetCalculator {
  calculateResetTime(hitTime) {
    // Reset at midnight in specific timezone
    return new Date(/* ... */);
  }
}

const sessionLimit = new SessionLimit({
  type: 'free',
  messagesPerDay: 50,
  resetCalculator: new TimezoneResetCalculator()
});
```

## Model Registry

```typescript
import { ModelRegistry, ModelCapability } from 'llm-flight-controller';

const registry = new ModelRegistry();

registry.register('gpt-4', gpt4Model);
registry.register('claude', claudeModel);
registry.register('gemini', geminiModel);

// Find by capability
const visionModels = registry.findByCapability(ModelCapability.IMAGE_INPUT);

// Find by provider
const anthropicModels = registry.findByProvider('anthropic');

// Find best match
const best = registry.findBest({
  capabilities: [ModelCapability.TEXT_GENERATION],
  maxLatency: 2000,
  minReliability: 95
});
```

## Supported Providers

- **Anthropic** - Claude models via Anthropic API
- **OpenAI** - GPT models via OpenAI API
- **Google Gemini** - Gemini models via Google AI API
- **AWS Bedrock** - Multiple model providers via AWS Bedrock
- **OpenAI-compatible** - DeepSeek, Groq, Together, Perplexity, Ollama, LM Studio, vLLM

## Architecture

**Designed for client-side desktop applications** (Claude Code, Cursor, VS Code):
- ✅ User's API keys stored locally
- ✅ Direct auth to providers (no backend needed)
- ✅ In-memory rate limiting
- ✅ Adaptive learning

**Not designed for:**
- ❌ Multi-tenant SaaS
- ❌ Shared infrastructure with Redis
- ❌ Gateway services

## Injectable Components

- **Auth**: `IAuthProvider` - API keys, AWS credentials, Azure identities, Google ADC, OAuth
- **Rate Limiting**: `IRateLimitStrategy` - Custom rate limiting logic
- **Error Classification**: `IErrorClassifier` - Custom error detection
- **Token Counting**: `ITokenCounter` - Provider-specific tokenizers
- **Reset Calculators**: `IResetCalculator` - Custom session reset times
- **Pricing**: `IPricingTracker` - Cost tracking and budget enforcement
- **Stats**: `IStatsTracker` - Custom metrics and monitoring

## Testing

```bash
npm test                  # Run all tests
npm run test:coverage     # Coverage report (87%+ coverage)
```

## Building

```bash
npm run build            # TypeScript compilation
```

## License

MIT
