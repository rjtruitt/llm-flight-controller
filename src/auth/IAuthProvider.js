"use strict";
/**
 * Auth Provider Interface - Authentication abstraction
 *
 * @aiInstructions
 * IAuthProvider is the interface all authentication methods implement.
 * Providers use this to get auth headers without knowing auth details.
 *
 * @aiExample
 * ```typescript
 * // Implement custom auth
 * class MyCustomAuth implements IAuthProvider {
 *   async getHeaders() {
 *     return { 'Authorization': 'Bearer my-token' };
 *   }
 *
 *   isAuthenticated() {
 *     return true;
 *   }
 * }
 *
 * // Use with provider
 * const provider = new BedrockProvider(new MyCustomAuth(), 'us-east-1');
 * ```
 *
 * @aiWhenToUse
 * Implement IAuthProvider when:
 * - Creating custom authentication methods
 * - Integrating with proprietary auth systems
 * - Need special credential handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticationError = void 0;
/**
 * Re-export AuthenticationError from core types
 */
var Errors_1 = require("../core/types/Errors");
Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function () { return Errors_1.AuthenticationError; } });
//# sourceMappingURL=IAuthProvider.js.map