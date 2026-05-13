/**
 * Example: Session Limit Auto-Switch
 *
 * Shows how an orchestrator handles a session limit on Gemini
 * and automatically switches to Anthropic with different tooling style.
 */

import { ModelRegistry } from '../src/core/registry/ModelRegistry';
import { BlockerEvent, BlockerType, BlockerAction, IBlockerHandler } from '../src/core/events/BlockerEvent';
import { RosettaContext, RosettaMessage } from '../src/core/types';
import { Model } from '../src/core/model/Model';

// Orchestrator with auto-switching
class SmartOrchestrator implements IBlockerHandler {
    private registry: ModelRegistry;
    private currentModel: Model;
    private context: RosettaContext;

    constructor(registry: ModelRegistry, initialModel: Model) {
        this.registry = registry;
        this.currentModel = initialModel;
        this.context = { messages: [] };

        // Set ourselves as the blocker handler
        this.currentModel.setBlockerHandler(this);
    }

    async handleBlocker(event: BlockerEvent): Promise<BlockerAction> {
        console.log(`⚠️  Blocker: ${event.type} - ${event.message}`);

        // Handle session limit - switch providers!
        if (event.type === BlockerType.SESSION_LIMIT_EXCEEDED) {
            console.log('🔄 Session limit hit on Gemini, switching to Anthropic...');

            // Find alternative model
            const alternatives = this.registry.getAll().filter(m =>
                m !== this.currentModel &&
                m.getIdentity().provider.id !== this.currentModel.getIdentity().provider.id
            );

            if (alternatives.length === 0) {
                console.log('❌ No alternative models available');
                return BlockerAction.CANCEL;
            }

            const newModel = alternatives[0]; // Or use findBest()

            console.log(`   Switching: ${this.currentModel.getIdentity().displayName} → ${newModel.getIdentity().displayName}`);
            console.log(`   Provider: ${this.currentModel.getIdentity().provider.displayName} → ${newModel.getIdentity().provider.displayName}`);

            // THIS IS THE MAGIC: Context automatically translates via Rosetta!
            // Gemini format → RosettaContext → Anthropic format
            // Tools, messages, everything gets translated

            this.currentModel = newModel;
            this.currentModel.setBlockerHandler(this);

            // Tell orchestrator to retry with new model
            return BlockerAction.RETRY;
        }

        // Handle rate limits - wait
        if (event.type === BlockerType.RATE_LIMIT_EXCEEDED) {
            console.log(`⏳ Rate limited, waiting ${event.data?.waitMs}ms...`);
            return BlockerAction.WAIT;
        }

        // Handle auth failures
        if (event.type === BlockerType.AUTH_REQUIRED) {
            console.log('🔐 Authentication needed');
            return BlockerAction.AUTHENTICATE;
        }

        // Default: cancel
        return BlockerAction.CANCEL;
    }

    async chat(userMessage: string): Promise<string> {
        // Add user message to context
        this.context.messages.push({
            role: 'user',
            content: [{ type: 'text', text: userMessage }]
        });

        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            try {
                console.log(`\n💬 Sending to ${this.currentModel.getIdentity().displayName}...`);

                // THIS IS WHERE THE TRANSLATION HAPPENS:
                // RosettaContext gets translated to provider-specific format internally
                const response = await this.currentModel.sendMessage(this.context);

                // Add response to context (in Rosetta format)
                this.context.messages.push({
                    role: 'assistant',
                    content: response.content,
                    metadata: {
                        modelId: this.currentModel.getIdentity().id
                    }
                });

                // Extract text from response
                const text = response.content
                    .filter(c => c.type === 'text')
                    .map(c => (c as any).text)
                    .join('');

                console.log(`✅ Response received (${response.usage.totalTokens} tokens)`);

                return text;

            } catch (error) {
                console.log(`❌ Error: ${error}`);
                attempts++;

                if (attempts >= maxAttempts) {
                    throw error;
                }

                // Blocker handler already called, retry with potentially switched model
                console.log(`🔁 Retrying (attempt ${attempts + 1}/${maxAttempts})...`);
            }
        }

        throw new Error('Max attempts reached');
    }
}

// Example usage
async function main() {
    const registry = new ModelRegistry();

    // Register Gemini (free tier - has session limits)
    // registry.register('gemini-pro', geminiModel);

    // Register Anthropic (API key - no session limits)
    // registry.register('claude-sonnet', anthropicModel);

    // Start with Gemini
    // const orchestrator = new SmartOrchestrator(registry, geminiModel);

    // First few requests work fine on Gemini
    console.log('User: What is TypeScript?');
    // await orchestrator.chat('What is TypeScript?');

    console.log('\nUser: How do I use interfaces?');
    // await orchestrator.chat('How do I use interfaces?');

    // ... After 50 messages on Gemini free tier ...
    console.log('\nUser: Explain generics');
    // await orchestrator.chat('Explain generics');

    // 🔄 SESSION_LIMIT_EXCEEDED blocker fires!
    // Orchestrator automatically:
    // 1. Detects Gemini session limit
    // 2. Finds Anthropic as alternative
    // 3. Translates entire context: Gemini format → Rosetta → Anthropic format
    //    - Messages translated
    //    - Tools re-formatted (Gemini style → Anthropic style)
    //    - Everything preserved
    // 4. Retries with Claude
    // 5. User never knows the switch happened!

    console.log('\n✨ The switch is transparent:');
    console.log('   - Context preserved (50+ messages)');
    console.log('   - Tools automatically re-formatted');
    console.log('   - Gemini tool format → Anthropic tool format');
    console.log('   - User experience: seamless');
}

// What gets translated behind the scenes:
console.log('\n📋 Translation example:');
console.log('\nGemini format:');
console.log(`{
  contents: [
    { role: 'user', parts: [{ text: '...' }] }
  ],
  tools: [
    { functionDeclarations: [{ name: 'get_weather', ... }] }
  ]
}`);

console.log('\n↓ Via Rosetta Stone ↓');

console.log('\nRosetta format (universal):');
console.log(`{
  messages: [
    { role: 'user', content: [{ type: 'text', text: '...' }] }
  ],
  tools: [
    { name: 'get_weather', description: '...', inputSchema: {...} }
  ]
}`);

console.log('\n↓ Via Rosetta Stone ↓');

console.log('\nAnthropic format:');
console.log(`{
  messages: [
    { role: 'user', content: [{ type: 'text', text: '...' }] }
  ],
  tools: [
    { name: 'get_weather', description: '...', input_schema: {...} }
  ]
}`);

main().catch(console.error);
