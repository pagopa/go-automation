/**
 * GOFileCopier - Generic file copier for execution directory archival
 *
 * Copies source files (inputs, configs, or any other files) to the execution
 * output directory for reproducibility and traceability.
 *
 * Features:
 * - Configurable destination subdirectories per file type
 * - Interactive mode for large files with user prompts
 * - Size thresholds for automatic skip of very large files
 * - Manifest generation for tracking copied files
 * - Supports both immediate copy and deferred batch operations
 *
 * @example
 * ```typescript
 * const copier = new GOFileCopier({
 *   executionDir: script.paths.getExecutionOutputDir(),
 *   interactive: true,
 *   onLog: (msg, level) => script.logger[level](msg),
 *   onPrompt: async (msg) => script.prompt.confirm(msg),
 * });
 *
 * // Register files for later batch copy
 * copier.registerFile('/path/to/input.csv', { subdir: 'inputs' });
 * copier.registerFile('/path/to/config.yaml', { subdir: 'configs' });
 *
 * // Copy all registered files at once
 * const report = await copier.finalizeRegisteredFiles();
 * ```
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

import { getErrorMessage } from '../errors/GOErrorUtils.js';
import type { GOFileCopyResult, GOFileCopySkipReason } from './GOFileCopyResult.js';
import type { GOFileCopyReport, GOFileCopyReportSummary } from './GOFileCopyReport.js';
import type { GOFileCopierOptions, GOFileCopyFileOptions, GOFileCopierSubdirDefaults } from './GOFileCopierOptions.js';
import { GO_FILE_COPIER_DEFAULTS } from './GOFileCopierOptions.js';

/**
 * Internal representation of a registered file
 */
interface RegisteredFile {
  readonly sourcePath: string;
  readonly subdir: string | null;
}

/**
 * Manifest entry structure
 */
interface ManifestEntry {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly sizeBytes: number;
  readonly sizeHuman: string;
  readonly copiedAt: string;
  readonly subdir: string | null;
}

/**
 * Manifest file structure
 */
interface ManifestFile {
  readonly generatedAt: string;
  readonly executionDir: string;
  readonly totalFiles: number;
  readonly totalBytesCopied: number;
  readonly files: ReadonlyArray<ManifestEntry>;
}

/**
 * Internal options type with resolved defaults
 */
interface GOFileCopierResolvedOptions {
  readonly executionDir: string;
  readonly interactive: boolean;
  readonly promptThreshold: number;
  readonly maxFileSize: number;
  readonly generateManifest: boolean;
  readonly manifestFileName: string;
  readonly overwrite: boolean;
  readonly preserveTimestamps: boolean;
  readonly onLog?: ((message: string, level: 'info' | 'warn' | 'error') => void) | undefined;
  readonly onPrompt?: ((message: string, filePath: string, sizeHuman: string) => Promise<boolean>) | undefined;
  readonly subdirDefaults?: Partial<GOFileCopierSubdirDefaults> | undefined;
}

export class GOFileCopier {
  private readonly options: GOFileCopierResolvedOptions;

  private readonly registeredFiles: Map<string, RegisteredFile> = new Map();
  private readonly copyResults: GOFileCopyResult[] = [];

  constructor(options: GOFileCopierOptions) {
    this.options = {
      executionDir: options.executionDir,
      interactive: options.interactive ?? true,
      promptThreshold: options.promptThreshold ?? GO_FILE_COPIER_DEFAULTS.PROMPT_THRESHOLD,
      maxFileSize: options.maxFileSize ?? GO_FILE_COPIER_DEFAULTS.MAX_FILE_SIZE,
      generateManifest: options.generateManifest ?? true,
      manifestFileName: options.manifestFileName ?? GO_FILE_COPIER_DEFAULTS.MANIFEST_FILE_NAME,
      overwrite: options.overwrite ?? false,
      preserveTimestamps: options.preserveTimestamps ?? true,
      onLog: options.onLog,
      onPrompt: options.onPrompt,
      subdirDefaults: options.subdirDefaults,
    };
  }

  /**
   * Register a file for later batch copy operation.
   * Files are not copied immediately; use finalizeRegisteredFiles() to copy all at once.
   *
   * @param sourcePath - Absolute path to the source file
   * @param options - Copy options including subdirectory
   *
   * @example
   * ```typescript
   * // Register with custom subdirectory
   * copier.registerFile('/data/input.csv', { subdir: 'inputs' });
   *
   * // Register to root of execution directory
   * copier.registerFile('/data/summary.txt', { subdir: null });
   *
   * // Register with default subdirectory (based on path type if known)
   * copier.registerFile('/config/settings.yaml', { subdir: 'configs' });
   * ```
   */
  public registerFile(sourcePath: string, options?: GOFileCopyFileOptions): void {
    const absolutePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(process.cwd(), sourcePath);

    const subdir = options?.subdir === undefined ? null : options.subdir;

    this.registeredFiles.set(absolutePath, {
      sourcePath: absolutePath,
      subdir,
    });

    this.log(`Registered file for copy: ${absolutePath}`, 'info');
  }

