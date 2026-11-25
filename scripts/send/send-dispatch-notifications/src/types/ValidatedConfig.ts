import type { DirectDispatchConfig } from './DirectDispatchConfig.js';
import type { E2eDispatchConfig } from './E2eDispatchConfig.js';

/**
 * Configuration checked by `validateConfig`: discriminated by `mode`.
 */
export type ValidatedConfig = E2eDispatchConfig | DirectDispatchConfig;
