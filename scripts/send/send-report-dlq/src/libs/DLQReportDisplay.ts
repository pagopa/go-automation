/**
 * DLQ Report Display
 *
 * Handles rendering DLQ statistics to the console (tables and summary).
 */

import type { GOScript } from '@go-automation/go-script';
import type { DLQStats } from '@pagopa/go-aws/sqs';

// ============================================================================
// Public
// ============================================================================

/**
 * Displays DLQ statistics for a single profile as a table.
 *
 * @param script - The GOScript instance for logging
 * @param profile - AWS profile name (used as section title)
 * @param dlqStats - DLQ statistics to display
 */
export function displayProfileResults(script: GOScript, profile: string, dlqStats: ReadonlyArray<DLQStats>): void {
  script.logger.section(`Profile: ${profile}`);

  if (dlqStats.length === 0) {
    script.logger.success('No DLQs with messages');
    return;
  }

  script.logger.warning(`${dlqStats.length} DLQ${dlqStats.length > 1 ? 's' : ''} with messages`);
  script.logger.newline();

  script.logger.table({
    columns: [
      { header: 'Queue Name', key: 'queueName' },
      { header: 'Messages', key: 'messageCount' },
      { header: 'Age (days)', key: 'ageOfOldestMessageDays' },
    ],
    data: dlqStats.map((stat) => ({
      queueName: stat.queueName,
      messageCount: stat.messageCount,
      ageOfOldestMessageDays: stat.ageOfOldestMessageDays ?? 'N/A',
    })),
    border: true,
  });
}

/**
 * Displays a summary of totals across all profiles.
 *
 * @param script - The GOScript instance for logging
 * @param results - Map of profile → DLQ stats
 */
export function displaySummary(script: GOScript, results: ReadonlyMap<string, ReadonlyArray<DLQStats>>): void {
  script.logger.section('Summary');

  let totalDlqs = 0;
  let totalMessages = 0;

  const summaryRows: { profile: string; dlqs: number; messages: number }[] = [];

  for (const [profile, stats] of results) {
    const dlqCount = stats.length;
    const msgCount = stats.reduce((sum, s) => sum + s.messageCount, 0);
    totalDlqs += dlqCount;
    totalMessages += msgCount;
    summaryRows.push({ profile, dlqs: dlqCount, messages: msgCount });
  }

  script.logger.table({
    columns: [
      { header: 'Profile', key: 'profile' },
      { header: 'DLQs with messages', key: 'dlqs' },
      { header: 'Total messages', key: 'messages' },
    ],
    data: summaryRows,
    border: true,
  });

  script.logger.newline();
  script.logger.info(`Total DLQs with messages: ${totalDlqs}`);
  script.logger.info(`Total messages across all DLQs: ${totalMessages}`);
}
