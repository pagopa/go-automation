/**
 * Options for GOFileCopier configuration
 * Supports flexible destination paths based on file type
 */

import type { GOPathTypeValue } from '../utils/GOPaths.js';

/**
 * Options for registering or copying a single file
 */
export interface GOFileCopyFileOptions {
  /**
   * Subdirectory within the execution directory where the file should be copied.
   * - string: Custom subdirectory name (e.g., 'custom-folder')
   * - null: Copy to root of execution directory (no subdirectory)
   * - undefined: Use default based on pathType
   */
  readonly subdir?: string | null | undefined;
}

/**
 * Default subdirectory mappings for each path type
 */
export interface GOFileCopierSubdirDefaults {
  /** Default subdirectory for INPUT files (default: 'inputs') */
  readonly input: string | null;

  /** Default subdirectory for CONFIG files (default: 'configs') */
  readonly config: string | null;

  /** Default subdirectory for OUTPUT files (default: null - root) */
  readonly output: string | null;
}

/**
 * Configuration options for GOFileCopier
 */
export interface GOFileCopierOptions {
  /**
   * Base directory for all copy operations (execution output directory)
   * This is typically: data/{script-name}/outputs/{script-name}_{timestamp}/
   */
  readonly executionDir: string;

  /**
   * Default subdirectory mappings per path type.
   * If not provided, uses built-in defaults:
   * - INPUT -> 'inputs'
   * - CONFIG -> 'configs'
   * - OUTPUT -> null (root)
   */
  readonly subdirDefaults?: Partial<GOFileCopierSubdirDefaults> | undefined;

  /**
   * Enable interactive mode for large files.
   * When true, prompts user before copying files exceeding promptThreshold.
   * Default: true
   */
  readonly interactive?: boolean | undefined;

  /**
   * File size threshold (in bytes) above which user is prompted in interactive mode.
   * Default: 10 MB (10 * 1024 * 1024)
   */
  readonly promptThreshold?: number | undefined;

  /**
   * Maximum file size (in bytes) allowed for copying.
   * Files exceeding this size are always skipped.
   * Default: 100 MB (100 * 1024 * 1024)
   */
  readonly maxFileSize?: number | undefined;

  /**
   * Whether to generate a manifest file listing all copied files.
   * Default: true
   */
  readonly generateManifest?: boolean | undefined;

  /**
   * Name of the manifest file.
   * Default: 'files-manifest.json'
   */
  readonly manifestFileName?: string | undefined;

  /**
   * Whether to overwrite existing files at destination.
   * Default: false (skip if exists)
   */
  readonly overwrite?: boolean | undefined;

  /**
   * Whether to preserve file timestamps when copying.
   * Default: true
   */
  readonly preserveTimestamps?: boolean | undefined;

  /**
   * Callback for custom logging during copy operations.
   * If not provided, operations are silent.
   */
  readonly onLog?: ((message: string, level: 'info' | 'warn' | 'error') => void) | undefined;

  /**
   * Callback for prompting user (used in interactive mode).
   * Should return true to proceed with copy, false to skip.
   */
  readonly onPrompt?: ((message: string, filePath: string, sizeHuman: string) => Promise<boolean>) | undefined;
}

/**
 * Default configuration values
 */
export const GO_FILE_COPIER_DEFAULTS = {
  /** 10 MB prompt threshold */
  PROMPT_THRESHOLD: 10 * 1024 * 1024,

  /** 100 MB maximum file size */
  MAX_FILE_SIZE: 100 * 1024 * 1024,

  /** Default manifest file name */
  MANIFEST_FILE_NAME: 'files-manifest.json',

  /** Default subdirectory mappings */
  SUBDIR_DEFAULTS: {
    input: 'inputs',
    config: 'configs',
    output: null,
  } as GOFileCopierSubdirDefaults,
} as const;

/**
 * Get the default subdirectory for a given path type
 *
 * @param pathType - The path type value
 * @param customDefaults - Optional custom defaults to override built-in ones
 * @returns The subdirectory name or null for root
 */
export function getDefaultSubdirForPathType(
  pathType: GOPathTypeValue,
  customDefaults?: Partial<GOFileCopierSubdirDefaults>,
): string | null {
  const defaults = {
    ...GO_FILE_COPIER_DEFAULTS.SUBDIR_DEFAULTS,
    ...customDefaults,
  };

  switch (pathType) {
    case 'input':
      return defaults.input;
    case 'config':
      return defaults.config;
    case 'output':
      return defaults.output;
    default:
      return null;
  }
}
