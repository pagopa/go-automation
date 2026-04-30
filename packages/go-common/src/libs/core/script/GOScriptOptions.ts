/**
 * GOScript Options
 * Configuration options for creating a new script
 */

import type { GOConfigParameterOptions } from '../config/GOConfigParameter.js';
import type { GOConfigProvider } from '../config/GOConfigProvider.js';
import type { GOSecretsSpecifier } from '../config/GOSecretsSpecifier.js';
import type { GOConfigSchemaOptions } from '../config/GOConfigSchema.js';
import type { GOFileCopierSubdirDefaults } from '../files/GOFileCopierOptions.js';
import type { GOLoggerHandler } from '../logging/GOLoggerHandler.js';

/**
 * Script metadata
 */
export interface GOScriptMetadata {
  /** Script name */
  readonly name: string;

  /** Script version */
  readonly version: string;

  /** Script description */
  readonly description: string;

  /** Script authors */
  readonly authors: ReadonlyArray<string>;

  /** Script keywords for discovery/search */
  readonly keywords?: ReadonlyArray<string>;
}

/**
 * Script logging options
 */
export interface GOScriptLoggingOptions {
  /** Enable console logging (default: true) */
  console?: boolean;

  /** Enable file logging (default: true) */
  file?: boolean;

  /** Custom log file path (default: auto-generated) */
  logFilePath?: string;

  /** Custom logger handlers */
  handlers?: ReadonlyArray<GOLoggerHandler>;

  /** Enable automatic logging of config values at startup (default: true) */
  logConfigOnStart?: boolean;
}

/**
 * AWS credentials management options
 */
export interface GOScriptAWSCredentialsOptions {
  /**
   * Enable automatic SSO login when credentials expire
   * Default: true
   */
  autoLogin?: boolean | undefined;

  /**
   * Enable interactive mode (prompt user before login)
   * Default: true
   * Set to false for CI/batch mode (will skip login prompts)
   */
  interactive?: boolean | undefined;

  /**
   * Maximum retry attempts after SSO login
   * Default: 1
   */
  maxRetries?: number | undefined;

  /**
   * Timeout for SSO login process in milliseconds
   * Default: 120000 (2 minutes)
   */
  loginTimeout?: number | undefined;
}

/**
 * Script configuration options
 */
export interface GOScriptConfigOptions {
  /** Config schema options */
  schema?: GOConfigSchemaOptions;

  /** Config reader providers */
  configProviders?: ReadonlyArray<GOConfigProvider>;

  /** Configuration parameters to register */
  parameters?: ReadonlyArray<GOConfigParameterOptions>;

  /** Enable automatic help generation with --help flag (default: true) */
  autoHelp?: boolean;

  /** Exit after showing help (default: true) */
  exitAfterHelp?: boolean;

  /**
   * When true, unknown CLI parameters cause the script to exit with an error
   * and suggest the closest matching valid parameter.
   * When false, unknown parameters are silently ignored (legacy behavior).
   * Default: true
   */
  rejectUnknownParameters?: boolean;

  /** AWS credentials management options - Controls automatic SSO login when credentials expire*/
  awsCredentials?: GOScriptAWSCredentialsOptions;

  /**
   * Script-level secrets specifier for advanced redaction strategies.
   * Merged with per-parameter `sensitive` flags using union (OR) semantics:
   * a parameter is treated as secret if EITHER the parameter has `sensitive: true`
   * OR this specifier identifies it as secret.
   *
   * If omitted and no parameters have `sensitive: true`, defaults to `{ type: 'none' }`.
   *
   * @example
   * ```typescript
   * // Redact all values
   * secrets: GOSecretsSpecifierFactory.all()
   *
   * // Dynamic predicate
   * secrets: GOSecretsSpecifierFactory.dynamic((key) => key.includes('internal'))
   * ```
   */
  secrets?: GOSecretsSpecifier;
}

export type GOScriptLifecycleHookResult = void | Promise<void>;

export type GOScriptLifecycleHook = () => GOScriptLifecycleHookResult;

export type GOScriptConfigLoadHook = (config: Record<string, unknown>) => GOScriptLifecycleHookResult;

export type GOScriptErrorHook = (error: Error) => GOScriptLifecycleHookResult;

/**
 * Script lifecycle hooks
 */
export interface GOScriptLifecycleHooks {
  /** Called before script initialization */
  onBeforeInit?: GOScriptLifecycleHook;

  /** Called after script initialization */
  onAfterInit?: GOScriptLifecycleHook;

  /** Called before config is loaded */
  onBeforeConfigLoad?: GOScriptLifecycleHook;

  /** Called after config is loaded */
  onAfterConfigLoad?: GOScriptConfigLoadHook;

  /** Called before main script execution */
  onBeforeRun?: GOScriptLifecycleHook;

  /** Called after main script execution */
  onAfterRun?: GOScriptLifecycleHook;

  /** Called on script error */
  onError?: GOScriptErrorHook;

  /** Called on script cleanup/exit */
  onCleanup?: GOScriptLifecycleHook;
}

/**
 * File copier configuration options for GOScript
 */
export interface GOScriptFileCopierOptions {
  /**
   * Enable file copier functionality.
   * Default: true
   */
  enabled?: boolean | undefined;

  /**
   * Enable interactive mode for large files.
   * When true, prompts user before copying files exceeding promptThreshold.
   * Default: true
   */
  interactive?: boolean | undefined;

  /**
   * File size threshold (in bytes) above which user is prompted in interactive mode.
   * Default: 10 MB (10 * 1024 * 1024)
   */
  promptThreshold?: number | undefined;

  /**
   * Maximum file size (in bytes) allowed for copying.
   * Files exceeding this size are always skipped.
   * Default: 100 MB (100 * 1024 * 1024)
   */
  maxFileSize?: number | undefined;

  /**
   * Whether to generate a manifest file listing all copied files.
   * Default: true
   */
  generateManifest?: boolean | undefined;

  /**
   * Custom subdirectory defaults per path type.
   * If not provided, uses built-in defaults:
   * - INPUT -> 'inputs'
   * - CONFIG -> 'configs'
   * - OUTPUT -> null (root)
   */
  subdirDefaults?: Partial<GOFileCopierSubdirDefaults> | undefined;

  /**
   * Whether to overwrite existing files at destination.
   * Default: false (skip if exists)
   */
  overwrite?: boolean | undefined;
}

/**
 * Complete GOScript options
 */
export interface GOScriptOptions {
  /** Script metadata */
  metadata: GOScriptMetadata;

  /** Logging configuration */
  logging?: GOScriptLoggingOptions | undefined;

  /** Configuration options */
  config?: GOScriptConfigOptions | undefined;

  /** File copier configuration */
  fileCopier?: GOScriptFileCopierOptions | undefined;

  /** Lifecycle hooks */
  hooks?: GOScriptLifecycleHooks | undefined;
}
