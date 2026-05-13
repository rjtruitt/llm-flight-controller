/**
 * Model Factory - Create models from configuration
 *
 * @aiInstructions
 * ModelFactory creates Model instances from config, instantiating the correct
 * auth provider and setting up limits/pricing/stats.
 *
 * @aiExample
 * ```typescript
 * const factory = new ModelFactory();
 * const config = await ModelConfig.fromFile('models.json');
 * const claudeConfig = config.getModel('claude-sonnet-4');
 *
 * const model = factory.createModel(claudeConfig);
 * model.setBlockerHandler(myHandler);
 * const response = await model.sendMessage(context);
 * ```
 */

import { Model } from '../model/Model';
import { SingleModelConfig } from '../config/ModelConfigTypes';
import { createAuthProvider } from './AuthProviderFactory';
import { createIdentity } from './ComponentFactory';

// Re-export for convenience
export { createAuthProvider } from './AuthProviderFactory';
export * from './ComponentFactory';

/**
 * Model Factory - Creates models from configuration
 */
export class ModelFactory {
    /**
     * Create model from configuration
     */
    createModel(config: SingleModelConfig): Model {
        // Create all components
        const identity = createIdentity(config);
        const auth = createAuthProvider(config.auth);

        // Note: In full implementation, this would use provider-specific Model subclasses
        // For now, we throw as providers aren't implemented yet
        throw new Error(
            `Provider ${config.provider} not yet implemented. ` +
            `Implement provider-specific Model subclass (e.g., AnthropicModel, BedrockModel). ` +
            `Config ready: identity=${identity.id}, auth=${auth.constructor.name}`
        );
    }
}
