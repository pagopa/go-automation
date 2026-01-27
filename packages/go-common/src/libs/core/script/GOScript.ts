/**
 * GOScript - Base class for creating scripts
 * Integrates logging, configuration, and prompts into a unified script framework
 */

import { AWSClientProvider, GOAWSCredentialsManager } from '../../aws/index.js';
import { GOConfigKeyTransformer } from '../config/GOConfigKeyTransformer.js';
import { GOConfigReader } from '../config/GOConfigReader.js';
import { GOConfigSchema } from '../config/GOConfigSchema.js';
import { GOCommandLineConfigProvider } from '../config/providers/GOCommandLineConfigProvider.js';
import { GOEnvironmentConfigProvider } from '../config/providers/GOEnvironmentConfigProvider.js';
import { GOJSONConfigProvider } from '../config/providers/GOJSONConfigProvider.js';
import { GOYAMLConfigProvider } from '../config/providers/GOYAMLConfigProvider.js';
import { GOCredentialSource } from '../environment/GOCredentialSource.js';
import { GOExecutionEnvironment } from '../environment/GOExecutionEnvironment.js';
import type { GOExecutionEnvironmentInfo } from '../environment/GOExecutionEnvironmentInfo.js';
import { GOFileCopier } from '../files/GOFileCopier.js';
import { getDefaultSubdirForPathType } from '../files/GOFileCopierOptions.js';
import type { GOFileCopyFileOptions } from '../files/GOFileCopierOptions.js';
import type { GOFileCopyReport } from '../files/GOFileCopyReport.js';
import { GOLogger } from '../logging/GOLogger.js';
import { GOConsoleLoggerHandler } from '../logging/handlers/GOConsoleLoggerHandler.js';
import { GOFileLoggerHandler } from '../logging/handlers/GOFileLoggerHandler.js';
import { GOPrompt } from '../prompt/GOPrompt.js';
import { GOPaths, formatConfigValueDisplay, formatConfigSourceDisplay } from '../utils/index.js';
import type { GOPathTypeValue } from '../utils/index.js';

