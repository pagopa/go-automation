import type { EnvironmentDefinition } from './EnvironmentDefinition.js';

/**
 * A selected environment with its API key resolved.
 *
 * The API key is a secret: never log, journal or report it; show only
 * {@link ./apiKeyFingerprint.apiKeyFingerprint}.
 */
export interface Environment extends EnvironmentDefinition {
  readonly apiKey: string;
}
