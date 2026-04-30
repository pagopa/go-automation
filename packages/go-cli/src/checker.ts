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

    // 2. Check for AWS SSO Profile (if script appears to use AWS)
    const usesAWS =
      script.metadata.name.toLowerCase().includes('aws') ||
      (script.metadata.description?.toLowerCase().includes('aws') ?? false) ||
      (script.parameters?.some((p) => p.name.includes('aws') || p.name.includes('profile')) ?? false);

    if (usesAWS) {
      const hasProfile = this.checkAWSProfile();
      if (!hasProfile) {
        this.logger.warning('AWS_PROFILE not found in environment.');
        this.logger.text(
          'The script might fail if it requires an AWS SSO profile and none is provided via --aws-profile flag.',
        );
      }
    }

    return true;
  }

  /**
   * Quick check for AWS profile configuration
   */
  private checkAWSProfile(): boolean {
    // We only use SSO profiles, no Access/Secret Keys
    return !!process.env['AWS_PROFILE'];
  }
}
