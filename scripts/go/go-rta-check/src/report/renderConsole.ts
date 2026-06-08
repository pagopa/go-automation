import type { Core } from '@go-automation/go-common';

import type { RtaCheckReport, RtaCheckRow, V1Status } from '../types/RtaCheckReport.js';

/** Preview shown after fetching occurrences, before running anything. */
export interface RunPreview {
  readonly productName: string;
  readonly environmentName: string;
  readonly alarmName: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly totalOccurrences: number;
  readonly linkedAnalyses: number;
  readonly concurrency: number;
}

const CRITICAL_V1_ORDER: ReadonlyArray<V1Status> = ['EXECUTION-ERROR', 'CONFIG-ERROR', 'MISS'];

/** Renders the selection + preview block. */
export function renderPreview(logger: Core.GOLogger, preview: RunPreview): void {
  logger.section('RTA Check');
  logger.info(`Prodotto: ${preview.productName}`);
  logger.info(`Ambiente: ${preview.environmentName}`);
  logger.info(`Allarme: ${preview.alarmName}`);
  logger.info(`Periodo: ${preview.dateFrom} → ${preview.dateTo}`);
  logger.info(`Occorrenze: ${preview.totalOccurrences} (con analisi: ${preview.linkedAnalyses})`);
  logger.info(`Concorrenza: ${preview.concurrency} · stima esecuzioni CloudWatch: ${preview.totalOccurrences}`);
}

/** Fixed-width columns for the live per-execution table. */
const RESULT_COLUMNS = [
  { header: 'Prodotto', width: 18 },
  { header: 'Runbook', width: 32 },
  { header: 'Data allarme', width: 24 },
  { header: 'Esito', width: 26 },
  { header: 'Verifica', width: 22 },
] as const;

/** Pads or truncates (with an ellipsis) a cell to the given width. */
function cell(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

/** "Product (Environment)" label, or just the product when no environment. */
export function productEnvLabel(productName: string, environmentName: string | undefined): string {
  return environmentName !== undefined && environmentName !== '' ? `${productName} (${environmentName})` : productName;
}

/** Prints the header of the live per-execution table (call once before the loop). */
export function renderResultsHeader(logger: Core.GOLogger): void {
  logger.section('Esecuzioni');
  logger.text(RESULT_COLUMNS.map((column) => cell(column.header, column.width)).join(' │ '));
  logger.text(RESULT_COLUMNS.map((column) => '─'.repeat(column.width)).join('─┼─'));
}

/** Prints one row of the live per-execution table as each occurrence completes. */
export function renderResultsRow(
  logger: Core.GOLogger,
  productName: string,
  alarmName: string,
  row: RtaCheckRow,
): void {
  const esito =
    row.runbook.status === 'HIT' && row.runbook.primaryCaseId !== undefined
      ? `HIT · ${row.runbook.primaryCaseId}`
      : row.runbook.status;
  const verifica =
    row.comparison.confidence > 0
      ? `${row.comparison.status} (${row.comparison.confidence.toFixed(2)})`
      : row.comparison.status;
  logger.text(
    [
      cell(productEnvLabel(productName, row.event.environment), RESULT_COLUMNS[0].width),
      cell(alarmName, RESULT_COLUMNS[1].width),
      cell(row.event.firedAt, RESULT_COLUMNS[2].width),
      cell(esito, RESULT_COLUMNS[3].width),
      cell(verifica, RESULT_COLUMNS[4].width),
    ].join(' │ '),
  );
}

/** Renders the final summary table + the "to investigate" list ordered by criticality. */
export function renderSummary(logger: Core.GOLogger, report: RtaCheckReport): void {
  const summary = report.summary;
  const total = summary.totalEvents === 0 ? 1 : summary.totalEvents;
  const percent = (value: number): string => `${((value / total) * 100).toFixed(1)}%`;

  logger.section('Copertura runbook');
  logger.simpleTable([
    { Esito: 'HIT', Count: summary.hit, '%': percent(summary.hit) },
    { Esito: 'MISS', Count: summary.miss, '%': percent(summary.miss) },
    { Esito: 'NO-DATA', Count: summary.noData, '%': percent(summary.noData) },
    { Esito: 'CONFIG-ERROR', Count: summary.configError, '%': percent(summary.configError) },
    { Esito: 'EXECUTION-ERROR', Count: summary.executionError, '%': percent(summary.executionError) },
  ]);
  logger.info(`Copertura automation (HIT/(HIT+MISS)): ${summary.automationCoveragePct}%`);
  logger.info(
    `Eseguibili ((HIT+MISS)/tot): ${summary.executableRatePct}% · Config-error: ${summary.configErrorRatePct}%`,
  );

  const compatibility = Object.entries(summary.analysisCompatibility)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`)
    .join(' · ');
  logger.info(`Coerenza analisi: ${compatibility === '' ? '-' : compatibility}`);

  renderCritical(logger, report.rows);
}

function renderCritical(logger: Core.GOLogger, rows: ReadonlyArray<RtaCheckRow>): void {
  const lines: string[] = [];
  for (const status of CRITICAL_V1_ORDER) {
    for (const row of rows.filter((candidate) => candidate.runbook.status === status)) {
      lines.push(formatCritical(row));
    }
  }
  for (const row of rows.filter(
    (candidate) => candidate.runbook.status === 'HIT' && candidate.comparison.status === 'CONFLICT',
  )) {
    lines.push(formatCritical(row));
  }

  if (lines.length === 0) return;
  logger.section('Da indagare (ordinato per criticità)');
  for (const line of lines.slice(0, 30)) logger.text(line);
  if (lines.length > 30) logger.text(`  … e altre ${lines.length - 30} righe (vedi report).`);
}

function formatCritical(row: RtaCheckRow): string {
  const runbook = row.runbook;
  let detail: string;
  if (runbook.status === 'HIT') {
    detail = `CONFLICT con caso "${runbook.primaryCaseId ?? ''}"`;
  } else if (runbook.error !== undefined && runbook.error !== '') {
    detail = runbook.error.slice(0, 90);
  } else {
    detail = runbook.primaryCaseId ?? '';
  }
  return `  • [${runbook.status}] ${row.event.firedAt} ${detail}`.trimEnd();
}
