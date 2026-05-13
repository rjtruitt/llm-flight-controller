/**
 * Context Manager Example - Prevent runaway token costs
 *
 * Shows how to manage conversation context to avoid hitting token limits
 * and controlling costs when using the library.
 *
 * WITHOUT context management:
 * - Conversation grows unbounded
 * - Each request costs more as history grows
 * - Eventually hits context window limit
 * - Can cost $10+ per request on long conversations
 *
 * WITH context management:
 * - Keep context under budget
 * - Predictable per-request costs
 * - Never hit context window limits
 */

import { OpenAIProvider } from '../src/providers/openai/OpenAIProvider';
import { ModelRegistry } from '../src/core/registry/ModelRegistry';

/**
 * Simple token counter (use tiktoken for accurate counting)
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  // Use tiktoken or anthropic tokenizer for accuracy
  return Math.ceil(text.length / 4);
}

/**
 * Context window manager
 */
class ContextWindowManager {
  private messages: any[] = [];
  private maxContextTokens: number;
  private systemPromptTokens: number;

  constructor(
    maxContextTokens: number = 100000, // 100k context limit
    systemPrompt?: string
  ) {
    this.maxContextTokens = maxContextTokens;
    this.systemPromptTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;

    if (systemPrompt) {
      this.messages.push({
        role: 'system',
        content: [{ type: 'text', text: systemPrompt }]
      });
    }
  }

  /**
   * Add message to context, managing token budget
   */
  addMessage(role: 'user' | 'assistant', content: string): void {
    const message = {
      role,
      content: [{ type: 'text', text: content }]
    };

    this.messages.push(message);

    // Trim oldest messages if over budget
    this.trimToLimit();
  }

  /**
   * Get messages for next request
   */
  getMessages(): any[] {
    return [...this.messages];
  }

  /**
   * Trim oldest messages to stay under token budget
   */
  private trimToLimit(): void {
    let totalTokens = this.systemPromptTokens;

    // Count tokens from newest to oldest
    const messageCounts = this.messages.slice(1).map(msg => {
      const text = msg.content.map((c: any) => c.text).join('');
      return estimateTokens(text);
    });

    totalTokens += messageCounts.reduce((a, b) => a + b, 0);

    // Remove oldest messages until under limit
    while (totalTokens > this.maxContextTokens && this.messages.length > 2) {
      // Keep system prompt (index 0) and at least one message
      const removed = this.messages.splice(1, 1)[0];
      const removedText = removed.content.map((c: any) => c.text).join('');
      totalTokens -= estimateTokens(removedText);

      console.log(`[Context] Trimmed message (${estimateTokens(removedText)} tokens), total now: ${totalTokens}`);
    }
  }

  /**
   * Get current token count
   */
  getTokenCount(): number {
    let total = this.systemPromptTokens;
    for (const msg of this.messages.slice(1)) {
      const text = msg.content.map((c: any) => c.text).join('');
      total += estimateTokens(text);
    }
    return total;
  }

  /**
   * Summarize and compress context
   */
  async summarize(model: any): Promise<void> {
    if (this.messages.length <= 5) return; // Not worth summarizing

    // Get middle messages (keep recent messages unmodified)
    const recentCount = 4;
    const toSummarize = this.messages.slice(1, -recentCount);

    if (toSummarize.length === 0) return;

    const summaryPrompt = `Summarize this conversation history in 2-3 sentences, preserving key facts and context:\n\n${
      toSummarize.map(m => `${m.role}: ${m.content.map((c: any) => c.text).join('')}`).join('\n')
    }`;

    const response = await model.sendMessage({
      messages: [{ role: 'user', content: [{ type: 'text', text: summaryPrompt }] }]
    });

    const summary = response.content.find((c: any) => c.type === 'text')?.text || '';

    // Replace middle messages with summary
    this.messages = [
      this.messages[0], // system prompt
      {
        role: 'assistant',
        content: [{ type: 'text', text: `[Previous conversation summary: ${summary}]` }]
      },
      ...this.messages.slice(-recentCount) // keep recent messages
    ];

    console.log(`[Context] Summarized ${toSummarize.length} messages into ${estimateTokens(summary)} tokens`);
  }
}

/**
 * Cost tracker
 */
class CostTracker {
  private totalCost = 0;
  private requestCount = 0;

  // Pricing per 1M tokens (example rates)
  private pricing = {
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'claude-3-opus': { input: 15.0, output: 75.0 },
    'claude-3-sonnet': { input: 3.0, output: 15.0 },
    'claude-3-haiku': { input: 0.25, output: 1.25 }
  };

