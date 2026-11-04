import type { ValidatedConfigBase } from './ValidatedConfigBase.js';

/**
 * Validated configuration of the `e2e` mode (B2B API of SEND).
 */
export interface E2eDispatchConfig extends ValidatedConfigBase {
  readonly mode: 'e2e';
}
