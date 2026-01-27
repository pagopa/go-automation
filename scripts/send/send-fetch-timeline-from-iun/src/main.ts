/**
 * Send Fetch Timeline From Iun - Main Logic Module
 *
 * Contains the core business logic for fetching notification timelines from DynamoDB.
 * Reads IUNs from a text file, queries DynamoDB with concurrent chunked requests,
 * and writes results to a JSON file.
 */

import { Core, SEND } from '@go-automation/go-common';

import type { SendFetchTimelineFromIunConfig } from './config.js';
import { readIunFile, writeResultsFile } from './libs/FileService.js';
import { parseIunLines } from './libs/IunParser.js';

/**
 * Main script execution function
 *
 * Fetches notification timelines from DynamoDB based on IUNs from input file.
 * Uses Promise.all with chunking (10 concurrent requests) for optimal performance.
 *
 * @param script - The GOScript instance for logging and prompts
 *
 * @example
 * ```typescript
 * await main(script);
 * ```
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendFetchTimelineFromIunConfig>();

  // Initialize Timeline service using script.aws provider
  const timelineService = new SEND.SENDTimelineService(script.aws.dynamoDB);

  // Step 1: Read IUNs from input file
  script.logger.section('Reading Input File');
  script.prompt.startSpinner(`Reading IUNs from ${config.sourceFile}...`);

  const sourceFilePath = script.paths.resolvePathWithInfo(config.sourceFile, Core.GOPathType.INPUT);
  const rawLines = await readIunFile(sourceFilePath.path);
  const parsedIuns = parseIunLines(rawLines);

  script.prompt.spinnerStop(`Found ${parsedIuns.length} unique IUNs`);

  // Guard: No IUNs to process
  if (parsedIuns.length === 0) {
    script.logger.warning('No IUNs found in input file');
    return;
  }

  // Step 2: Query timelines from DynamoDB
  script.logger.section('Fetching Timelines from DynamoDB');
  script.prompt.startSpinner(`Querying timelines for ${parsedIuns.length} IUNs...`);

  let lastProgressUpdate = 0;
  const results = await timelineService.queryTimelines(parsedIuns, (current, total) => {
    // Update progress every 100 items or at completion
    if (current - lastProgressUpdate >= 100 || current === total) {
      script.prompt.updateSpinner(`Processed ${current}/${total} IUNs...`);
      lastProgressUpdate = current;
    }
  });

  script.prompt.spinnerStop(`Retrieved ${results.length} timelines`);

  // Step 3: Write results to output file
  script.logger.section('Writing Results');
  script.prompt.startSpinner(`Writing results to ${config.destinationFile}...`);

  await writeResultsFile(config.destinationFile, results);

  script.prompt.spinnerStop(`Results written to ${config.destinationFile}`);

  // Display summary
  script.logger.section('Summary');
  const timelinesWithData = results.filter((r) => r.timeline.length > 0);
  const timelinesEmpty = results.filter((r) => r.timeline.length === 0);

  script.logger.info(`Total IUNs processed: ${results.length}`);
  script.logger.info(`Timelines with data: ${timelinesWithData.length}`);
  script.logger.info(`Empty timelines: ${timelinesEmpty.length}`);

  await script.logger.reset();
}
