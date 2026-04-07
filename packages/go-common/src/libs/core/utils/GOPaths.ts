/**
 * Utility class for managing file paths and names
 * Provides centralized path configuration for data, inputs, outputs, configs, and logs
 *
 * Directory structure:
 * go-automation/
 *   data/
 *     {script-name}/
 *       configs/             - Configuration files (centralized, priority 1)
 *         config.yaml
 *         config.json
 *         .env
 *       inputs/              - Input files (CSV, JSON, etc.)
 *       outputs/             - Output files organized by execution
 *         {script-name}_{timestamp}/
 *           execution.log    - Execution log
 *           *.csv, *.json    - Export files
 *   scripts/
 *     {category}/
 *       {script-name}/
 *         configs/           - Configuration files (local fallback, priority 2)
 */

import fs from 'fs';
import path from 'path';

import { DateTime } from 'luxon';

import { GODeploymentMode, GOExecutionEnvironment } from '../environment/index.js';
import type { GOExecutionEnvironmentInfo } from '../environment/index.js';
import { GOPathEnvironmentVariables } from './GOPathEnvironmentVariables.js';

/**
 * Path type constants for resolution
 */
export const GOPathType = {
  INPUT: 'input',
  OUTPUT: 'output',
  CONFIG: 'config',
} as const;

/**
 * Type of path resolution
 */
export type GOPathTypeValue = (typeof GOPathType)[keyof typeof GOPathType];

/**
 * Result of file path resolution.
 *
 * Contains the resolved absolute path, whether the original input was absolute,
 * and the directory where the file was resolved to.
 *
 * - For absolute inputs: resolvedDir is the parent directory of the path
 * - For relative inputs: resolvedDir is the standard directory for the path type
 *   (e.g. data/{script}/inputs/ for INPUT, data/{script}/outputs/{timestamp}/ for OUTPUT)
 */
export interface GOPathResolutionResult {
  /** Resolved absolute path */
  readonly path: string;

  /** Whether the original input path was already absolute */
  readonly isAbsolute: boolean;

  /**
   * Directory where the file was resolved to.
   * - Absolute paths: parent directory (path.dirname)
   * - Relative paths: standard directory for the given path type
   */
  readonly resolvedDir: string;
}

/**
 * Result of config file path resolution with priority-based lookup
 */
export interface GOConfigPathResult {
  /** Resolved absolute path to the config file */
  readonly path: string;
  /** Where the config was found: 'centralized' (data/{script}/configs/), 'local' (configs/), or 'none' (not found) */
  readonly source: 'centralized' | 'local' | 'none';
  /** Directory where the file was resolved */
  readonly directory: string;
}

/**
 * Options for GOPaths configuration
 */
export interface GOPathsOptions {
  /** Script name (defaults to argv[1] basename) */
  readonly scriptName?: string;
  /** Override base directory (overrides GO_BASE_DIR env var) */
  readonly baseDir?: string;
}

export class GOPaths {
  private readonly scriptName: string;
  private readonly startTime: Date;
  private readonly environmentInfo: GOExecutionEnvironmentInfo;
  private readonly baseDir: string;
  private readonly options: GOPathsOptions;

  constructor(scriptNameOrOptions?: string | GOPathsOptions) {
    // Parse options
    if (typeof scriptNameOrOptions === 'string') {
      this.options = { scriptName: scriptNameOrOptions };
    } else {
      this.options = scriptNameOrOptions ?? {};
    }

    const argv1 = process.argv[1] ?? 'unknown-script';
    this.scriptName = this.options.scriptName ?? path.basename(argv1, path.extname(argv1));
    this.startTime = new Date();
    this.environmentInfo = GOExecutionEnvironment.detect();
    this.baseDir = this.resolveBaseDir();
  }

  /**
   * Get project root directory (go-automation/)
   *
   * @throws Error if in standalone mode - use getDataDir() or getBaseDir() instead
   * @returns Monorepo root path
   */
  public getProjectRoot(): string {
    if (this.isStandalone()) {
      throw new Error(
        'getProjectRoot() is not available in standalone mode. Use getDataDir() or getBaseDir() instead.',
      );
    }

    const monorepoRoot = this.environmentInfo.monorepoRoot;
    if (!monorepoRoot) {
      throw new Error(
        'Could not find project root (go-automation). ' +
          'Make sure you are running from within the project or set GO_DEPLOYMENT_MODE=standalone.',
      );
    }

    return monorepoRoot;
  }

