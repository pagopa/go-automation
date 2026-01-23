/**
 * GOPathEnvironmentVariables
 *
 * Environment variable names for path configuration overrides.
 * Used by GOPaths to allow customization of directory locations.
 */

/**
 * Environment variables for path configuration
 */
export const GOPathEnvironmentVariables = {
  /** Base directory override for standalone mode */
  BASE_DIR: 'GO_BASE_DIR',
  /** Data directory override */
  DATA_DIR: 'GO_DATA_DIR',
  /** Config directory override */
  CONFIG_DIR: 'GO_CONFIG_DIR',
  /** Input directory override */
  INPUT_DIR: 'GO_INPUT_DIR',
  /** Output directory override */
  OUTPUT_DIR: 'GO_OUTPUT_DIR',
} as const;

/**
 * Type for environment variable keys
 */
export type GOPathEnvVarKey = keyof typeof GOPathEnvironmentVariables;

/**
 * Type for environment variable values
 */
export type GOPathEnvVarValue = typeof GOPathEnvironmentVariables[GOPathEnvVarKey];
