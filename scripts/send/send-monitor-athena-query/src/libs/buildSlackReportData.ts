import type { AWSAthenaQueryResult } from '@pagopa/go-aws/athena';
import type { GOThresholdEvaluation } from '@pagopa/go-common/analysis';
import { GODateTokens } from '@pagopa/go-common/dates';

import type { ReportArtifact, TimeRange } from '../types/index.js';

export function buildSlackReportData(
  timeRange: TimeRange,
  result: AWSAthenaQueryResult,
  artifact: ReportArtifact,
  evaluation: GOThresholdEvaluation,
  timeZone: string,
): Record<string, string | number> {
  const dateTokens = GODateTokens.fromRange(timeRange.from, timeRange.to, timeZone);
  const analysis = formatAnalysis(evaluation);

  return {
    ...dateTokens,
    rowCount: result.rowCount,
    executionId: result.executionId,
    database: result.database,
    fileName: artifact.fileName,
    filePath: artifact.filePath,
    s3Uri: artifact.s3Uri ?? 'n/a',
    outputFormat: artifact.format,
    analysis,
    thresholdBreached: evaluation.breached ? 'true' : 'false',
    timestamp: GODateTokens.formatAthenaDateTime(new Date(), timeZone),
  };
}

function formatAnalysis(evaluation: GOThresholdEvaluation): string {
  if (evaluation.results.length === 0) {
    return evaluation.summary;
  }

  const details = evaluation.results
    .map((result) => {
      const status = result.breached ? 'BREACHED' : 'OK';
      return `${status} ${result.rule.name}: ${result.message}`;
    })
    .join('\n');

  return `${evaluation.summary}\n${details}`;
}