  /**
   * Check if a file is registered for copying.
   *
   * @param sourcePath - Path to check
   * @returns True if the file is registered
   */
  public isRegistered(sourcePath: string): boolean {
    const absolutePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(process.cwd(), sourcePath);

    return this.registeredFiles.has(absolutePath);
  }

  /**
   * Unregister a previously registered file.
   *
   * @param sourcePath - Path to unregister
   * @returns True if the file was unregistered, false if it wasn't registered
   */
  public unregisterFile(sourcePath: string): boolean {
    const absolutePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(process.cwd(), sourcePath);

    return this.registeredFiles.delete(absolutePath);
  }

  /**
   * Get all registered file paths.
   *
   * @returns Array of registered source paths
   */
  public getRegisteredFiles(): ReadonlyArray<string> {
    return Array.from(this.registeredFiles.keys());
  }

  /**
   * Clear all registered files.
   */
  public clearRegisteredFiles(): void {
    this.registeredFiles.clear();
    this.log('Cleared all registered files', 'info');
  }

  /**
   * Copy a single file immediately (not using registration).
   *
   * @param sourcePath - Absolute path to the source file
   * @param options - Copy options including subdirectory
   * @returns Copy result with details
   *
   * @example
   * ```typescript
   * const result = await copier.copyFile('/data/input.csv', { subdir: 'inputs' });
   * if (result.success && result.copied) {
   *   console.log(`Copied to: ${result.destinationPath}`);
   * }
   * ```
   */
  public async copyFile(sourcePath: string, options?: GOFileCopyFileOptions): Promise<GOFileCopyResult> {
    const absolutePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(process.cwd(), sourcePath);

    const subdir = options?.subdir === undefined ? null : options.subdir;
    const destinationPath = this.getDestinationPath(absolutePath, subdir);

    // Check if source exists
    if (!fsSync.existsSync(absolutePath)) {
      return this.createResult(absolutePath, destinationPath, {
        success: false,
        copied: false,
        skipReason: 'source_not_found',
        sizeBytes: 0,
        error: `Source file not found: ${absolutePath}`,
      });
    }

    // Get file stats
    const stats = await fs.stat(absolutePath);
    const sizeBytes = stats.size;
    const sizeHuman = this.formatFileSize(sizeBytes);

    // Check max file size
    if (sizeBytes > this.options.maxFileSize) {
      this.log(
        `Skipping file (exceeds max size ${this.formatFileSize(this.options.maxFileSize)}): ${absolutePath}`,
        'warn',
      );
      return this.createResult(absolutePath, destinationPath, {
        success: true,
        copied: false,
        skipReason: 'size_exceeded',
        sizeBytes,
      });
    }

    // Check if destination exists
    if (fsSync.existsSync(destinationPath) && !this.options.overwrite) {
      this.log(`Skipping file (already exists): ${destinationPath}`, 'info');
      return this.createResult(absolutePath, destinationPath, {
        success: true,
        copied: false,
        skipReason: 'already_exists',
        sizeBytes,
      });
    }

    // Interactive prompt for large files
    if (this.options.interactive && sizeBytes > this.options.promptThreshold && this.options.onPrompt) {
      const shouldCopy = await this.options.onPrompt(
        `File ${path.basename(absolutePath)} is ${sizeHuman}. Copy to execution directory?`,
        absolutePath,
        sizeHuman,
      );

      if (!shouldCopy) {
        this.log(`User declined to copy: ${absolutePath}`, 'info');
        return this.createResult(absolutePath, destinationPath, {
          success: true,
          copied: false,
          skipReason: 'user_declined',
          sizeBytes,
        });
      }
    }

    // Perform the copy
    try {
      // Ensure destination directory exists
      const destDir = path.dirname(destinationPath);
      await fs.mkdir(destDir, { recursive: true });

      // Copy the file
      await fs.copyFile(absolutePath, destinationPath);

      // Preserve timestamps if enabled
      if (this.options.preserveTimestamps) {
        await fs.utimes(destinationPath, stats.atime, stats.mtime);
      }

      this.log(`Copied: ${absolutePath} -> ${destinationPath}`, 'info');

      return this.createResult(absolutePath, destinationPath, {
        success: true,
        copied: true,
        sizeBytes,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.log(`Failed to copy ${absolutePath}: ${errorMessage}`, 'error');

      return this.createResult(absolutePath, destinationPath, {
        success: false,
        copied: false,
        sizeBytes,
        error: errorMessage,
      });
    }
  }

  /**
   * Copy all registered files and generate a report.
   *
   * @returns Copy report with all results and summary
   *
   * @example
   * ```typescript
   * // Register files first
   * copier.registerFile('/data/input.csv', { subdir: 'inputs' });
   * copier.registerFile('/config/settings.yaml', { subdir: 'configs' });
   *
   * // Copy all at once
   * const report = await copier.finalizeRegisteredFiles();
   *
   * console.log(`Copied ${report.summary.copiedFiles} of ${report.summary.totalFiles} files`);
   * console.log(`Total size: ${report.summary.totalSizeCopiedHuman}`);
   * ```
   */
  public async finalizeRegisteredFiles(): Promise<GOFileCopyReport> {
    const results: GOFileCopyResult[] = [];

    for (const [sourcePath, registered] of this.registeredFiles) {
      const result = await this.copyFile(sourcePath, { subdir: registered.subdir });
      results.push(result);
    }

    // Store results
    this.copyResults.push(...results);

    // Calculate summary
    const summary = this.calculateSummary(results);

    // Generate manifest if enabled
    let manifestPath: string | undefined;
    if (this.options.generateManifest) {
      manifestPath = await this.generateManifest(results);
    }

    // Clear registered files after processing
    this.registeredFiles.clear();

    return {
      results,
      summary,
      manifestPath,
      timestamp: new Date(),
    };
  }

  /**
   * Get the destination path for a file based on its subdirectory setting.
   *
   * @param sourcePath - Source file path
   * @param subdir - Subdirectory (null for root)
   * @returns Full destination path
   */
  public getDestinationPath(sourcePath: string, subdir: string | null): string {
    const fileName = path.basename(sourcePath);

    if (subdir === null) {
      return path.join(this.options.executionDir, fileName);
    }

    return path.join(this.options.executionDir, subdir, fileName);
  }

  /**
   * Get all copy results from this session.
   *
   * @returns Array of all copy results
   */
  public getAllResults(): ReadonlyArray<GOFileCopyResult> {
    return [...this.copyResults];
  }

  /**
   * Format file size for human readability.
   *
   * @param bytes - File size in bytes
   * @returns Human-readable size string
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    const unit = units[unitIndex];
    return unit !== undefined ? `${size.toFixed(2)} ${unit}` : `${bytes} B`;
  }

  /**
   * Create a copy result object.
   */
  private createResult(
    sourcePath: string,
    destinationPath: string,
    data: {
      success: boolean;
      copied: boolean;
      sizeBytes: number;
      skipReason?: GOFileCopySkipReason;
      error?: string;
    },
  ): GOFileCopyResult {
    return {
      sourcePath,
      destinationPath,
      success: data.success,
      copied: data.copied,
      skipReason: data.skipReason,
      sizeBytes: data.sizeBytes,
      sizeHuman: this.formatFileSize(data.sizeBytes),
      error: data.error,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate summary statistics from results.
   */
  private calculateSummary(results: ReadonlyArray<GOFileCopyResult>): GOFileCopyReportSummary {
    let copiedFiles = 0;
    let skippedFiles = 0;
    let failedFiles = 0;
    let totalBytesCopied = 0;

    for (const result of results) {
      if (result.copied) {
        copiedFiles++;
        totalBytesCopied += result.sizeBytes;
      } else if (result.success) {
        skippedFiles++;
      } else {
        failedFiles++;
      }
    }

    return {
      totalFiles: results.length,
      copiedFiles,
      skippedFiles,
      failedFiles,
      totalBytesCopied,
      totalSizeCopiedHuman: this.formatFileSize(totalBytesCopied),
    };
  }

  /**
   * Generate manifest file with all copied files.
   */
  private async generateManifest(results: ReadonlyArray<GOFileCopyResult>): Promise<string> {
    const copiedResults = results.filter((r) => r.copied);

    const manifest: ManifestFile = {
      generatedAt: new Date().toISOString(),
      executionDir: this.options.executionDir,
      totalFiles: copiedResults.length,
      totalBytesCopied: copiedResults.reduce((sum, r) => sum + r.sizeBytes, 0),
      files: copiedResults.map((r) => {
        // Find the registered file to get subdir
        const registered = this.findRegisteredForResult(r);
        return {
          sourcePath: r.sourcePath,
          destinationPath: r.destinationPath,
          sizeBytes: r.sizeBytes,
          sizeHuman: r.sizeHuman,
          copiedAt: r.timestamp.toISOString(),
          subdir: registered?.subdir ?? null,
        };
      }),
    };

    const manifestPath = path.join(this.options.executionDir, this.options.manifestFileName);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    this.log(`Generated manifest: ${manifestPath}`, 'info');
    return manifestPath;
  }

  /**
   * Find the registered file entry for a result (before clearing).
   */
  private findRegisteredForResult(result: GOFileCopyResult): RegisteredFile | undefined {
    // At this point registeredFiles may still contain the entry
    return this.registeredFiles.get(result.sourcePath);
  }

  /**
   * Log a message using the configured callback.
   */
  private log(message: string, level: 'info' | 'warn' | 'error'): void {
    this.options.onLog?.(message, level);
  }
}
