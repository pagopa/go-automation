/**
 * AWS Dump SQS - Print Summary Library
 */

import { AWS } from '@go-automation/go-common';

/**
 * Formats the completion summary.
 *
 * @param result - Result containing dump information
 * @param outputPath - Path to the output file
 * @returns Formatted summary string
 */

export function formatCompletionSummary(result: AWS.SQSReceiveResult, outputPath: string): string {
  return (
    `Dump completed (${result.stopReason}).\n` +
    `  - Total unique messages: ${result.totalUnique}\n` +
    `  - Total messages received: ${result.totalReceived}\n` +
    `  - Duplicates filtered: ${result.totalDuplicates}\n` +
    `  - File: ${outputPath}`
  );
}
