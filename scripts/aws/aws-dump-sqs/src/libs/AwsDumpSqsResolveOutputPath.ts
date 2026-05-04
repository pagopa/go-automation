/**
 * AWS Dump SQS - Resolve Output Path Library
 */

import { Core } from '@go-automation/go-common';
import type { AwsDumpSqsConfig } from '../types/index.js';

/**
 * Resolves the output file path, generating a timestamped filename if not provided.
 *
 * @param config - Dump configuration
 * @param script - Script context containing path utilities
 * @returns Resolved path information for the output file
 */

export function resolveOutputPath(config: AwsDumpSqsConfig, script: Core.GOScript): Core.GOPathResolutionResult {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const defaultOutputFile = `dump_${config.queueName}_${timestamp}.ndjson`;
  const outputFile = config.outputFile ?? defaultOutputFile;

  return script.paths.resolvePathWithInfo(outputFile, Core.GOPathType.OUTPUT);
}
