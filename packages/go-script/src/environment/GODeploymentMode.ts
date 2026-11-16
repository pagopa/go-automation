/**
 * GODeploymentMode
 *
 * Represents the deployment mode of the script execution.
 * Used to determine path resolution strategy and available features.
 */

/**
 * Deployment mode for script execution
 */
export enum GODeploymentMode {
  /** Running within monorepo structure (pnpm workspace) */
  MONOREPO = 'monorepo',
  /** Running as standalone deployment (Docker, Lambda, EC2, etc.) */
  STANDALONE = 'standalone',
}