import { GOScriptConfigLoader } from './GOScriptConfigLoader.js';
import { defaultAwsCredentialsOptions, configTableWidths } from './GOScriptDefaults.js';
import type {
  GOScriptOptions,
  GOScriptMetadata,
  GOScriptLoggingOptions,
  GOScriptConfigOptions,
  GOScriptLifecycleHooks,
  GOScriptFileCopierOptions,
} from './GOScriptOptions.js';

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
  private readonly credentialsManager?: GOAWSCredentialsManager | undefined;
  private fileCopier?: GOFileCopier | undefined;
  private readonly fileCopierOptions?: GOScriptFileCopierOptions | undefined;
  private awsClientProvider?: AWSClientProvider | undefined;

  // State
  private initialized: boolean = false;
  private configLoaded: boolean = false;
  private configValues: Record<string, unknown> = {};
  private configSources: Map<string, string> = new Map(); // Track which provider supplied each value
  private signalHandlersSetup: boolean = false;
  private isShuttingDown: boolean = false;

  constructor(options: GOScriptOptions) {
    this.options = options;
    this.metadata = options.metadata;
    this.hooks = options.hooks ?? {};

    // Detect execution environment
    this.environment = GOExecutionEnvironment.detect();

    // Initialize
    const scriptName = this.metadata.name.replace(/\s+/g, '-').toLowerCase();
    this.paths = new GOPaths(scriptName);
    this.logger = this.initializeLogger(options.logging);
    this.prompt = new GOPrompt(this.logger);

    // Initialize config schema and reader
    this.configReader = this.initializeConfigReader(options.config);
    this.configSchema = this.initializeConfigSchema(options.config);

    // Initialize config loader
    this.configLoader = new GOScriptConfigLoader(this.configSchema, this.configReader);

    // Initialize credentials manager if needed
    this.credentialsManager = this.initializeCredentialManager(options.config);

    // Store file copier options for lazy initialization
    this.fileCopierOptions = options.fileCopier;
  }

  /**
   * Initialize AWS credentials manager if aws.profile parameter is defined.
   */
  private initializeCredentialManager(
    configOptions?: GOScriptConfigOptions,
  ): GOAWSCredentialsManager | undefined {
    const hasAwsProfileParam =
      configOptions?.parameters?.some((p) => p.name === 'aws.profile') ?? false;
    const awsCredentialsConfig = configOptions?.awsCredentials;

    if (awsCredentialsConfig ?? hasAwsProfileParam) {
      return new GOAWSCredentialsManager({
        autoLogin: awsCredentialsConfig?.autoLogin ?? defaultAwsCredentialsOptions.autoLogin,
        interactive: awsCredentialsConfig?.interactive ?? defaultAwsCredentialsOptions.interactive,
        maxRetries: awsCredentialsConfig?.maxRetries ?? defaultAwsCredentialsOptions.maxRetries,
        loginTimeout:
          awsCredentialsConfig?.loginTimeout ?? defaultAwsCredentialsOptions.loginTimeout,
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
   * Initialize logger with handlers
   */
  private initializeLogger(loggingOptions?: GOScriptLoggingOptions): GOLogger {
    const handlers = [];

    // Console handler (default: enabled)
    if (loggingOptions?.console !== false) {
      handlers.push(new GOConsoleLoggerHandler());
    }

    // File handler (default: enabled)
    if (loggingOptions?.file !== false) {
      // Create execution output directory before initializing file logger
      this.paths.createExecutionOutputDir();

      const logPath = loggingOptions?.logFilePath ?? this.paths.getExecutionLogFilePath();
      handlers.push(new GOFileLoggerHandler(this.paths, undefined, logPath));
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
  private initializeConfigReader(configOptions?: GOScriptConfigOptions): GOConfigReader {
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

    const configProviders = configOptions?.configProviders ?? [
      new GOCommandLineConfigProvider(),
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

    const configReader = new GOConfigReader(configProviders);
    return configReader;
  }
  /**
   * Initialize configuration schema
   */
  private initializeConfigSchema(configOptions?: GOScriptConfigOptions): GOConfigSchema {
    const schema = new GOConfigSchema({
      name: this.metadata.name,
      version: this.metadata.version,
      ...configOptions?.schema,
    });

    // Register parameters
    if (configOptions?.parameters) {
      schema.addParameters(configOptions.parameters);
    }

    return schema;
  }

  /**
   * Create a logging callback that bridges to the script's logger.
   * Used by components that need callback-based logging (credentials manager, file copier).
   */
  private createLogCallback(): (message: string, level: 'info' | 'warn' | 'error') => void {
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
  private createPromptCallback(defaultValue: boolean): (message: string) => Promise<boolean> {
    return async (message) => this.prompt.confirm(message, defaultValue);
  }

  /**
   * Initialize the script
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Before init hook
      await this.hooks.onBeforeInit?.();

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
      await this.hooks.onAfterInit?.();
    } catch (error) {
      await this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Load configuration from providers
   */
  public async loadConfig(): Promise<Record<string, unknown>> {
    if (this.configLoaded) {
      return this.configValues;
    }

    try {
      // Before config load hook
      await this.hooks.onBeforeConfigLoad?.();

      //this.logger.section('Loading Configuration');

      // Check for --help flag
      if (this.options.config?.autoHelp !== false && this.hasHelpFlag()) {
        this.showHelp();
        if (this.options.config?.exitAfterHelp !== false) {
          process.exit(0);
        }
        return {};
      }

      // Load configuration using the config loader
      //this.prompt.spinner.start('Reading configuration...');

      const loadResult = await this.configLoader.load();
      this.configValues = loadResult.values;
      this.configSources = loadResult.sources;

      //this.prompt.spinner.stop('Configuration loaded');

      // Validate required parameters BEFORE showing config summary
      if (loadResult.missingRequired.length > 0) {
        const params = this.configSchema.getAllParameters();
        const errorMessage = GOScriptConfigLoader.formatMissingParametersError(
          loadResult.missingRequired,
          params,
        );
        console.error(`\n${errorMessage}\n`);
        this.showHelp();
        process.exit(1);
      }

      // Log config values (if enabled)
      if (this.options.logging?.logConfigOnStart !== false) {
        this.logConfigValues();
      }

      this.configLoaded = true;

      // After config load hook
      await this.hooks.onAfterConfigLoad?.(this.configValues);

      return this.configValues;
    } catch (error) {
      //this.prompt.spinner.fail('Configuration loading failed');
      await this.handleError(error as Error);
      throw error;
    }
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
    const result = {} as TConfiguration;
    const missingParams: string[] = [];

    for (const param of this.configSchema.getAllParameters()) {
      const propertyName = this.parameterNameToPropertyName(param.name);
      const finalPropertyName = (propertyMapping?.[propertyName as keyof TConfiguration] ??
        propertyName) as keyof TConfiguration;

      try {
        const value: unknown = await param.getValueAsync(this.configReader);
        result[finalPropertyName] = value as TConfiguration[keyof TConfiguration];
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Required parameter') &&
          error.message.includes('is missing')
        ) {
          missingParams.push(param.name);
        } else {
          throw error;
        }
      }
    }

    if (missingParams.length > 0) {
      const cliParams = missingParams.map((p) => GOConfigKeyTransformer.toCLIFlag(p));
      console.error(
        `\nMissing required parameter${missingParams.length > 1 ? 's' : ''}: ${cliParams.join(', ')}\n`,
      );
      this.showHelp();
      process.exit(1);
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
  public async run(mainFunction: () => void | Promise<void>): Promise<void> {
    // Setup graceful shutdown handlers (once)
    this.setupSignalHandlers();

    try {
      // Initialize if not done
      if (!this.initialized) {
        await this.initialize();
      }

      // Load config if not done
      if (!this.configLoaded) {
        await this.loadConfig();
      }

      // Before run hook
      await this.hooks.onBeforeRun?.();

      // Handle AWS credentials based on execution environment
      await this.handleAWSCredentials();

      // Execute main function (credentials already validated)
      await mainFunction();

      this.logger.success('Script completed successfully');

      // After run hook
      await this.hooks.onAfterRun?.();
    } catch (error) {
      await this.handleError(error as Error);
      throw error;
    } finally {
      await this.cleanup();
    }
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
    return (
      process.argv.includes('--help') || process.argv.includes('-h') || process.argv.includes('--h')
    );
  }

  /**
   * Log configuration values
   */
  private logConfigValues(): void {
    const params = this.configSchema.getAllParameters();
    if (params.length === 0) return;

    const { parameterWidth, valueWidth, sourceWidth, padding } = configTableWidths;
    const valueContentWidth = valueWidth - padding;
    const sourceContentWidth = sourceWidth - padding;

    const tableData = params
      .filter((param) => this.configValues[param.name] !== undefined)
      .map((param) => ({
        parameter: param.name,
        value: this.formatConfigValue(param.name),
        source: GOScriptConfigLoader.getSourceDisplayName(this.configSources.get(param.name)),
      }));

    this.logger.section('Configuration Summary:');
    this.logger.table({
      columns: [
        { header: 'Parameter', key: 'parameter', width: parameterWidth },
        {
          header: 'Value',
          key: 'value',
          width: valueWidth,
          formatter: (value: string) => formatConfigValueDisplay(value, valueContentWidth),
        },
        {
          header: 'Source',
          key: 'source',
          width: sourceWidth,
          formatter: (value: string) => formatConfigSourceDisplay(value, sourceContentWidth),
        },
      ],
      data: tableData,
      border: true,
      headerSeparator: true,
    });
  }

  /**
   * Format a config value for display, redacting secrets
   */
  private formatConfigValue(paramName: string): string {
    const value = this.configValues[paramName];
    const isSecret = /key|secret|password|token/i.test(paramName);
    return isSecret ? '***REDACTED***' : JSON.stringify(value);
  }

  /**
   * Handle errors
   */
  private async handleError(error: Error): Promise<void> {
    const errorMessage = error.message ?? String(error);
    const errorStack = error.stack ?? String(error);

    this.logger.error(`Error: ${errorMessage}`);
    this.logger.fatal(`Error: \n${errorStack}`);

    // On error hook
    await this.hooks.onError?.(error);
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    try {
      // Cleanup hook
      await this.hooks.onCleanup?.();

      // Close AWS client provider
      if (this.awsClientProvider !== undefined) {
        this.awsClientProvider.close();
        this.awsClientProvider = undefined;
      }

      // Close file handlers
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
  private setupSignalHandlers(): void {
    // Prevent duplicate handler registration
    if (this.signalHandlersSetup) {
      return;
    }
    this.signalHandlersSetup = true;

    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGQUIT'];

    for (const signal of signals) {
      process.on(signal, () => {
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error during cleanup: ${errorMessage}`);
            process.exit(1);
          });
      });
    }
  }

  /**
   * Handle AWS credentials based on execution environment
   *
   * Decision tree:
   * 1. No aws.profile param -> skip
   * 2. AWS-managed (Lambda, ECS, EC2) -> use default credential chain
   * 3. Environment credentials -> use as-is
   * 4. Web identity token -> use as-is
   * 5. Local interactive -> validate SSO, prompt for login if needed
   * 6. CI without credentials -> validate or fail with clear error
   */
  private async handleAWSCredentials(): Promise<void> {
    // Guard: No AWS config needed
    if (!this.hasAwsProfileParameter()) return;

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

    // Main logic: SSO profile validation
    const profile = this.configValues['aws.profile'] as string | undefined;

    if (this.environment.isInteractive) {
      await this.handleInteractiveAWSCredentials(profile);
    } else {
      await this.handleNonInteractiveAWSCredentials(profile);
    }
  }

  /**
   * Check if script has aws.profile parameter configured
   */
  private hasAwsProfileParameter(): boolean {
    return this.options.config?.parameters?.some((p) => p.name === 'aws.profile') ?? false;
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
      throw new Error('AWS profile is required but not provided (--aws-profile)');
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
  // AWS Client Provider
  // ============================================================================

  /**
   * Returns the AWSClientProvider for accessing AWS SDK clients.
   *
   * The provider is created lazily on first access using the 'aws.profile'
   * configuration parameter. Subsequent accesses return the same instance.
   *
   * @throws Error if 'aws.profile' parameter is not configured
   *
   * @example
   * ```typescript
   * // Access DynamoDB client
   * const dynamoDB = script.aws.dynamoDB;
   *
   * // Use the client
   * const result = await dynamoDB.send(new QueryCommand(params));
   * ```
   */
  get aws(): AWSClientProvider {
    if (this.awsClientProvider === undefined) {
      const awsProfile = this.configValues['aws.profile'] as string | undefined;

      if (!awsProfile) {
        throw new Error(
          'Cannot access AWS client provider: "aws.profile" parameter is not configured. ' +
            'Add aws.profile to your script parameters.',
        );
      }

      this.awsClientProvider = new AWSClientProvider({
        profile: awsProfile,
      });
    }
    return this.awsClientProvider;
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
  public resolveAndRegisterFile(
    filename: string,
    pathType: GOPathTypeValue,
    options?: GOFileCopyFileOptions,
  ): string {
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
