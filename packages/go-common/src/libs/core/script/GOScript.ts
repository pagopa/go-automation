/**
 * GOScript - Base class for creating scripts
 * Integrates logging, configuration, and prompts into a unified script framework
 */

import { AWSProvider, GOAWSCredentialsManager } from '../../aws/index.js';
import type { GOAWSCredentialsLogHandler, GOAWSCredentialsPromptHandler } from '../../aws/index.js';
import type { GOConfigProvider } from '../config/GOConfigProvider.js';
import { GOSecretRedactor, GOSecretsSpecifierFactory } from '../config/GOSecretsSpecifier.js';
import { GOConfigReader } from '../config/GOConfigReader.js';
import { GOConfigSchema } from '../config/GOConfigSchema.js';
import { GOConfig } from '../config/GOConfig.js';
import { GOCommandLineConfigProvider } from '../config/providers/GOCommandLineConfigProvider.js';
import { GOEnvironmentConfigProvider } from '../config/providers/GOEnvironmentConfigProvider.js';
import { GOJSONConfigProvider } from '../config/providers/GOJSONConfigProvider.js';
import { GOLambdaEventConfigProvider } from '../config/providers/GOLambdaEventConfigProvider.js';
import { GOPresetConfigProvider } from '../config/providers/GOPresetConfigProvider.js';
import { GOYAMLConfigProvider } from '../config/providers/GOYAMLConfigProvider.js';
import { GOUnknownParameterDetector } from '../config/validation/GOUnknownParameterDetector.js';
import { GOCredentialSource } from '../environment/GOCredentialSource.js';
import { GOEnv } from '../environment/GOEnv.js';
import { GOExecutionEnvironment } from '../environment/GOExecutionEnvironment.js';
import type { GOExecutionEnvironmentInfo } from '../environment/GOExecutionEnvironmentInfo.js';
import { GOFileCopier } from '../files/GOFileCopier.js';
import { getDefaultSubdirForPathType } from '../files/GOFileCopierOptions.js';
import type { GOFileCopyFileOptions } from '../files/GOFileCopierOptions.js';
import type { GOFileCopyReport } from '../files/GOFileCopyReport.js';
import { consoleColorsEnabled } from '../logging/ansi.js';
import { GOLogger } from '../logging/GOLogger.js';
import { GOLogEvent } from '../logging/GOLogEvent.js';
import { GOLogEventCategory } from '../logging/GOLogEventCategory.js';
import { redactSensitiveLogValue } from '../logging/GOSensitiveLogRedactor.js';
import { GOConsoleLoggerHandler } from '../logging/handlers/GOConsoleLoggerHandler.js';
import { GOFileLoggerHandler } from '../logging/handlers/GOFileLoggerHandler.js';
import { GOJsonLoggerHandler } from '../logging/handlers/GOJsonLoggerHandler.js';
import { GOPrompt } from '../prompt/GOPrompt.js';
import { getErrorMessage, getErrorStack, toError } from '../errors/GOErrorUtils.js';
import { GOPaths, formatConfigValueDisplay, formatConfigSourceDisplay, valueToString } from '../utils/index.js';
import type { GOPathTypeValue } from '../utils/index.js';

import { GOScriptConfigLoader } from './GOScriptConfigLoader.js';
import { defaultAwsCredentialsOptions, configTableWidths } from './GOScriptDefaults.js';
import { GOScriptPresetLoader } from './GOScriptPresetLoader.js';
import {
  GOSCRIPT_PRESET_FILE_PARAMETER,
  GOSCRIPT_PRESET_NAME_PARAMETER,
  GOSCRIPT_SYSTEM_PARAMETERS,
} from './GOScriptSystemParameters.js';
import { installProcessGuards, setProcessGuardRequestId } from './GOProcessGuards.js';
import type { GOScriptHookContext } from './GOScriptHookContext.js';
import type {
  GOScriptOptions,
  GOScriptMetadata,
  GOScriptLoggingOptions,
  GOScriptConfigOptions,
  GOScriptLifecycleHooks,
  GOScriptFileCopierOptions,
} from './GOScriptOptions.js';

type GOScriptSignalHandler = () => void;
type GOScriptMainHandler<TResult> = () => Promise<TResult>;
type GOScriptRunHandler = () => void | Promise<void>;
type GOScriptLambdaMainHandler<TEvent, TResult, TContext> = (
  event: TEvent,
  context: TContext | undefined,
) => Promise<TResult>;
type GOScriptLambdaHandler<TEvent, TResult, TContext> = (event: TEvent, context?: TContext) => Promise<TResult>;

interface GOScriptSignalHandlerRef {
  readonly signal: NodeJS.Signals;
  readonly handler: GOScriptSignalHandler;
}

interface GOScriptConfigLogEntry extends Record<string, unknown> {
  readonly parameter: string;
  readonly value: string;
  readonly source: string;
}

interface GOScriptConfigSummaryEntry {
  readonly value: string;
  readonly source: string;
}

/**
 * Base script class with integrated logging, config, and prompts
 */
export class GOScript {
  // Metadata
  public readonly metadata: GOScriptMetadata;

  // Core components
  public readonly paths: GOPaths;
  public readonly logger: GOLogger;
  public readonly prompt: GOPrompt;
  public readonly configReader: GOConfigReader;
  public readonly configSchema: GOConfigSchema;
  public readonly environment: GOExecutionEnvironmentInfo;

  // Options
  private readonly options: GOScriptOptions;
  private readonly hooks: GOScriptLifecycleHooks;

  // Managers
  private readonly configLoader: GOScriptConfigLoader;
  private cliProvider?: GOCommandLineConfigProvider | undefined;
  private lambdaEventProvider?: GOLambdaEventConfigProvider | undefined;
  private readonly credentialsManager?: GOAWSCredentialsManager | undefined;
  private fileCopier?: GOFileCopier | undefined;
  private readonly fileCopierOptions?: GOScriptFileCopierOptions | undefined;
  private readonly secretRedactor: GOSecretRedactor;
  private awsProvider?: AWSProvider | undefined;

  // Cached AWS parameter presence flags (computed once in constructor — avoids repeated array scans)
  private readonly hasAwsProfileParam: boolean;
  private readonly hasAwsProfilesParam: boolean;

  // State
  private initialized: boolean = false;
  private configLoaded: boolean = false;
  private config: GOConfig = new GOConfig();
  private readonly env: GOEnv = new GOEnv();
  private signalHandlersSetup: boolean = false;
  private isShuttingDown: boolean = false;

  // Signal handler references kept for removal in cleanup() (prevents memory leaks)
  private readonly signalHandlerRefs: GOScriptSignalHandlerRef[] = [];

  // Tracks errors already logged by a specific throw site (e.g. loadConfig validation).
  // executeLifecycle() skips handleError() for these and only calls hooks.onError,
  // preventing the same message from being printed twice.
  private readonly preloggedErrors = new WeakSet<Error>();

  // Last AWS profile/region key used by cached clients — used to detect changes in Lambda between invocations
  private lastAwsProfilesKey: string | undefined;