  track(modelId: string, inputTokens: number, outputTokens: number): void {
    const prices = this.pricing[modelId as keyof typeof this.pricing] || { input: 5, output: 15 };

    const cost = (inputTokens / 1000000) * prices.input + (outputTokens / 1000000) * prices.output;

    this.totalCost += cost;
    this.requestCount++;

    console.log(
      `[Cost] Request #${this.requestCount}: $${cost.toFixed(6)} ` +
      `(${inputTokens} in + ${outputTokens} out tokens) ` +
      `| Total: $${this.totalCost.toFixed(4)}`
    );
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  checkBudget(maxBudget: number): boolean {
    if (this.totalCost >= maxBudget) {
      console.warn(`[Cost] Budget exceeded! $${this.totalCost.toFixed(4)} / $${maxBudget}`);
      return false;
    }
    return true;
  }
}

/**
 * Example: Multi-turn conversation with context management
 */
async function example() {
  const registry = new ModelRegistry();

  // Add models (configure with your API keys)
  const gpt4mini = new OpenAIProvider({
    identity: { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini' } as any,
    apiKey: process.env.OPENAI_API_KEY!,
    modelId: 'gpt-4o-mini',
    capabilities: {} as any
  });

  registry.register('gpt-4o-mini', gpt4mini);

  // Create context manager
  const context = new ContextWindowManager(
    50000, // 50k token limit (stay well under model's 128k)
    'You are a helpful coding assistant. Keep answers concise.'
  );

  // Create cost tracker
  const cost = new CostTracker();
  const maxBudget = 1.0; // $1 budget

  // Simulate multi-turn conversation
  const turns = [
    'Explain how async/await works in JavaScript',
    'Show me an example with error handling',
    'How do I handle multiple promises in parallel?',
    'What about sequential promises?',
    'Compare Promise.all vs Promise.allSettled',
    // ... conversation continues ...
  ];

  for (let i = 0; i < turns.length; i++) {
    console.log(`\n=== Turn ${i + 1} ===`);

    // Check budget before request
    if (!cost.checkBudget(maxBudget)) {
      console.log('[Budget] Stopping conversation - budget exceeded');
      break;
    }

    // Add user message
    context.addMessage('user', turns[i]);

    console.log(`[Context] ${context.getTokenCount()} tokens in context`);

    // Send request
    const response = await gpt4mini.sendMessage({
      messages: context.getMessages()
    });

    // Extract response
    const responseText = response.content.find(c => c.type === 'text')?.text || '';

    // Add to context
    context.addMessage('assistant', responseText);

    // Track cost
    cost.track('gpt-4o-mini', response.usage.inputTokens, response.usage.outputTokens);

    // Summarize if context getting large
    if (context.getTokenCount() > 40000) {
      console.log('[Context] Context approaching limit, summarizing...');
      await context.summarize(gpt4mini);
    }
  }

  console.log(`\n=== Final Stats ===`);
  console.log(`Total cost: $${cost.getTotalCost().toFixed(4)}`);
  console.log(`Final context: ${context.getTokenCount()} tokens`);
}

/**
 * Example: Automatic model switching based on cost
 */
async function exampleCostOptimized() {
  const registry = new ModelRegistry();

  // Cheap model for simple questions
  const haiku = new OpenAIProvider({
    identity: { id: 'claude-3-haiku', displayName: 'Claude 3 Haiku' } as any,
    apiKey: process.env.ANTHROPIC_API_KEY!,
    modelId: 'claude-3-haiku-20240307',
    capabilities: {} as any
  });

  // Expensive model for complex questions
  const opus = new OpenAIProvider({
    identity: { id: 'claude-3-opus', displayName: 'Claude 3 Opus' } as any,
    apiKey: process.env.ANTHROPIC_API_KEY!,
    modelId: 'claude-3-opus-20240229',
    capabilities: {} as any
  });

  registry.register('haiku', haiku);
  registry.register('opus', opus);

  const context = new ContextWindowManager(100000);
  const cost = new CostTracker();

  /**
   * Route based on question complexity
   */
  function selectModel(question: string): any {
    const isComplex =
      question.length > 500 ||
      question.includes('explain in detail') ||
      question.includes('comprehensive') ||
      question.includes('architecture');

    return isComplex ? opus : haiku;
  }

  const question = 'What is 2+2?';
  const model = selectModel(question);

  context.addMessage('user', question);

  const response = await model.sendMessage({
    messages: context.getMessages()
  });

  cost.track(model.getModelId(), response.usage.inputTokens, response.usage.outputTokens);

  console.log(`Used ${model.getModelId()} - Total cost: $${cost.getTotalCost().toFixed(6)}`);
}

// Run examples
if (require.main === module) {
  example().catch(console.error);
  // exampleCostOptimized().catch(console.error);
}

export { ContextWindowManager, CostTracker, estimateTokens };
