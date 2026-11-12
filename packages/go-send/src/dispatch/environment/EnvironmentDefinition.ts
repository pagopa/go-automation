import type { DispatchSender } from '../model/DispatchSender.js';
import type { FieldValues } from '../mapping/FieldValues.js';
import type { SharedDocumentConfig } from './SharedDocumentConfig.js';

/**
 * An environment as declared in the environments file (§7.4.1), validated
 * but with the API key still unresolved.
 */
export interface EnvironmentDefinition {
  readonly name: string;
  readonly description?: string;
  /** Base URL of the B2B API, always with scheme (https:// added if missing). */
  readonly basePath: string;
  /** Name of the environment variable holding the API key. */
  readonly apiKeyVariable: string;
  readonly groupId?: string;
  readonly awsProfile?: string;
  readonly production: boolean;
  readonly sender?: DispatchSender;
  /** Defaults for canonical fields (lowest precedence after neutral defaults). */
  readonly defaults: FieldValues;
  readonly sharedDocument?: SharedDocumentConfig;
}