  constructor(options: GOScriptOptions) {
    this.options = options;
    this.metadata = options.metadata;
    this.hooks = options.hooks ?? {};

    // Detect execution environment
    this.environment = GOExecutionEnvironment.detect();

    // Cache AWS parameter presence flags (single scan — reused by handleAWSCredentials and client getters)
    this.hasAwsProfileParam = options.config?.parameters?.some((p) => p.name === 'aws.profile') ?? false;
    this.hasAwsProfilesParam = options.config?.parameters?.some((p) => p.name === 'aws.profiles') ?? false;

    // Initialize
    const scriptName = this.metadata.name.replace(/\s+/g, '-').toLowerCase();
    this.paths = new GOPaths(scriptName);
    this.logger = this.initializeLogger(options.logging);
    this.prompt = new GOPrompt(this.logger);

    // Initialize config schema and reader
    this.configSchema = this.initializeConfigSchema(options.config);
    const configProviders = this.initializeConfigProviders(options.config);
    this.configReader = new GOConfigReader(configProviders);

    // Initialize config loader (with fallback context so asyncFallback functions can access GOPaths)
    this.configLoader = this.createConfigLoader(this.configReader);

    // Initialize credentials manager if needed
    this.credentialsManager = this.initializeCredentialManager(options.config);

    // Store file copier options for lazy initialization
    this.fileCopierOptions = options.fileCopier;

    // Initialize secret redactor from parameter flags + script-level specifier
    this.secretRedactor = this.initializeSecretRedactor(options.config);
  }

  /**
   * Initialize AWS credentials manager if aws.profile or aws.profiles parameter is defined.
   */
  private initializeCredentialManager(configOptions?: GOScriptConfigOptions): GOAWSCredentialsManager | undefined {
    const awsCredentialsConfig = configOptions?.awsCredentials;

    if (awsCredentialsConfig || this.hasAwsProfileParam || this.hasAwsProfilesParam) {
      return new GOAWSCredentialsManager({
        autoLogin: awsCredentialsConfig?.autoLogin ?? defaultAwsCredentialsOptions.autoLogin,
        interactive: awsCredentialsConfig?.interactive ?? defaultAwsCredentialsOptions.interactive,
        maxRetries: awsCredentialsConfig?.maxRetries ?? defaultAwsCredentialsOptions.maxRetries,
        loginTimeout: awsCredentialsConfig?.loginTimeout ?? defaultAwsCredentialsOptions.loginTimeout,
        onLog: this.createLogCallback(),
        onPrompt: this.createPromptCallback(false),
      });
    }
    return undefined;
  }

  /**
   * Initialize file copier lazily (after execution directory is created)
   */
  private initializeFileCopier(): GOFileCopier {
    if (this.fileCopier) {
      return this.fileCopier;
    }

    const options = this.fileCopierOptions ?? {};

    this.fileCopier = new GOFileCopier({
      executionDir: this.paths.getExecutionOutputDir(),
      interactive: options.interactive ?? true,
      promptThreshold: options.promptThreshold,
      maxFileSize: options.maxFileSize,
      generateManifest: options.generateManifest ?? true,
      subdirDefaults: options.subdirDefaults,
      overwrite: options.overwrite ?? false,
      onLog: this.createLogCallback(),
      onPrompt: this.createPromptCallback(true),
    });

    return this.fileCopier;
  }

  /**
   * Initialize logger with handlers.
   *
   * File logging behaviour differs by environment:
   * - Local: enabled by default (creates execution output directory)
   * - AWS-managed (Lambda/ECS/CodeBuild): disabled by default because the runtime
   *   already captures stdout/stderr (CloudWatch Logs, etc.). Set `logging.file: true`
   *   to opt in; the log file will be written to /tmp/ (the only writable path in Lambda).
   */
  private initializeLogger(loggingOptions?: GOScriptLoggingOptions): GOLogger {
    const handlers = [];

    // Console handler (default: enabled in all environments).
    // Format: 'pretty' (colored, human-readable) by default locally; 'json' (one
    // structured event per entry) by default in AWS-managed runtimes, so CloudWatch
    // logs stay clean and queryable. Override explicitly with logging.format.
    if (loggingOptions?.console !== false) {
      // Explicit logging.format wins; otherwise default to JSON in AWS-managed
      // runtimes (clean, queryable CloudWatch) and pretty/colored output locally.
      const format = loggingOptions?.format ?? (this.environment.isAWSManaged ? 'json' : 'pretty');
      handlers.push(format === 'json' ? new GOJsonLoggerHandler() : new GOConsoleLoggerHandler());
    }

    // File handler:
    // - Local:        enabled by default (loggingOptions?.file !== false)
    // - AWS-managed:  disabled by default; opt-in with logging.file = true
    const isFileEnabled = this.environment.isAWSManaged
      ? loggingOptions?.file === true
      : loggingOptions?.file !== false;

    if (isFileEnabled) {
      if (this.environment.isAWSManaged) {
        // Only /tmp/ is writable in Lambda/ECS — do NOT call createExecutionOutputDir()
        const logPath = loggingOptions?.logFilePath ?? `/tmp/${this.paths.getScriptName()}.log`;
        handlers.push(new GOFileLoggerHandler(this.paths, undefined, logPath));
      } else {
        // Local: create execution output directory then use its default log path
        this.paths.createExecutionOutputDir();
        const logPath = loggingOptions?.logFilePath ?? this.paths.getExecutionLogFilePath();
        handlers.push(new GOFileLoggerHandler(this.paths, undefined, logPath));
      }
    }

    // Custom handlers
    if (loggingOptions?.handlers) {
      handlers.push(...loggingOptions.handlers);
    }

    return new GOLogger(handlers);
  }