  /**
   * Get data directory for this script
   *
   * Resolution priority:
   * 1. GO_DATA_DIR environment variable (if set)
   * 2. Monorepo: {monorepoRoot}/data/{script-name}/
   * 3. Standalone: {baseDir}/data/
   */
  public getDataDir(): string {
    // Priority 1: Environment override
    const envDataDir = process.env[GOPathEnvironmentVariables.DATA_DIR];
    if (envDataDir) {
      return envDataDir;
    }

    // Priority 2: Deployment mode based
    if (this.isMonorepo()) {
      return path.join(this.getProjectRoot(), 'data', this.scriptName);
    }

    // Standalone mode
    return path.join(this.baseDir, 'data');
  }

  /**
   * Get inputs directory for this script
   *
   * Resolution priority:
   * 1. GO_INPUT_DIR environment variable (if set)
   * 2. {dataDir}/inputs/
   */
  public getInputsDir(): string {
    // Priority 1: Environment override
    const envInputDir = process.env[GOPathEnvironmentVariables.INPUT_DIR];
    if (envInputDir) {
      return envInputDir;
    }

    return path.join(this.getDataDir(), 'inputs');
  }

  /**
   * Get base outputs directory for this script
   *
   * Resolution priority:
   * 1. GO_OUTPUT_DIR environment variable (if set)
   * 2. {dataDir}/outputs/
   */
  public getOutputsBaseDir(): string {
    // Priority 1: Environment override
    const envOutputDir = process.env[GOPathEnvironmentVariables.OUTPUT_DIR];
    if (envOutputDir) {
      return envOutputDir;
    }

    return path.join(this.getDataDir(), 'outputs');
  }

  /**
   * Get centralized config directory for this script
   *
   * Resolution priority:
   * 1. GO_CONFIG_DIR environment variable (if set)
   * 2. Monorepo: {dataDir}/configs/
   * 3. Standalone: {baseDir}/configs/
   */
  public getDataConfigDir(): string {
    // Priority 1: Environment override
    const envConfigDir = process.env[GOPathEnvironmentVariables.CONFIG_DIR];
    if (envConfigDir) {
      return envConfigDir;
    }

    // Priority 2: Monorepo mode
    if (this.isMonorepo()) {
      return path.join(this.getDataDir(), 'configs');
    }

    // Standalone mode: configs in base directory
    return path.join(this.baseDir, 'configs');
  }

  /**
   * Get local configs directory (script-local, fallback)
   * Returns: {script-dir}/configs/
   */
  public getLocalConfigsDir(): string {
    return path.join(process.cwd(), 'configs');
  }

  /**
   * @deprecated Use getLocalConfigsDir() instead. This method is kept for backward compatibility.
   * Get configs directory (local to script)
   * Returns: {script-dir}/configs/
   */
  public getConfigsDir(): string {
    return this.getLocalConfigsDir();
  }

  /**
   * Format timestamp for directory/file names using local timezone
   * Format: 2024-12-24T15-30-45 (local time, not UTC)
   */
  private formatTimestamp(): string {
    return DateTime.fromJSDate(this.startTime).toFormat("yyyy-MM-dd'T'HH-mm-ss");
  }

  /**
   * Get execution-specific output directory
   * Returns: go-automation/data/{script-name}/outputs/{script-name}_{timestamp}/
   * Example: send-import-notifications_2024-12-24T15-30-45
   */
  public getExecutionOutputDir(): string {
    return path.join(this.getOutputsBaseDir(), `${this.scriptName}_${this.formatTimestamp()}`);
  }

  /**
   * Create execution output directory if it doesn't exist
   * Also creates parent directories (data/{script-name}/outputs/)
   * @returns The created directory path
   */
  public createExecutionOutputDir(): string {
    const dir = this.getExecutionOutputDir();

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return dir;
  }

