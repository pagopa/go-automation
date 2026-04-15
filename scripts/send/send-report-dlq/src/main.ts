/**
 * Send Report DLQ - Main Logic Module
 *
 * Queries Dead Letter Queues across one or more AWS profiles and generates
 * a report showing message counts and age (from CloudWatch) for each DLQ
 * that contains messages. Exports results to JSON, JSONL, CSV, HTML, or TXT.
 */

import { AWS, Core } from '@go-automation/go-common';

import { displayProfileResults, displaySummary } from './libs/DLQReportDisplay.js';
import { exportReport } from './libs/DLQReportExporter.js';
import type { SendReportDlqConfig } from './types/index.js';

// ============================================================================
// Main
// ============================================================================

/**
 * Main script execution function.
 *
 * Iterates over all configured AWS profiles in parallel, fetches DLQ statistics
 * for each account, displays a consolidated report, and exports results to a file.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendReportDlqConfig>();

  const outputFormat = config.outputFormat;

  // Resolve output path — default to script name + today's ISO date
  const today = new Date().toISOString().slice(0, 10);
  const extension = Core.GO_EXPORT_FORMAT_EXTENSIONS[outputFormat];
  const outputFile = config.outputFile ?? `send-report-dlq_${today}.${extension}`;
  const outputPathInfo = script.paths.resolvePathWithInfo(outputFile, Core.GOPathType.OUTPUT);

  script.logger.section('DLQ Report');
  script.logger.info(`Profiles: ${config.awsProfiles.join(', ')}`);

  if (outputPathInfo.isAbsolute) {
    script.logger.info(`Output file (absolute): ${outputPathInfo.path}`);
  } else {
    script.logger.info(`Output directory: ${outputPathInfo.resolvedDir}`);
    script.logger.info(`Output file: ${outputPathInfo.path}`);
  }
  script.logger.info(`Output format: ${outputFormat}`);

  script.logger.newline();

  const multiProvider = new AWS.AWSMultiClientProvider({ profiles: config.awsProfiles });

  try {
    script.prompt.spin('fetch', 'Fetching DLQ data from all profiles...');

    const { results, errors } = await multiProvider.mapParallelSettled(async (_profile, clientProvider) => {
      const sqsService = new AWS.AWSSQSService(clientProvider.sqs, clientProvider.cloudWatch);
      return sqsService.listDLQsWithStats();
    });

    script.prompt.spinSucceed('fetch', `Data fetched from ${results.size} profile${results.size > 1 ? 's' : ''}`);
    script.logger.newline();

    // Display per-profile results
    for (const [profile, dlqStats] of results) {
      displayProfileResults(script, profile, dlqStats);
      script.logger.newline();
    }

    // Report failed profiles
    for (const [profile, error] of errors) {
      script.logger.section(`Profile: ${profile}`);
      script.logger.error(`Failed: ${error.message}`);
      if (error.cause !== undefined) {
        const causeMsg = error.cause instanceof Error ? error.cause.message : Core.valueToString(error.cause);
        script.logger.error(`Caused by: ${causeMsg}`);
      }
      script.logger.newline();
    }

    if (results.size === 0) {
      throw new Error('All profiles failed. Check AWS credentials and profile names.');
    }

    // Summary table (only when querying multiple profiles)
    if (results.size > 1) {
      displaySummary(script, results);
      script.logger.newline();
    }

    // Export report to file
    script.logger.section('Exporting Report');
    await exportReport(script, results, outputPathInfo.path, outputFormat);

    script.logger.success('Report completed');
  } finally {
    multiProvider.close();
    script.prompt.stopSpinner();
  }
}
