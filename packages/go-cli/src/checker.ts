import fs from 'node:fs/promises';
import { Core } from '@go-automation/go-common';
import type { DiscoveredScript } from './discovery.js';
import type { ExecutionMode } from './runner.js';

/**
 * Pre-flight Checker - Performs sanity checks before script execution
 */
export class PreFlightChecker {
  private readonly logger: Core.GOLogger;

  constructor(logger: Core.GOLogger) {
    this.logger = logger;
  }

  /**
   * Performs all readiness checks for a script
   */
  public async verify(script: DiscoveredScript, mode: ExecutionMode): Promise<boolean> {
    this.logger.info(`Performing pre-flight checks for ${script.id}...`);

    // 1. Check Entry Point
    const entryPoint = mode === 'source' ? script.paths.entryTs : script.paths.entryJs;
    try {
      await fs.access(entryPoint);
    } catch (_error) {
      if (mode === 'dist') {
        this.logger.error(`Compiled artifact not found: ${entryPoint}`);
        this.logger.text(`Run "pnpm build" or "pnpm --filter ${script.id} build" first.`);
      } else {
        this.logger.error(`Source entry point not found: ${entryPoint}`);
      }
      return false;
    }

    // 2. Check for AWS Session (if script appears to use AWS)
    // We check if the script parameters or metadata suggest AWS usage
    const usesAWS =
      script.metadata.name.toLowerCase().includes('aws') ||
      (script.metadata.description?.toLowerCase().includes('aws') ?? false) ||
      (script.parameters?.some((p) => p.name.includes('aws') || p.name.includes('profile')) ?? false);

    if (usesAWS) {
      const hasSession = this.checkAWSSession();
      if (!hasSession) {
        this.logger.warning('AWS session might be expired or not configured.');
        this.logger.text('The script will attempt to log you in, but you might want to run "aws sso login" first.');
      }
    }

    return true;
  }

  /**
   * Quick check for AWS session validity
   */
  private checkAWSSession(): boolean {
    // We don't want to block if AWS CLI is not installed, so we just try a quick check
    try {
      // Just check if we have some AWS env vars or a default profile
      return !!(process.env['AWS_PROFILE'] ?? process.env['AWS_ACCESS_KEY_ID']);
    } catch (_error) {
      return false;
    }
  }
}