  /**
   * Ensure all required directories exist
   * Creates: data/{script-name}/inputs/, data/{script-name}/outputs/, and data/{script-name}/configs/
   */
  public ensureDirectoriesExist(): void {
    const dirs = [this.getInputsDir(), this.getOutputsBaseDir(), this.getDataConfigDir()];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Get full path for an input file
   * @param fileName - Name of the input file
   * @returns go-automation/data/{script-name}/inputs/{fileName}
   */
  public getInputFilePath(fileName: string): string {
    return path.join(this.getInputsDir(), fileName);
  }

  /**
   * Get full path for an output file in the current execution directory
   * @param fileName - Name of the output file
   * @returns go-automation/data/{script-name}/outputs/{script-name}_{timestamp}/{fileName}
   */
  public getExecutionOutputFilePath(fileName: string): string {
    return path.join(this.getExecutionOutputDir(), fileName);
  }

  /**
   * Get log file path in execution output directory
   * @returns go-automation/data/{script-name}/outputs/{script-name}_{timestamp}/execution.log
   */
  public getExecutionLogFilePath(): string {
    return this.getExecutionOutputFilePath('execution.log');
  }

  /**
   * Get config file path with priority-based lookup
   * Priority:
   *   1. data/{script-name}/configs/{fileName} (centralized)
   *   2. {script-dir}/configs/{fileName} (local fallback)
   *
   * @param fileName - Name of the config file
   * @returns Path to config file (centralized if exists, otherwise local)
   */
  public getConfigFilePath(fileName: string): string {
    // Priority 1: Centralized data directory
    const centralizedPath = path.join(this.getDataConfigDir(), fileName);
    if (fs.existsSync(centralizedPath)) {
      return centralizedPath;
    }

    // Priority 2: Local configs directory (fallback)
    return path.join(this.getLocalConfigsDir(), fileName);
  }

  /**
   * Get config file path with detailed resolution info
   * Useful for logging which location the config was loaded from
   *
   * @param fileName - Name of the config file
   * @returns Resolution result with path and source location
   */
  public getConfigFilePathWithInfo(fileName: string): GOConfigPathResult {
    // Priority 1: Centralized data directory
    const centralizedPath = path.join(this.getDataConfigDir(), fileName);
    if (fs.existsSync(centralizedPath)) {
      return {
        path: centralizedPath,
        source: 'centralized',
        directory: this.getDataConfigDir(),
      };
    }

    // Priority 2: Local configs directory (fallback)
    const localPath = path.join(this.getLocalConfigsDir(), fileName);
    return {
      path: localPath,
      source: fs.existsSync(localPath) ? 'local' : 'none',
      directory: this.getLocalConfigsDir(),
    };
  }

  /**
   * Get output file name with timestamp
   * @param baseName - Base name without extension
   * @param extension - File extension (without dot)
   * @returns {baseName}_{timestamp}.{extension}
   */
  public getOutputFileName(baseName: string, extension: string): string {
    return `${baseName}_${this.formatTimestamp()}.${extension}`;
  }

  /**
   * Get script name
   */
  public getScriptName(): string {
    return this.scriptName;
  }

  /**
   * Get start time
   */
  public getStartTime(): Date {
    return this.startTime;
  }

  /**
   * Get current deployment mode
   */
  public getDeploymentMode(): GODeploymentMode {
    return this.environmentInfo.deploymentMode;
  }

  /**
   * Check if running in monorepo mode
   */
  public isMonorepo(): boolean {
    return this.environmentInfo.deploymentMode === GODeploymentMode.MONOREPO;
  }

  /**
   * Check if running in standalone mode
   */
  public isStandalone(): boolean {
    return this.environmentInfo.deploymentMode === GODeploymentMode.STANDALONE;
  }

  /**
   * Get base directory
   *
   * In monorepo mode: monorepo root
   * In standalone mode: configured base or cwd
   */
  public getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Get a human-readable summary of path configuration
   */
  public getSummary(): string {
    const lines: string[] = [
      `Script Name: ${this.scriptName}`,
      `Deployment Mode: ${this.environmentInfo.deploymentMode}`,
      `Base Dir: ${this.baseDir}`,
      `Data Dir: ${this.getDataDir()}`,
      `Config Dir: ${this.getDataConfigDir()}`,
      `Input Dir: ${this.getInputsDir()}`,
      `Output Dir: ${this.getOutputsBaseDir()}`,
    ];

    if (this.isMonorepo() && this.environmentInfo.monorepoRoot) {
      lines.push(`Monorepo Root: ${this.environmentInfo.monorepoRoot}`);
    }

    return lines.join('\n');
  }

  /**
   * Resolve base directory based on configuration hierarchy
   *
   * Priority:
   * 1. Constructor option (baseDir)
   * 2. GO_BASE_DIR environment variable
   * 3. Monorepo root (if monorepo mode)
   * 4. /tmp in AWS-managed environments (Lambda, ECS, etc. where cwd is read-only)
   * 5. Current working directory
   */
  private resolveBaseDir(): string {
    // Priority 1: Constructor option
    if (this.options.baseDir) {
      return this.options.baseDir;
    }

    // Priority 2: Environment variable
    const envBaseDir = process.env[GOPathEnvironmentVariables.BASE_DIR];
    if (envBaseDir) {
      return envBaseDir;
    }

    // Priority 3: Monorepo root (if monorepo mode)
    if (this.environmentInfo.deploymentMode === GODeploymentMode.MONOREPO && this.environmentInfo.monorepoRoot) {
      return this.environmentInfo.monorepoRoot;
    }

    // Priority 4: AWS-managed environments have read-only filesystems except /tmp
    if (this.environmentInfo.isAWSManaged) {
      return '/tmp';
    }

    // Priority 5: Current working directory
    return process.cwd();
  }

  /**
   * Resolve file path with smart detection.
   *
   * Resolution strategy:
   * - Absolute path → use as-is
   * - Relative path + type=GOPathType.INPUT → data/{script}/inputs/{filename}
   * - Relative path + type=GOPathType.OUTPUT → data/{script}/outputs/{script}_{timestamp}/{filename}
   * - null/undefined → return undefined
   *
   * For GOPathType.OUTPUT with relative paths, creates execution directory automatically.
   *
   * @param filePath - File path (absolute, relative, or null/undefined)
   * @param pathType - Type of path resolution (GOPathType.INPUT or GOPathType.OUTPUT)
   * @returns Resolved absolute path, or undefined if input is null/undefined
   *
   * @example
   * ```typescript
   * const inputPath = script.paths.resolvePath(config.csvFile, Core.GOPathType.INPUT);
   * const outputPath = script.paths.resolvePath(config.exportFile, Core.GOPathType.OUTPUT);
   * ```
   */
  public resolvePath(filePath: string, pathType: GOPathTypeValue): string;
  public resolvePath(filePath: string | null | undefined, pathType: GOPathTypeValue): string | undefined;
  public resolvePath(filePath: string | null | undefined, pathType: GOPathTypeValue): string | undefined {
    const result = this.resolvePathWithInfo(filePath, pathType);
    return result?.path;
  }

  /**
   * Resolve file path with detailed metadata for logging.
   *
   * Returns structured information including:
   * - Resolved absolute path
   * - Whether original path was absolute
   * - Directory where file was resolved (always available)
   *
   * @param filePath - File path (absolute, relative, or null/undefined)
   * @param pathType - Type of path resolution (GOPathType.INPUT, GOPathType.OUTPUT, or GOPathType.CONFIG)
   * @returns Resolution result with metadata, or undefined if input is null/undefined
   *
   * @example
   * ```typescript
   * const result = script.paths.resolvePathWithInfo(config.exportFile, Core.GOPathType.OUTPUT);
   * if (result) {
   *   script.logger.info(`Resolved directory: ${result.resolvedDir}`);
   *   script.logger.info(`File path: ${result.path}`);
   *   script.logger.info(`Was absolute: ${result.isAbsolute}`);
   * }
   * ```
   */
  public resolvePathWithInfo(filePath: string, pathType: GOPathTypeValue): GOPathResolutionResult;
  public resolvePathWithInfo(
    filePath: string | null | undefined,
    pathType: GOPathTypeValue,
  ): GOPathResolutionResult | undefined;
  public resolvePathWithInfo(
    filePath: string | null | undefined,
    pathType: GOPathTypeValue,
  ): GOPathResolutionResult | undefined {
    if (filePath === null || filePath === undefined) {
      return undefined;
    }

    if (path.isAbsolute(filePath)) {
      return {
        path: filePath,
        isAbsolute: true,
        resolvedDir: path.dirname(filePath),
      };
    }

    // Relative path: resolve based on type
    if (pathType === GOPathType.INPUT) {
      return {
        path: this.getInputFilePath(filePath),
        isAbsolute: false,
        resolvedDir: this.getInputsDir(),
      };
    }

    if (pathType === GOPathType.CONFIG) {
      const configInfo = this.getConfigFilePathWithInfo(filePath);
      return {
        path: configInfo.path,
        isAbsolute: false,
        resolvedDir: configInfo.directory,
      };
    }

    // Output: create execution directory and resolve
    const outputDir = this.createExecutionOutputDir();
    return {
      path: this.getExecutionOutputFilePath(filePath),
      isAbsolute: false,
      resolvedDir: outputDir,
    };
  }
}
