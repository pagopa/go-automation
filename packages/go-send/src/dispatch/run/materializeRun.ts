import { GOCSVListExporter, GOJSONListExporter, type GOListExporter } from '@pagopa/go-common/exporters';

import { resolveRowKey } from '../ids/identifiers.js';
import type { InputFormat } from '../input/InputFormat.js';
import { acceptanceOf } from '../model/acceptanceOf.js';
import type { RowState } from '../model/RowState.js';
import type { RowStatus } from '../model/RowStatus.js';
import type { MaterializerOptions } from './MaterializerOptions.js';

const MAX_ERROR_MESSAGE = 1_000;

/**
 * Statuses of a notification SEND (or pn-external-channels) accepted.
 * `REQUEST_ID_NOT_FOUND` is not one: when the run looks for the requestId it
 * is expected to find it, so a row left without is a problem (exit code 2).
 */
const SUCCESSFUL_STATUSES: ReadonlySet<RowStatus> = new Set<RowStatus>(['SENT', 'ACCEPTED', 'REQUEST_ID_FOUND']);

/**
 * Writes the output (input + `iun` + `requestId`, 1:1 with the input) and the
 * report (one row per input row) from the ledger (§12).
 *
 * The input is re-read in streaming and joined by `rowIndex`, so memory holds
 * only the compact row states. Both files are rewritten from the ledger every
 * time, so materializing again (after a stop, on resume) is always safe.
 *
 * @param options - Input, ledger, formats and paths
 */
export async function materializeRun(options: MaterializerOptions): Promise<void> {
  const iunColumn = options.outputColumns?.iun ?? 'iun';
  const requestIdColumn = options.outputColumns?.requestId ?? 'requestId';
  const output = await createExporter(options.format, options.outputPath, options.delimiter).exportStream();
  try {
    const report = await createExporter(options.format, options.reportPath, options.delimiter).exportStream();
    try {
      for await (const row of options.reader.rows()) {
        const state = options.ledger.get(row.rowIndex);
        const status = state?.status ?? options.unsentStatus;
        if (!options.onlySuccess || isSuccessful(state)) {
          await output.append({
            ...row.original,
            // A refused notification is not delivered: its IUN must not be used downstream.
            [iunColumn]: state === undefined || acceptanceOf(state) === 'REFUSED' ? '' : (state.iun ?? ''),
            [requestIdColumn]: state?.requestId ?? '',
            ...(options.includeStatus && {
              _status: status,
              _notificationRequestId: state?.notificationRequestId ?? '',
              _error: state?.error?.code ?? '',
            }),
          });
        }
        const rowKey = state?.rowKey ?? resolveRowKey(row.values, options.rowKeyColumn, row.rowIndex);
        await report.append(reportRow(row.rowIndex, rowKey, status, state));
      }
    } finally {
      await report.close();
    }
  } finally {
    await output.close();
  }
}

/**
 * Whether a row belongs to the success-only output: it reached a successful
 * status and has an identifier to show, the IUN (e2e) or the requestId
 * accepted by pn-external-channels (direct, where there is no IUN). The IUN
 * alone is not enough: e2e stores it at `SENT`, and `REFUSED` /
 * `VERIFY_TIMEOUT` / `REQUEST_ID_NOT_FOUND` rows keep it.
 */
function isSuccessful(state: RowState | undefined): boolean {
  if (state === undefined || !SUCCESSFUL_STATUSES.has(state.status)) return false;
  return state.iun !== undefined || state.requestId !== undefined;
}

function reportRow(
  rowIndex: number,
  rowKey: string,
  status: string,
  state: RowState | undefined,
): Record<string, unknown> {
  return {
    rowIndex,
    rowKey,
    status,
    notificationRequestId: state?.notificationRequestId ?? '',
    iun: state?.iun ?? '',
    requestId: state?.requestId ?? '',
    analogRequestId: state?.requestIds?.['PREPARE_ANALOG_DOMICILE'] ?? '',
    digitalRequestId: state?.requestIds?.['PREPARE_DIGITAL_DOMICILE'] ?? '',
    requestIds: Object.entries(state?.requestIds ?? {})
      .map(([category, id]) => `${category}=${id}`)
      .join('|'),
    requestIdReason: state?.requestIdReason ?? '',
    groupId: state?.groupId ?? '',
    documentSource: state?.documentSource ?? '',
    documentKeys: (state?.documentKeys ?? []).join('|'),
    documentSha256: (state?.documentSha256 ?? []).join('|'),
    paProtocolNumber: state?.paProtocolNumber ?? '',
    idempotenceToken: state?.idempotenceToken ?? '',
    sentAt: state?.sentAt ?? '',
    acceptedAt: state?.acceptedAt ?? '',
    requestIdFoundAt: state?.requestIdFoundAt ?? '',
    sendAttempts: state?.sendAttempts ?? 0,
    verifyChecks: state?.verifyChecks ?? 0,
    requestIdChecks: state?.requestIdChecks ?? 0,
    errorCode: state?.error?.code ?? '',
    errorMessage: (state?.error?.message ?? '').slice(0, MAX_ERROR_MESSAGE),
    errorDetails: state?.error?.details ?? '',
    warnings: (state?.warnings ?? []).join('|'),
  };
}

function createExporter(
  format: InputFormat,
  outputPath: string,
  delimiter: string | undefined,
): GOListExporter<Record<string, unknown>> {
  switch (format) {
    case 'csv':
      return new GOCSVListExporter<Record<string, unknown>>({
        outputPath,
        includeHeader: true,
        delimiter: delimiter ?? ',',
      });
    case 'json':
      return new GOJSONListExporter<Record<string, unknown>>({ outputPath, pretty: true });
    case 'jsonl':
      return new GOJSONListExporter<Record<string, unknown>>({ outputPath, jsonl: true });
    default: {
      const exhaustive: never = format;
      throw new Error(`Unhandled output format ${String(exhaustive)}`);
    }
  }
}