  /**
   * Initialize configuration reader
   */
  private initializeConfigProviders(configOptions?: GOScriptConfigOptions): ReadonlyArray<GOConfigProvider> {
    // Get config file paths with resolution info
    const jsonConfigInfo = this.paths.getConfigFilePathWithInfo('config.json');
    const yamlConfigInfo = this.paths.getConfigFilePathWithInfo('config.yaml');
    const envConfigInfo = this.paths.getConfigFilePathWithInfo('.env');

    // Build user-friendly display names based on config source
    const jsonDisplayName =
      jsonConfigInfo.source === 'centralized'
        ? `JSON(data/${this.paths.getScriptName()}/configs/config.json)`
        : `JSON(configs/config.json)`;

    const yamlDisplayName =
      yamlConfigInfo.source === 'centralized'
        ? `YAML(data/${this.paths.getScriptName()}/configs/config.yaml)`
        : `YAML(configs/config.yaml)`;

    const envDisplayName =
      envConfigInfo.source === 'centralized'
        ? `Environment(data/${this.paths.getScriptName()}/configs/.env)`
        : `Environment(configs/.env)`;

    try {
      if (configOptions?.configProviders) {
        // Custom providers: skip CLI provider tracking (cannot assume structure)
        return this.appendPresetConfigProvider(configOptions.configProviders);
      } else {
        // Shared file/env providers — identical for both Lambda and local/CI
        const sharedProviders: GOConfigProvider[] = [
          new GOJSONConfigProvider({
            filePath: jsonConfigInfo.path,
            optional: true,
            displayName: jsonDisplayName,
          }),
          new GOYAMLConfigProvider({
            filePath: yamlConfigInfo.path,
            optional: true,
            displayName: yamlDisplayName,
          }),
          new GOEnvironmentConfigProvider({
            environmentFilePath: envConfigInfo.path,
            displayName: envDisplayName,
          }),
        ];

        if (this.environment.isAWSManaged) {
          // AWS-managed (Lambda/ECS/CodeBuild): process.argv is irrelevant — skip CLI provider.
          // Prepend a Lambda event provider (initially empty; populated per-invocation by
          // createLambdaHandler before loadConfig is called).
          const eventProvider = new GOLambdaEventConfigProvider({});
          this.lambdaEventProvider = eventProvider;
          return this.appendPresetConfigProvider([eventProvider, ...sharedProviders]);
        } else {
          // Local / CI: track CLI provider for unknown parameter detection
          const cliProvider = new GOCommandLineConfigProvider();
          this.cliProvider = cliProvider;
          return this.appendPresetConfigProvider([cliProvider, ...sharedProviders]);
        }
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const fileType = this.detectConfigFileType(errorMessage);

      this.logger.newline();
      this.logger.section('Configuration Error');
      this.logger.error('A configuration file was found but could not be parsed.');
      this.logger.error(`Details: ${errorMessage}`);
      this.logger.newline();
      this.logger.info(`Please verify that your configuration file contains valid ${fileType} syntax.`);

      // Always throw — internal methods must not call process.exit().
      // CLI entry points wrap the script in .catch(() => process.exit(1)).
      throw error instanceof Error ? error : new Error(errorMessage);
    }
  }

  private appendPresetConfigProvider(
    selectorProviders: ReadonlyArray<GOConfigProvider>,
  ): ReadonlyArray<GOConfigProvider> {
    const presetProvider = new GOPresetConfigProvider({
      selectorProviders,
      presetNameParameter: GOSCRIPT_PRESET_NAME_PARAMETER,
      presetFileParameter: GOSCRIPT_PRESET_FILE_PARAMETER,
      schema: this.configSchema,
      loadPreset: (selection) =>
        new GOScriptPresetLoader().loadSelectedPreset({
          presetName: selection.presetName,
          ...(selection.presetFile !== undefined ? { presetFile: selection.presetFile } : {}),
          paths: this.paths,
          schema: this.configSchema,
        }),
      ...(this.options.config?.secrets !== undefined ? { secretsSpecifier: this.options.config.secrets } : {}),
      onInfo: (message) => this.logger.info(message),
      onWarning: (message) => this.logger.warning(message),
    });

    return [...selectorProviders, presetProvider];
  }

  private createConfigLoader(configReader: GOConfigReader): GOScriptConfigLoader {
    return new GOScriptConfigLoader(this.configSchema, configReader, { paths: this.paths });
  }

  /**
   * Detect the configuration file type from a provider error message.
   * Returns the specific file format name for user-facing messages.
   *
   * @param errorMessage - The error message thrown by a config provider
   * @returns The detected file type label (e.g., "JSON", "YAML", ".env")
   */
  private detectConfigFileType(errorMessage: string): string {
    if (errorMessage.includes('JSON')) {
      return 'JSON';
    }
    if (errorMessage.includes('YAML')) {
      return 'YAML';
    }
    if (errorMessage.includes('environment file') || errorMessage.includes('env file')) {
      return '.env';
    }
    return 'JSON/YAML/.env';
  }

  /**
   * Initialize configuration schema
   */
  private initializeConfigSchema(configOptions?: GOScriptConfigOptions): GOConfigSchema {
    const programName = this.paths.getScriptName();
    const schema = new GOConfigSchema({
      name: this.metadata.name,
      version: this.metadata.version,
      programName,
      description: this.metadata.description,
      usage: [`${programName} [OPTIONS]`],
      colors: consoleColorsEnabled(),
      ...configOptions?.schema,
    });

    // Register parameters
    if (configOptions?.parameters) {
      schema.addParameters(configOptions.parameters);
    }

    schema.addReservedParameters(GOSCRIPT_SYSTEM_PARAMETERS);

    return schema;
  }

  /**
   * Create a logging callback that bridges to the script's logger.
   * Used by components that need callback-based logging (credentials manager, file copier).
   */
  private createLogCallback(): GOAWSCredentialsLogHandler {
    return (message, level) => {
      switch (level) {
        case 'warn':
          this.logger.warning(message);
          break;
        case 'error':
          this.logger.error(message);
          break;
        case 'info':
        default:
          this.logger.info(message);
          break;
      }
    };
  }

  /**
   * Create a prompt callback that bridges to the script's prompt system.
   * @param defaultValue - Default value if user doesn't respond
   */
  private createPromptCallback(defaultValue: boolean): GOAWSCredentialsPromptHandler {
    return async (message) => (await this.prompt.confirm(message, defaultValue)) ?? defaultValue;
  }

  /**
   * Initialize the script
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Before init hook
    await this.hooks.onBeforeInit?.(this.buildHookContext());

    // Ensure data directories exist (inputs, outputs)
    this.paths.ensureDirectoriesExist();

    // Log script info
    this.logger.text(`${this.metadata.name} ${this.metadata.version || ''}`);
    if (this.metadata.description) {
      this.logger.newline();
      this.logger.text(this.metadata.description);
    }
    if (this.metadata.authors.length > 0) {
      this.logger.text(`Authors: ${this.metadata.authors.join(', ')}`);
    }

    this.logger.newline();
    this.initialized = true;

    // After init hook
    await this.hooks.onAfterInit?.(this.buildHookContext());
  }

  /**
   * Load configuration from providers
   */
  public async loadConfig(): Promise<Record<string, unknown>> {
    if (this.configLoaded) {
      return this.config.toRecord();
    }

    // Before config load hook
    await this.hooks.onBeforeConfigLoad?.(this.buildHookContext());

    // Check for --help flag (only in interactive environments — process.argv is meaningless in Lambda)
    if (this.options.config?.autoHelp !== false && !this.environment.isAWSManaged && this.hasHelpFlag()) {
      this.showHelp();
      if (this.options.config?.exitAfterHelp !== false) {
        process.exit(0);
      }
      return {};
    }

    // Validate unknown CLI parameters (before loading for better UX).
    // this.cliProvider is undefined in AWS-managed environments, so this block is already
    // skipped there; the explicit isAWSManaged guard is added for clarity only.
    if (this.options.config?.rejectUnknownParameters !== false && !this.environment.isAWSManaged && this.cliProvider) {
      const providedFlags = this.cliProvider.getProvidedFlags();
      const unknownErrors = GOUnknownParameterDetector.detect(providedFlags, this.configSchema);

      if (unknownErrors.length > 0) {
        const errorMessage = GOUnknownParameterDetector.formatErrorMessage(unknownErrors);
        this.logger.error(errorMessage);
        this.showHelp();
        this.throwPrelogged(errorMessage);
      }
    }

    this.validateCliSystemParameterHasValue(GOSCRIPT_PRESET_NAME_PARAMETER);
    this.validateCliSystemParameterHasValue(GOSCRIPT_PRESET_FILE_PARAMETER);

    const loadResult = await this.configLoader.load();
    this.config = new GOConfig(loadResult.values, loadResult.sources);

    // Mark loaded before the prepare hook so a hook calling getConfiguration()
    // reads the current config instead of re-entering loadConfig().
    this.configLoaded = true;

    // Prepare/remap hook: may read resolved values (incl. reserved ones like the
    // active preset) and derive/override them, BEFORE required-parameter validation,
    // so derived values can satisfy required parameters and appear in the summary.
    await this.hooks.onAfterConfigLoad?.(this.buildHookContext());

    // Validate required parameters AFTER the prepare hook, recomputed from the schema
    // against the post-prepare config (not just the loader's pre-prepare baseline).
    // This way a value the hook SETS counts as provided, and a required value the hook
    // CLEARS/overwrites to undefined|null is still reported as missing.
    const missingRequired = this.configSchema
      .getAllParameters()
      .filter((param) => param.required)
      .map((param) => param.name)
      .filter((name) => {
        const value = this.config.get(name);
        return value === undefined || value === null;
      });
    if (missingRequired.length > 0) {
      const params = this.configSchema.getAllParameters();
      const errorMessage = GOScriptConfigLoader.formatMissingParametersError(missingRequired, params);
      this.logger.error(errorMessage);
      if (!this.environment.isAWSManaged) {
        this.showHelp();
      }
      this.throwPrelogged(errorMessage);
    }

    // Log config values (if enabled)
    if (this.options.logging?.logConfigOnStart !== false) {
      this.logConfigValues();
    }

    return this.config.toRecord();
  }

  /**
   * Get typed configuration from all providers.
   * Supports async fallback for parameters that define asyncFallback function.
   *
   * Resolution order for each parameter:
   * 1. Value from providers (CLI, config files, env vars)
   * 2. defaultValue (if set)
   * 3. asyncFallback (if set, awaited)
   *
   * @template TConfiguration - The typed configuration interface
   * @param propertyMapping - Optional custom property name mapping
   * @returns Promise resolving to typed configuration object
   *
   * @example
   * ```typescript
   * // Define parameter with async fallback
   * {
   *   name: 'ignore.patterns',
   *   type: Core.GOConfigParameterType.STRING_ARRAY,
   *   asyncFallback: async () => loadPatternsFromFile(),
   * }
   *
   * // Get configuration (ignorePatterns guaranteed to be populated)
   * const config = await script.getConfiguration<MyConfig>();
   * ```
   */
  async getConfiguration<TConfiguration>(
    propertyMapping?: Partial<Record<keyof TConfiguration, string>>,
  ): Promise<TConfiguration> {
    // Ensure config is loaded (loadConfig handles aliases properly via GOScriptConfigLoader)
    if (!this.configLoaded) {
      await this.loadConfig();
    }

    // loadConfig() (called above if needed) already validates required parameters and throws
    // on missing ones — no need to repeat the check here.
    const result = {} as TConfiguration;

    for (const param of this.configSchema.getAllParameters()) {
      if (param.reserved) {
        continue;
      }

      const propertyName = this.parameterNameToPropertyName(param.name);
      const finalPropertyName = (propertyMapping?.[propertyName as keyof TConfiguration] ??
        propertyName) as keyof TConfiguration;

      // Use the resolved config store (populated by loadConfig with proper alias support)
      const value: unknown = this.config.get(param.name);

      if (value !== undefined) {
        // Safe: the type system cannot verify that the resolved config value matches
        // TConfiguration[key] at runtime — callers must ensure their Config interface
        // matches the declared parameter types and GOConfigTypeConverter output.
        result[finalPropertyName] = value as TConfiguration[keyof TConfiguration];
      }
    }

    return result;
  }

  private parameterNameToPropertyName(paramName: string): string {
    // "start.date" -> "startDate"
    // "profile" -> "profile"
    // "alarm.name" -> "alarmName"
    return paramName
      .split('.')
      .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join('');
  }

  private validateCliSystemParameterHasValue(parameterName: string): void {
    if (this.cliProvider === undefined) {
      return;
    }

    const parameter = this.configSchema.getParameter(parameterName);
    if (parameter === undefined) {
      return;
    }

    const rawArgs = this.cliProvider.getRawArguments();
    const flagForms = this.getCliFlagForms(parameter.getAllCliFlags());

    for (let index = 0; index < rawArgs.length; index++) {
      const arg = rawArgs[index];
      if (arg === undefined) {
        continue;
      }

      for (const flag of flagForms) {
        if (arg === flag) {
          const nextArg = rawArgs[index + 1];
          if (nextArg === undefined || nextArg.startsWith('-')) {
            throw new Error(`${parameter.name} cannot be empty`);
          }
        }

        const inlinePrefix = `${flag}=`;
        if (arg.startsWith(inlinePrefix) && arg.slice(inlinePrefix.length).trim().length === 0) {
          throw new Error(`${parameter.name} cannot be empty`);
        }
      }
    }
  }

  private getCliFlagForms(flags: ReadonlyArray<string>): ReadonlySet<string> {
    const forms = new Set<string>();

    for (const flag of flags) {
      if (flag.startsWith('-')) {
        forms.add(flag);
        continue;
      }

      forms.add(`-${flag}`);
      forms.add(`--${flag}`);
    }

    return forms;
  }

  // ============================================================================
  // Type-safe config value accessors (delegate to the resolved GOConfig store)
  // ============================================================================

  /**
   * Log `message` as an error and throw it as a "pre-logged" Error.
   *
   * Use this instead of bare `throw new Error(message)` at any site that already
   * emits its own `this.logger.error(...)` context. The error is registered in
   * `preloggedErrors` so `executeLifecycle()`'s catch block will skip the generic
   * `handleError()` logging and avoid printing the same message twice.
   */
  private throwPrelogged(message: string): never {
    const err = new Error(message);
    this.preloggedErrors.add(err);
    throw err;
  }

  /**
   * Return the config value for `key` as a string, or undefined if absent or wrong type.
   */
  private getConfigString(key: string): string | undefined {
    return this.config.getString(key);
  }

  /**
   * Return the config value for `key` as a readonly string array, or undefined if absent or wrong type.
   */
  private getConfigStringArray(key: string): ReadonlyArray<string> | undefined {
    return this.config.getStringArray(key);
  }

  /**
   * Effective AWS profile list used by the unified AWS provider.
   *
   * `aws.profiles` wins when present; otherwise `aws.profile` is promoted
   * to a single-element multi-profile provider. This keeps script code on
   * one API (`script.aws`) while preserving both CLI parameter styles.
   */
  private resolveAwsProfileNames(): ReadonlyArray<string> {
    const profiles = this.getConfigStringArray('aws.profiles')
      ?.map((profile) => profile.trim())
      .filter((profile) => profile.length > 0);

    if (profiles !== undefined && profiles.length > 0) {
      return profiles;
    }

    const profile = this.getConfigString('aws.profile')?.trim();
    if (profile !== undefined && profile.length > 0) {
      return [profile];
    }

    return [];
  }

  private resolveAwsRegion(): string | undefined {
    const region = this.getConfigString('aws.region')?.trim();
    return region && region.length > 0 ? region : undefined;
  }

  private getAwsProfilesKey(): string | undefined {
    if (!this.hasAwsProfileParam && !this.hasAwsProfilesParam) {
      return undefined;
    }

    const profiles = this.resolveAwsProfileNames();
    const profileKey = profiles.length > 0 ? profiles.join(',') : 'default';
    const regionKey = this.resolveAwsRegion() ?? '';
    return `${regionKey}|${profileKey}`;
  }

  // ============================================================================
  // Shared lifecycle executor
  // ============================================================================

  /**
   * Execute the standard script lifecycle: initialize → loadConfig → credentials → main → cleanup.
   *
   * Both `run()` (CLI) and the handler returned by `createLambdaHandler()` (Lambda) delegate
   * here so the lifecycle stays in one place. Each caller handles its own pre-lifecycle setup
   * (signal handlers for CLI; state reset + event injection for Lambda).
   *
   * @param mainFn - The async function containing the script's business logic
   * @param successMessage - Message logged on successful completion
   */
  private async executeLifecycle<T>(mainFn: GOScriptMainHandler<T>, successMessage: string): Promise<T> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.configLoaded) {
        await this.loadConfig();
      }

