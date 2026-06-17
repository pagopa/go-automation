/**
 * Context passed to GOScript lifecycle hooks.
 *
 * Gives hooks access to the script's core services without coupling them to the
 * GOScript instance. In particular `config` is the live resolved-configuration
 * store: a hook (typically `onAfterConfigLoad`) can read resolved values —
 * including reserved ones such as `script.preset.name` — and derive/override
 * values via `config.set(...)`, with the change flowing to `getConfiguration()`
 * and the config summary. Used this way, `onAfterConfigLoad` acts as a
 * "prepare/remap" phase (runs in both CLI and Lambda, before required-parameter
 * validation).
 */

import type { GOConfig } from '../config/GOConfig.js';
import type { GOEnv } from '../environment/GOEnv.js';
import type { GOExecutionEnvironmentInfo } from '../environment/GOExecutionEnvironmentInfo.js';
import type { GOLogger } from '../logging/GOLogger.js';
import type { GOPaths } from '../utils/index.js';

export interface GOScriptHookContext {
  /** Live resolved-configuration store (read + override with source tracking). */
  readonly config: GOConfig;

  /** Environment-variable accessor (use instead of process.env in scripts/hooks). */
  readonly env: GOEnv;

  /** Path resolver for input/output/config locations. */
  readonly paths: GOPaths;

  /** Detected execution environment (isAWSManaged, isInteractive, ...). */
  readonly environment: GOExecutionEnvironmentInfo;

  /** Script logger. */
  readonly logger: GOLogger;
}
