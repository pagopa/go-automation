import type {
  RtaCheckInput,
  RtaCheckReport,
  RtaCheckRow,
  RtaCheckSummary,
  V1Status,
  V2Status,
} from '../types/RtaCheckReport.js';

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

/**
 * Aggregates per-occurrence rows into the summary metrics (V1 coverage + V2
 * compatibility distribution).
 *
 * @param rows - The per-occurrence rows
 * @returns The aggregate summary
 */
export function buildSummary(rows: ReadonlyArray<RtaCheckRow>): RtaCheckSummary {
  const total = rows.length;
  const countV1 = (status: V1Status): number => rows.filter((row) => row.runbook.status === status).length;

  const hit = countV1('HIT');
  const miss = countV1('MISS');
  const noData = countV1('NO-DATA');
  const configError = countV1('CONFIG-ERROR');
  const executionError = countV1('EXECUTION-ERROR');
  const executable = hit + miss;

  const durations = rows
    .map((row) => row.runbook.durationMs)
    .filter((value): value is number => typeof value === 'number');
  const avgDurationMs =
    durations.length === 0 ? 0 : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
  const cloudWatchRecordsScanned = rows.reduce((sum, row) => sum + (row.runbook.cloudWatchRecordsScanned ?? 0), 0);

  const analysisCompatibility: Record<V2Status, number> = {
    MATCH_EXACT: 0,
    MATCH_STRONG: 0,
    MATCH_WEAK: 0,
    NO_EVIDENCE: 0,
    CONFLICT: 0,
    NOT_LINKED: 0,
    NOT_ANALYZED: 0,
  };
  for (const row of rows) {
    analysisCompatibility[row.comparison.status] += 1;
  }

  return {
    totalEvents: total,
    executedEvents: total,
    linkedAnalyses: rows.filter((row) => row.event.analysisId !== undefined).length,
    hit,
    miss,
    noData,
    configError,
    executionError,
    automationCoveragePct: pct(hit, executable),
    executableRatePct: pct(executable, total),
    configErrorRatePct: pct(configError, total),
    avgDurationMs,
    cloudWatchRecordsScanned,
    analysisCompatibility,
  };
}

/**
 * Builds the full machine-readable report.
 *
 * @param input - Static run inputs
 * @param rows - The per-occurrence rows
 * @returns The report
 */
export function buildReport(input: RtaCheckInput, rows: ReadonlyArray<RtaCheckRow>): RtaCheckReport {
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    input,
    summary: buildSummary(rows),
    rows,
  };
}