      // In Lambda: invalidate cached AWS clients if the profile changed since the last invocation
      if (this.environment.isAWSManaged) {
        this.refreshAwsClientsIfProfileChanged();
      }

      await this.hooks.onBeforeRun?.(this.buildHookContext());
      await this.handleAWSCredentials();

      const result = await mainFn();

      this.logger.success(successMessage);
      await this.hooks.onAfterRun?.(this.buildHookContext());

      return result;
    } catch (error) {
      if (error instanceof Error && this.preloggedErrors.has(error)) {
        // Already logged by a specific throw site — only call the hook, skip generic re-logging.
        await this.hooks.onError?.(toError(error), this.buildHookContext());
      } else {
        // Unexpected runtime error — log generically (message + stack).
        await this.handleError(error);
      }
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Invalidate cached AWS client providers when the active profile changes.
   *
   * Lambda containers are reused across invocations. If different invocations supply
   * different `aws.profile` or `aws.profiles` values via the event payload, the providers
   * built for the previous profile must be closed and recreated so they use the correct credentials.
   */
  private refreshAwsClientsIfProfileChanged(): void {
    const newProfilesKey = this.getAwsProfilesKey();

    if (newProfilesKey !== this.lastAwsProfilesKey && this.awsProvider !== undefined) {
      this.awsProvider.close();
      this.awsProvider = undefined;
    }

    this.lastAwsProfilesKey = newProfilesKey;
  }

  /**
   * Run the script with lifecycle management
   *
   * This method handles:
   * - Script initialization
   * - Configuration loading
   * - AWS credentials retry (if enabled)
   * - Lifecycle hooks (onBeforeRun, onAfterRun)
   * - Cleanup (including file copying)
   *
   * @param mainFunction - The main script logic to execute
   *
   * @example
   * ```typescript
   * await script.run(async () => {
   *   // Your script code here
   *   // All AWS operations are automatically protected with SSO retry
   *   const data = await cloudWatchService.describeAlarms();
   *   await processData(data);
   * });
   * ```
   */
  public async run(mainFunction: GOScriptRunHandler): Promise<void> {
    // Last-resort fault guards (unhandledRejection/uncaughtException/...) for the CLI entry point
    this.setupProcessGuards();
    // Setup graceful shutdown handlers (once, local/CI only — skipped in Lambda)
    this.setupSignalHandlers();
    await this.executeLifecycle(async () => Promise.resolve(mainFunction()), 'Script completed successfully');
  }

  /**
   * Create a Lambda-compatible handler function from this script.
   *
   * The returned handler:
   * - Injects the Lambda event payload as the highest-priority config provider,
   *   so event fields map directly to script parameters (see GOLambdaEventConfigProvider
   *   for key normalization rules: camelCase / snake_case → dot.notation).
   * - Supports Lambda container reuse: per-invocation state (config values, init flags)
   *   is reset on each call while expensive resources (AWS client connections) are kept alive.
   * - Never calls process.exit() — errors are thrown so the Lambda runtime can mark the
   *   invocation as failed and trigger retries / DLQ routing as configured.
   * - Does not register SIGTERM/SIGINT signal handlers (the runtime manages lifecycle).
   *
   * The existing main() function does not need to change: it calls
   * script.getConfiguration<T>() as usual and receives values sourced from the event
   * payload, environment variables, and bundled config files — in that priority order.
   *
   * @param mainFunction - Async function that receives the typed Lambda event and an optional context,
   *   and returns a result. The Lambda runtime always passes a context, but local invocations and tests
   *   may omit it — callbacks that use context should narrow it first (`if (context)` / `context?.x`).
   * @returns Lambda handler: `(event: TEvent, context?: TContext) => Promise<TResult>`. Context is
   *   optional in the returned signature so tests and wrappers can invoke `handler(event)` directly;
   *   when the Lambda runtime calls it, context is always provided and passed through unchanged.
   *
   * @example Handler that ignores the context
   * ```typescript
   * // index.ts — dual-mode entry point
   * const script = new Core.GOScript({ metadata, config: { parameters } });
   *
   * // Lambda export (handler name must match the function configuration)
   * export const handler = script.createLambdaHandler<MyEvent, MyResult, Context>(async (event) => {
   *   return await main(script, event);
   * });
   *
   * // CLI entry point (unchanged)
   * script.run(async () => {
   *   await main(script, null);
   * }).catch(() => process.exit(1));
   * ```
   *
   * @example Handler that uses the context (e.g. to opt out of waiting for the event loop)
   * ```typescript
   * export const handler = script.createLambdaHandler<ScheduledEvent, void, Context>(
   *   async (event, context) => {
   *     if (context) {
   *       context.callbackWaitsForEmptyEventLoop = false;
   *     }
   *     await main(script, event);
   *   },
   * );
   * ```
   *
   * @example Local invocation / unit test (context omitted)
   * ```typescript
   * await handler({ from: '2024-01-01', to: '2024-01-02' } as MyEvent);
   * ```
   *
   * @example Event payload mapping
   * ```json
   * { "startDate": "2024-01", "awsProfile": "pn-core-prod", "limit": 100 }
   * ```
   * is resolved as:
   * ```
   * start.date  = "2024-01"
   * aws.profile = "pn-core-prod"
   * limit       = "100"
   * ```
   */
  public createLambdaHandler<TEvent = unknown, TResult = unknown, TContext = unknown>(
    mainFunction: GOScriptLambdaMainHandler<TEvent, TResult, TContext>,
  ): GOScriptLambdaHandler<TEvent, TResult, TContext> {
    // Install last-resort fault guards once, at handler creation (cold start),
    // so faults during module init / between invocations are caught too.
    this.setupProcessGuards();

    return async (event: TEvent, context?: TContext): Promise<TResult> => {
      // Detach early from the event loop: the Lambda runtime freezes the container
      // on handler return, so pending keep-alive sockets / timers from reused AWS
      // clients (preserved by design across warm invocations) must not block the
      // response. Without this the invocation can stall until the event loop drains.
      this.detachFromEventLoop(context);

      // Attribute fault-guard logs to this invocation; cleared in finally so a
      // background fault between invocations is not misattributed to it.
      setProcessGuardRequestId(this.extractAwsRequestId(context));

      // Reset per-invocation state to support Lambda container reuse.
      // AWS client providers are intentionally NOT reset (connection-pool reuse).
      this.initialized = false;
      this.configLoaded = false;
      this.config = new GOConfig();

      // Inject the event payload into the pre-registered event config provider.
      // The provider was created (empty) during construction in initializeConfigReader();
      // here we populate it for this specific invocation before loadConfig() runs.
      // Array events (SQS batch, etc.) are skipped — flat key mapping only applies to objects.
      if (
        this.lambdaEventProvider !== undefined &&
        event !== null &&
        event !== undefined &&
        typeof event === 'object' &&
        !Array.isArray(event)
      ) {
        this.lambdaEventProvider.updateValues(this.resolveLambdaEventPayload(event as Record<string, unknown>));
      }

      // Delegate to shared lifecycle executor.
      // Re-throws on error so the Lambda runtime can mark the invocation as failed
      // and trigger retries / DLQ routing as configured.
      try {
        return await this.executeLifecycle(
          async () => mainFunction(event, context),
          'Lambda handler completed successfully',
        );
      } finally {
        setProcessGuardRequestId(null);
      }
    };
  }

  /**
   * Best-effort extraction of the AWS request id from a Lambda Context-like
   * object, used to attribute fault-guard logs. Returns null when absent
   * (e.g. local invocation / unit test without a context).
   */
  private extractAwsRequestId(context: unknown): string | null {
    if (context !== null && typeof context === 'object' && 'awsRequestId' in context) {
      const id = (context as { awsRequestId?: unknown }).awsRequestId;
      if (typeof id === 'string') {
        return id;
      }
    }
    return null;
  }

  /**
   * Resolve the object whose keys map to configuration parameters for an invocation.
   *
   * Supports an optional `body` envelope (EventBridge constant inputs, API
   * Gateway / Function URL events, …): when the event carries a usable `body`
   * — a plain object, or a JSON string that parses to one — its contents are
   * the config payload and any transport metadata at the top level is ignored.
   * Otherwise the event itself is used (flat payload).
   *
   * @param event - The raw Lambda event object
   * @returns The object whose (flat) keys feed the event config provider
   */
  private resolveLambdaEventPayload(event: Record<string, unknown>): Record<string, unknown> {
    const body = event['body'];

    if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }

    if (typeof body === 'string') {
      try {
        const parsed: unknown = JSON.parse(body);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // body is not JSON — fall through to the flat event payload
      }
    }

    return event;
  }

  /**
   * Set `callbackWaitsForEmptyEventLoop = false` on the Lambda Context so the
   * runtime returns/freezes as soon as the handler resolves, without waiting for
   * the event loop to drain. Safe for connection-reuse models (the default
   * here): all work is awaited inside the handler, so nothing relies on
   * post-return background tasks. No-op when no Context is provided (local
   * invocation / unit test) or it lacks the property.
   */
  private detachFromEventLoop(context: unknown): void {
    if (context !== null && typeof context === 'object' && 'callbackWaitsForEmptyEventLoop' in context) {
      (context as { callbackWaitsForEmptyEventLoop: boolean }).callbackWaitsForEmptyEventLoop = false;
    }
  }

  /**
   * Build the context handed to lifecycle hooks. Reads `this.config` at call time
   * so the live resolved-configuration store is exposed (a hook can read and
   * override values through it).
   */
  private buildHookContext(): GOScriptHookContext {
    return {
      config: this.config,
      env: this.env,
      paths: this.paths,
      environment: this.environment,
      logger: this.logger,
    };
  }

  /**
   * Show help message
   */
  public showHelp(): void {
    const help = this.configSchema.generateHelp();
    // eslint-disable-next-line no-console
    console.log(help);
  }

  /**
   * Check if --help flag is present
   */
  private hasHelpFlag(): boolean {
    return process.argv.includes('--help') || process.argv.includes('-h') || process.argv.includes('--h');
  }

  /**
   * Log configuration values
   */
  private logConfigValues(): void {
    const params = this.configSchema.getAllParameters();
    if (params.length === 0) return;

    const presentParams = params.filter((param) => this.config.get(param.name) !== undefined);

    const configurationEntries = presentParams.map((param) => this.buildConfigLogEntry(param.name));

    // AWS-managed: emit a compact structured summary for humans plus one
    // normalized event per parameter for CloudWatch Logs Insights queries.
    if (this.environment.isAWSManaged) {
      const configuration: Record<string, GOScriptConfigSummaryEntry> = {};
      for (const entry of configurationEntries) {
        configuration[entry.parameter] = {
          value: entry.value,
          source: entry.source,
        };
      }

      this.logger.log(
        new GOLogEvent('Configuration summary', GOLogEventCategory.INFO, {
          eventType: 'configuration_summary',
          configurationCount: configurationEntries.length,
          configuration,
        }),
      );

      for (const entry of configurationEntries) {
        this.logger.log(
          new GOLogEvent('Configuration parameter', GOLogEventCategory.INFO, {
            eventType: 'configuration_parameter',
            parameter: entry.parameter,
            value: entry.value,
            source: entry.source,
          }),
        );
      }
      return;
    }

    const { parameterWidth, valueWidth, sourceWidth, padding } = configTableWidths;
    const valueContentWidth = valueWidth - padding;
    const sourceContentWidth = sourceWidth - padding;

    this.logger.section('Configuration Summary:');
    this.logger.table({
      columns: [
        { header: 'Parameter', key: 'parameter', width: parameterWidth },
        {
          header: 'Value',
          key: 'value',
          width: valueWidth,
          formatter: (value) => formatConfigValueDisplay(valueToString(value), valueContentWidth),
        },
        {
          header: 'Source',
          key: 'source',
          width: sourceWidth,
          formatter: (value) => formatConfigSourceDisplay(valueToString(value), sourceContentWidth),
        },
      ],
      data: configurationEntries,
      border: true,
      headerSeparator: true,
    });
  }

  private buildConfigLogEntry(paramName: string): GOScriptConfigLogEntry {
    const entry: GOScriptConfigLogEntry = {
      parameter: paramName,
      value: this.formatConfigValue(paramName),
      source: GOScriptConfigLoader.getSourceDisplayName(this.config.sourceOf(paramName)),
    };

    return this.redactConfigLogEntry(entry);
  }

  private redactConfigLogEntry(entry: GOScriptConfigLogEntry): GOScriptConfigLogEntry {
    const redacted = redactSensitiveLogValue({
      [entry.parameter]: {
        value: entry.value,
        source: entry.source,
      },
    });

    if (redacted === null || typeof redacted !== 'object' || Array.isArray(redacted)) {
      return entry;
    }

    const redactedEntry = (redacted as Record<string, unknown>)[entry.parameter];
    if (redactedEntry === null || typeof redactedEntry !== 'object' || Array.isArray(redactedEntry)) {
      return entry;
    }

    const redactedRecord = redactedEntry as Record<string, unknown>;
    return {
      parameter: entry.parameter,
      value: typeof redactedRecord['value'] === 'string' ? redactedRecord['value'] : entry.value,
      source: typeof redactedRecord['source'] === 'string' ? redactedRecord['source'] : entry.source,
    };
  }

  /**
   * Initialize the secret redactor by merging per-parameter `sensitive` flags
   * with any script-level secrets specifier. Uses union (OR) semantics:
   * a parameter is secret if either its flag is set or the specifier matches.
   */
  private initializeSecretRedactor(configOptions?: GOScriptConfigOptions): GOSecretRedactor {
    const sensitiveKeys: string[] = this.configSchema
      .getAllParameters()
      .filter((p) => p.sensitive)
      .map((p) => p.name);

    const scriptSpecifier = configOptions?.secrets;

    // No sensitive params and no script-level specifier → nothing to redact
    if (sensitiveKeys.length === 0 && scriptSpecifier === undefined) {
      return new GOSecretRedactor(GOSecretsSpecifierFactory.none());
    }

    // Only sensitive params, no script-level specifier
    if (scriptSpecifier === undefined) {
      return new GOSecretRedactor(GOSecretsSpecifierFactory.specific(sensitiveKeys));
    }

    // Only script-level specifier, no sensitive params
    if (sensitiveKeys.length === 0) {
      return new GOSecretRedactor(scriptSpecifier);
    }

    // Both exist → merge with union semantics via dynamic predicate
    const sensitiveKeySet = new Set(sensitiveKeys);
    const scriptRedactor = new GOSecretRedactor(scriptSpecifier);

    return new GOSecretRedactor(
      GOSecretsSpecifierFactory.dynamic(
        (key, value) => sensitiveKeySet.has(key) || scriptRedactor.isSecret(key, value),
      ),
    );
  }

  /**
   * Format a config value for display, redacting secrets
   */
  private formatConfigValue(paramName: string): string {
    const value = this.config.get(paramName);
    const stringValue = valueToString(value);
    if (this.secretRedactor.isSecret(paramName, stringValue)) {
      return this.secretRedactor.redact(stringValue);
    }
    return stringValue;
  }

  /**
   * Handle errors
   */
  private async handleError(error: unknown): Promise<void> {
    const errorMessage = getErrorMessage(error);
    const errorStack = getErrorStack(error);

    this.logger.error(`Error: ${errorMessage}`);
    this.logger.fatal(`Error: \n${errorStack}`);

    // On error hook
    await this.hooks.onError?.(toError(error), this.buildHookContext());
  }

  /**
   * Cleanup resources.
   *
   * AWS client providers are intentionally kept alive in AWS-managed environments
   * (Lambda/ECS/CodeBuild) to allow connection-pool reuse across invocations.
   * They are only closed in local/CI environments where the process exits after
   * each script run anyway.
   */
  public async cleanup(): Promise<void> {
    try {
      // Cleanup hook
      await this.hooks.onCleanup?.(this.buildHookContext());

      // Close AWS client providers only in local/CI (not in Lambda — container reuse)
      if (!this.environment.isAWSManaged) {
        if (this.awsProvider !== undefined) {
          this.awsProvider.close();
          this.awsProvider = undefined;
        }
      }

      // Remove registered signal handlers to prevent listener accumulation
      // if the same GOScript instance is reused across multiple run() calls.
      for (const { signal, handler } of this.signalHandlerRefs) {
        process.removeListener(signal, handler);
      }
      this.signalHandlerRefs.splice(0);
      this.signalHandlersSetup = false;

      // Always close file log handlers (flush buffers / release file descriptors)
      const handlers = this.logger.getHandlers();
      for (const handler of handlers) {
        if (handler instanceof GOFileLoggerHandler) {
          await handler.close();
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Setup graceful shutdown handlers for container environments.
   * Handles SIGTERM, SIGINT, and SIGQUIT signals for clean termination.
   *
   * - SIGTERM: Sent by Docker stop, Kubernetes pod termination
   * - SIGINT: Sent by Ctrl+C in terminal
   * - SIGQUIT: Sent by Ctrl+\ in terminal
   *
   * On signal reception:
   * 1. Logs warning about shutdown initiation
   * 2. Calls cleanup() to release resources
   * 3. Exits with code 0 (or 1 if forced by repeated signal)
   */
  /**
   * Detect whether the process is running under a test runner.
   *
   * Used to suppress process-level fault guards during tests: a guard's
   * `process.exit(1)` would otherwise kill the whole test runner on the first
   * unhandled rejection a test deliberately provokes.
   *
   * `NODE_TEST_CONTEXT` is set by the Node.js test runner in each test
   * subprocess; the other signals cover Vitest/Jest and an explicit NODE_ENV.
   */
  private isUnderTestRunner(): boolean {
    const env = process.env;
    return (
      env['NODE_TEST_CONTEXT'] !== undefined ||
      env['NODE_ENV'] === 'test' ||
      env['VITEST'] !== undefined ||
      env['JEST_WORKER_ID'] !== undefined
    );
  }

  /**
   * Install process-level fault guards for entry points (CLI run() / Lambda).
   *
   * Enabled by default (disable with top-level `processGuards: false` in the script options),
   * always suppressed under a test runner. `beforeExit` is only registered in
   * AWS-managed runtimes, where it is a meaningful leak diagnostic; in a CLI it
   * would log on every normal exit.
   */
  private setupProcessGuards(): void {
    if (this.options.processGuards === false || this.isUnderTestRunner()) {
      return;
    }
    installProcessGuards({ exitOnFatal: true, includeBeforeExit: this.environment.isAWSManaged });
  }

  private setupSignalHandlers(): void {
    // Prevent duplicate handler registration
    if (this.signalHandlersSetup) {
      return;
    }

    // In AWS-managed environments the runtime manages the process lifecycle.
    // Registering our own SIGTERM/SIGINT handlers here would interfere with
    // Lambda's graceful shutdown and ECS task stop behaviour.
    if (this.environment.isAWSManaged) {
      return;
    }

    this.signalHandlersSetup = true;

    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGQUIT'];

    for (const signal of signals) {
      const handler = (): void => {
        // Force exit if shutdown already in progress
        if (this.isShuttingDown) {
          this.logger.warning(`${signal} received again, forcing exit...`);
          process.exit(1);
        }

        this.isShuttingDown = true;
        this.logger.warning(`Received ${signal}, initiating graceful shutdown...`);
        this.logger.info('Waiting for current operations to complete...');

        this.cleanup()
          .then(() => {
            this.logger.info('Cleanup completed, exiting...');
            process.exit(0);
          })
          .catch((error: unknown) => {
            this.logger.error(`Error during cleanup: ${getErrorMessage(error)}`);
            process.exit(1);
          });
      };

      // Store reference so cleanup() can remove it, preventing listener accumulation
      // if the same GOScript instance is reused across multiple run() calls.
      this.signalHandlerRefs.push({ signal, handler });
      process.on(signal, handler);
    }
  }

  /**
   * Handle AWS credentials based on execution environment
   *
   * Decision tree:
   * 1. No aws.profile/aws.profiles param -> skip
   * 2. AWS-managed (Lambda, ECS, EC2) -> use default credential chain
   * 3. Environment credentials -> use as-is
   * 4. Web identity token -> use as-is
   * 5. Local interactive -> validate SSO, prompt for login if needed
   * 6. CI without credentials -> validate or fail with clear error
   */
  private async handleAWSCredentials(): Promise<void> {
    // Guard: No AWS config needed (cached flags — set once in constructor)
    if (!this.hasAwsProfileParam && !this.hasAwsProfilesParam) return;

    this.logAWSEnvironmentInfo();

    // Guard: AWS-managed environment (Lambda, ECS, EC2, CodeBuild)
    if (this.environment.isAWSManaged) {
      this.logger.info('Running in AWS-managed environment, using default credential chain');
      return;
    }

    // Guard: Environment credentials (CI with explicit credentials)
    if (this.environment.credentialSource === GOCredentialSource.ENVIRONMENT) {
      this.logger.info('Using AWS credentials from environment variables');
      return;
    }

    // Guard: Web identity token (OIDC federation)
    if (this.environment.credentialSource === GOCredentialSource.WEB_IDENTITY) {
      this.logger.info('Using web identity token for credentials');
      return;
    }

    // Handle multi-profile if aws.profiles is configured
    if (this.hasAwsProfilesParam) {
      const profiles = this.getConfigStringArray('aws.profiles')
        ?.map((profile) => profile.trim())
        .filter((profile) => profile.length > 0);
      if (profiles !== undefined && profiles.length > 0) {
        await this.handleMultiProfileAWSCredentials(profiles);
        return;
      }
    }

    // Fall back to single profile handling
    const profile = this.getConfigString('aws.profile');
    if (profile === undefined || profile.trim().length === 0) {
      this.logger.info('No AWS profile configured, using SDK default credential chain');
      return;
    }

    if (this.environment.isInteractive) {
      await this.handleInteractiveAWSCredentials(profile);
    } else {
      await this.handleNonInteractiveAWSCredentials(profile);
    }
  }

  /**
   * Handle AWS credentials for multiple profiles
   * Validates all profiles and performs SSO login as needed
   */
  private async handleMultiProfileAWSCredentials(profiles: ReadonlyArray<string>): Promise<void> {
    if (!this.credentialsManager) {
      this.logger.warning('No credentials manager configured');
      return;
    }

    this.logger.info(`Validating ${profiles.length} AWS profile(s): ${profiles.join(', ')}`);

    const result = await this.credentialsManager.ensureValidCredentialsMultiple(profiles, {
      failFast: false, // Continue validating all profiles
    });

    // Log results
    if (result.successfulProfiles.length > 0) {
      this.logger.info(`Valid profiles: ${result.validProfileNames.join(', ')}`);
    }

    if (result.failedProfiles.length > 0) {
      for (const failure of result.failedProfiles) {
        this.logger.warning(`Profile '${failure.profile}' failed: ${failure.error.message}`);
      }
    }

    // Throw if all profiles failed
    if (result.successfulProfiles.length === 0) {
      throw new Error(`All AWS profiles failed validation. Profiles: ${profiles.join(', ')}`);
    }

    // Warn if some profiles failed but we have at least one valid
    if (!result.allSucceeded) {
      this.logger.warning(`Continuing with ${result.successfulProfiles.length}/${result.profileCount} valid profiles`);
    }
  }

  /**
   * Log AWS environment detection info
   */
  private logAWSEnvironmentInfo(): void {
    this.logger.section('AWS Credentials');
    this.logger.info(`Environment: ${this.environment.type}`);
    this.logger.info(`Credential Source: ${this.environment.credentialSource}`);
  }

  /**
   * Handle AWS credentials in interactive mode (local development)
   * Validates SSO credentials and prompts for login if needed
   */
  private async handleInteractiveAWSCredentials(profile: string | undefined): Promise<void> {
    if (!profile) {
      throw new Error('AWS profile is required but not provided (--aws-profile | --aws-profiles)');
    }

    if (!this.credentialsManager) {
      this.logger.warning('No credentials manager configured');
      return;
    }

    const isValid = await this.credentialsManager.ensureValidCredentials(profile);
    if (!isValid) {
      throw new Error(`AWS credentials not available for profile: ${profile}`);
    }
  }

  /**
   * Handle AWS credentials in non-interactive mode (CI/CD)
   * Validates credentials without attempting SSO login
   */
  private async handleNonInteractiveAWSCredentials(profile: string | undefined): Promise<void> {
    if (!profile || !this.credentialsManager) return;

    this.logger.warning('Non-interactive environment detected, SSO login not possible');
    this.logger.info(`Attempting to use profile: ${profile}`);

    const isValid = await this.credentialsManager.validateCredentialsAsync(profile);
    if (!isValid) {
      throw new Error(
        `AWS credentials not valid for profile: ${profile}\n` +
          'In CI environments, ensure credentials are available via:\n' +
          '  - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)\n' +
          '  - IAM role (if running in AWS)\n' +
          '  - Web identity token (OIDC federation)',
      );
    }
    this.logger.info('AWS credentials validated successfully');
  }

  /**
   * Check if script is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if config is loaded
   */
  public isConfigLoaded(): boolean {
    return this.configLoaded;
  }

  // ============================================================================
  // AWS Provider
  // ============================================================================

  /**
   * Unified AWS facade.
   *
   * - `script.aws.clients`: raw AWS SDK clients. Convenience getters use
   *   the first configured profile; multi-profile helpers remain available.
   * - `script.aws.services`: higher-level AWS services.
   *
   * Supports both `aws.profile` and `aws.profiles`. A single profile is
   * promoted to an `AWSMultiClientProvider` with one entry.
   *
   * @example
   * ```typescript
   * const dynamoDB = script.aws.clients.dynamoDB;
   * const results = await script.aws.clients.mapParallelSettled(async (profile, clients) => {
   *   return clients.dynamoDB.send(new QueryCommand(params));
   * });
   * ```
   */
  get aws(): AWSProvider {
    if (this.awsProvider === undefined) {
      const region = this.resolveAwsRegion();
      // In AWS-managed environments (Lambda/ECS/EC2) ignore any configured aws.profile/aws.profiles
      // and use the SDK default credential chain (the execution role). Named SSO profiles only exist
      // on developer machines / CI, not in the runtime — building clients with fromIni({ profile })
      // there fails with CredentialsProviderError. This mirrors handleAWSCredentials(), which already
      // skips profile resolution in AWS-managed environments.
      const profiles = this.environment.isAWSManaged ? [] : this.resolveAwsProfileNames();
      this.awsProvider = new AWSProvider({
        profiles,
        ...(region !== undefined ? { region } : {}),
      });
    }
    return this.awsProvider;
  }

  // ============================================================================
  // File Copier Methods
  // ============================================================================

  /**
   * Resolve a file path and register it for copying to the execution directory.
   * This is a convenience method that combines path resolution with file registration.
   *
   * Resolution strategy for relative paths:
   * - GOPathType.INPUT -> data/{script}/inputs/{filename}
   * - GOPathType.OUTPUT -> data/{script}/outputs/{script}_{timestamp}/{filename}
   * - GOPathType.CONFIG -> data/{script}/configs/{filename} (with local fallback)
   *
   * Default destination subdirectories:
   * - GOPathType.INPUT -> 'inputs' subdirectory
   * - GOPathType.CONFIG -> 'configs' subdirectory
   * - GOPathType.OUTPUT -> root of execution directory (no subdirectory)
   *
   * @param filename - File name or relative path to resolve
   * @param pathType - Type of path resolution (INPUT, OUTPUT, or CONFIG)
   * @param options - Optional settings including custom subdirectory
   * @returns Resolved absolute path to the source file
   *
   * @example
   * ```typescript
   * // Resolve input file and register for copy to 'inputs' subdirectory (default)
   * const inputPath = script.resolveAndRegisterFile('data.csv', Core.GOPathType.INPUT);
   *
   * // Resolve config file and register for copy to 'configs' subdirectory (default)
   * const configPath = script.resolveAndRegisterFile('config.yaml', Core.GOPathType.CONFIG);
   *
   * // Resolve and register to root of execution directory
   * const outputPath = script.resolveAndRegisterFile('summary.txt', Core.GOPathType.OUTPUT);
   *
   * // Custom subdirectory
   * const customPath = script.resolveAndRegisterFile('data.csv', Core.GOPathType.INPUT, {
   *   subdir: 'custom-folder'
   * });
   *
   * // Copy to root (null subdirectory)
   * const rootPath = script.resolveAndRegisterFile('data.csv', Core.GOPathType.INPUT, {
   *   subdir: null
   * });
   * ```
   */
  public resolveAndRegisterFile(filename: string, pathType: GOPathTypeValue, options?: GOFileCopyFileOptions): string {
    // Resolve the path
    const resolvedPath = this.paths.resolvePath(filename, pathType);

    // Determine subdirectory: use provided option, or default based on pathType
    const subdir =
      options?.subdir !== undefined
        ? options.subdir
        : getDefaultSubdirForPathType(pathType, this.fileCopierOptions?.subdirDefaults);

    // Register the file
    const copier = this.initializeFileCopier();
    copier.registerFile(resolvedPath, { subdir });

    return resolvedPath;
  }

  /**
   * Register a file (by absolute path) for copying to the execution directory.
   * Use this when you already have the resolved path.
   *
   * @param sourcePath - Absolute path to the source file
   * @param options - Optional settings including subdirectory
   *
   * @example
   * ```typescript
   * // Register with custom subdirectory
   * script.registerFile('/absolute/path/to/file.csv', { subdir: 'inputs' });
   *
   * // Register to root of execution directory
   * script.registerFile('/absolute/path/to/file.csv', { subdir: null });
   * ```
   */
  public registerFile(sourcePath: string, options?: GOFileCopyFileOptions): void {
    const copier = this.initializeFileCopier();
    copier.registerFile(sourcePath, options);
  }

  /**
   * Copy all registered files to the execution directory and generate a report.
   * This should typically be called near the end of script execution.
   *
   * @returns Copy report with results and summary
   *
   * @example
   * ```typescript
   * // Register files during setup
   * script.resolveAndRegisterFile('input.csv', Core.GOPathType.INPUT);
   * script.resolveAndRegisterFile('config.yaml', Core.GOPathType.CONFIG);
   *
   * // ... script execution ...
   *
   * // Copy all registered files at the end
   * const report = await script.finalizeFiles();
   * script.logger.info(`Copied ${report.summary.copiedFiles} files`);
   * ```
   */
  public async finalizeFiles(): Promise<GOFileCopyReport> {
    const copier = this.initializeFileCopier();
    return copier.finalizeRegisteredFiles();
  }

  /**
   * Get the file copier instance for advanced operations.
   * Most scripts should use the convenience methods instead.
   *
   * @returns The GOFileCopier instance
   */
  public getFileCopier(): GOFileCopier {
    return this.initializeFileCopier();
  }

  /**
   * Check if a file is registered for copying.
   *
   * @param sourcePath - Path to check
   * @returns True if the file is registered
   */
  public isFileRegistered(sourcePath: string): boolean {
    if (!this.fileCopier) {
      return false;
    }
    return this.fileCopier.isRegistered(sourcePath);
  }

  /**
   * Get all registered file paths.
   *
   * @returns Array of registered source paths
   */
  public getRegisteredFiles(): ReadonlyArray<string> {
    if (!this.fileCopier) {
      return [];
    }
    return this.fileCopier.getRegisteredFiles();
  }
}
