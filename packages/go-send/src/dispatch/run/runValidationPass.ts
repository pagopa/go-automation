import { isInspectionFailure } from '../documents/isInspectionFailure.js';
import { deriveRowIdentifiers, MAX_IDENTIFIER_LENGTH, resolveRowKey } from '../ids/identifiers.js';
import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { DocumentSourceKind } from '../model/DocumentSourceKind.js';
import type { RowState } from '../model/RowState.js';
import type { RowStatus } from '../model/RowStatus.js';
import type { ValidationIssue } from '../mapping/ValidationIssue.js';
import { decideRowAction } from './decideRowAction.js';
import type { RowAction } from './RowAction.js';
import type { RowActionPolicy } from './RowActionPolicy.js';
import type { ValidationPassOptions } from './ValidationPassOptions.js';
import type { ValidationSummary } from './ValidationSummary.js';

/**
 * Statuses a resume may still turn into `INVALID`: the row never reached SEND.
 * Any later status (sent, possibly sent, verified…) is kept, whatever the
 * mapping or the documents say now.
 */
const INVALIDATABLE: ReadonlySet<RowStatus | undefined> = new Set<RowStatus | undefined>([
  undefined,
  'PENDING',
  'SEND_FAILED',
  'INVALID',
]);

/**
 * First pass over the input, before any call (§14.2): maps and validates
 * every row, inspects every row document (existence, PDF, size, SHA-256),
 * checks identifier lengths, row-key and (direct mode) requestId uniqueness,
 * and collects the figures of the send plan.
 *
 * Invalid rows are recorded as `ROW_INVALID`, unless a previous session
 * already took them past SEND; rows recorded `INVALID` by a previous session
 * that now validate are recorded as `ROW_REVALIDATED` (back to `PENDING`), so
 * the run sends them. Each valid row is classified with the
 * {@link RowActionPolicy} of the session, like the run will do.
 *
 * When `options.signal` is aborted the pass stops before the next row: the
 * summary then covers only the rows seen so far and must not be used for a
 * send plan.
 *
 * @param options - Reader, factory, inspector, ledger, policy and stop signal
 * @returns Summary for the send plan (incomplete if stopped)
 */
export async function runValidationPass(options: ValidationPassOptions): Promise<ValidationSummary> {
  const counters = new SummaryCounters();
  const rowKeys = new Set<string>();
  const duplicates = new Set<string>();
  const requestIds = new Set<string>();
  const duplicateRequestIds = new Set<string>();

  for await (const row of options.reader.rows()) {
    if (options.signal?.aborted === true) break;
    counters.totalRows += 1;
    if (options.presetMode === true) {
      const preset = options.factory.createPreset(row);
      const rowKey = preset.ok ? preset.preset.rowKey : resolveRowKey(row.values, options.rowKeyColumn, row.rowIndex);
      addOrMarkDuplicate(rowKeys, duplicates, rowKey);
      if (!preset.ok) {
        await recordInvalid(options, counters, row.rowIndex, rowKey, preset.issues);
        continue;
      }
      const state = await revalidate(options, row.rowIndex, rowKey);
      counters.addPreset(presetAction(state, row.rowIndex, rowKey, options.policy));
      continue;
    }
    const created = options.factory.create(row);
    addOrMarkDuplicate(rowKeys, duplicates, created.rowKey);

    const issues = created.result.ok ? await recordIssues(created.result.record, options) : created.result.issues;
    if (issues.length > 0 || !created.result.ok) {
      await recordInvalid(options, counters, row.rowIndex, created.rowKey, issues);
      continue;
    }
    const requestId = created.result.record.direct?.requestId;
    if (requestId !== undefined) addOrMarkDuplicate(requestIds, duplicateRequestIds, requestId);
    const state = await revalidate(options, row.rowIndex, created.rowKey);
    await counters.addValid(created.result.record, decideRowAction(state, options.policy), options);
  }

  return counters.toSummary([...duplicates], [...duplicateRequestIds]);
}

function addOrMarkDuplicate(seen: Set<string>, duplicates: Set<string>, value: string): void {
  if (seen.has(value)) duplicates.add(value);
  else seen.add(value);
}

/**
 * A valid row recorded `INVALID` by a previous session goes back to
 * `PENDING`; otherwise its state is unchanged.
 */
async function revalidate(
  options: ValidationPassOptions,
  rowIndex: number,
  rowKey: string,
): Promise<RowState | undefined> {
  const state = options.ledger.get(rowIndex);
  if (state?.status !== 'INVALID') return state;
  return options.ledger.record({ event: 'ROW_REVALIDATED', rowIndex, rowKey });
}

/**
 * Action of a valid preset row: a row never processed (no state, or back to
 * `PENDING`) is imported by the run as `PRESET`, i.e. `SENT`.
 */
function presetAction(
  state: RowState | undefined,
  rowIndex: number,
  rowKey: string,
  policy: RowActionPolicy,
): RowAction {
  if (state !== undefined && state.status !== 'PENDING') return decideRowAction(state, policy);
  return decideRowAction(
    { rowIndex, rowKey, status: 'SENT', sendAttempts: 0, verifyChecks: 0, requestIdChecks: 0, warnings: [] },
    policy,
  );
}

async function recordIssues(
  record: DispatchRecord,
  options: ValidationPassOptions,
): Promise<ReadonlyArray<ValidationIssue>> {
  const issues: ValidationIssue[] = [];
  const ids = deriveRowIdentifiers(options.runId, record.rowKey, record.options.paProtocolNumber);
  if (ids.paProtocolNumber.length > MAX_IDENTIFIER_LENGTH || ids.idempotenceToken.length > MAX_IDENTIFIER_LENGTH) {
    issues.push({
      code: 'TOO_LONG',
      message: `row key too long for paProtocolNumber/idempotenceToken (max ${MAX_IDENTIFIER_LENGTH})`,
    });
  }
  if (record.documents.kind === 'rowFiles') {
    for (const file of record.documents.files) {
      const inspection = await options.inspector.inspectRowFile(file.path);
      if (isInspectionFailure(inspection)) {
        issues.push({
          code: inspection.failure,
          field: 'documents.files',
          message: `${file.path}: ${inspection.message}`,
        });
      }
    }
  }
  return issues;
}

async function recordInvalid(
  options: ValidationPassOptions,
  counters: SummaryCounters,
  rowIndex: number,
  rowKey: string,
  issues: ReadonlyArray<ValidationIssue>,
): Promise<void> {
  const state = options.ledger.get(rowIndex);
  if (!INVALIDATABLE.has(state?.status)) {
    // Resume: the journal state wins, the row is not sent again.
    counters.addAlreadyProcessed(decideRowAction(state, options.policy));
    return;
  }
  counters.invalidRows += 1;
  if (state?.status === 'INVALID') return; // already journaled (resume)
  await options.ledger.record({
    event: 'ROW_INVALID',
    rowIndex,
    rowKey,
    error: {
      code: issues[0]?.code ?? 'INVALID',
      message: issues.map((issue) => issue.message).join('; '),
      details: JSON.stringify(issues),
    },
  });
}

/** Mutable accumulator of the validation pass. */
class SummaryCounters {
  public totalRows = 0;
  public invalidRows = 0;
  private validRows = 0;
  private rowsToSend = 0;
  private rowsToProcess = 0;
  private digitalRows = 0;
  private rowFiles = 0;
  private readonly distinctFiles = new Set<string>();
  private readonly products = new Map<string, number>();
  private readonly senders = new Map<string, number>();
  private readonly groups = new Map<string, number>();
  private readonly documentSources = new Map<DocumentSourceKind, number>();

  /** Counts a valid row of the phases without `send`. */
  public addPreset(action: RowAction): void {
    this.validRows += 1;
    this.countAction(action);
  }

  /**
   * Counts a row a previous session already took past SEND (resume) and
   * that no longer validates. A `send` action here is a row left ambiguous
   * whose mapping changed: the run marks it uncertain instead of sending it.
   */
  public addAlreadyProcessed(action: RowAction): void {
    this.validRows += 1;
    if (action !== 'send') this.countAction(action);
  }

  /** Counts a valid row; the plan figures describe the rows to send only. */
  public async addValid(record: DispatchRecord, action: RowAction, options: ValidationPassOptions): Promise<void> {
    this.validRows += 1;
    this.countAction(action);
    if (action !== 'send') return;
    increment(this.products, record.product);
    increment(this.senders, `${record.sender.taxId} — ${record.sender.denomination}`);
    increment(this.groups, record.options.group ?? '');
    increment(this.documentSources, record.documents.kind);
    if (record.digitalDomicile !== undefined) this.digitalRows += 1;
    if (record.documents.kind === 'rowFiles') {
      for (const file of record.documents.files) {
        this.rowFiles += 1;
        const inspection = await options.inspector.inspectRowFile(file.path); // cached
        if (!isInspectionFailure(inspection)) this.distinctFiles.add(inspection.sha256);
      }
    }
  }

  public toSummary(
    duplicateRowKeys: ReadonlyArray<string>,
    duplicateRequestIds: ReadonlyArray<string>,
  ): ValidationSummary {
    return {
      totalRows: this.totalRows,
      validRows: this.validRows,
      invalidRows: this.invalidRows,
      rowsToSend: this.rowsToSend,
      rowsToProcess: this.rowsToProcess,
      duplicateRowKeys,
      duplicateRequestIds,
      products: this.products,
      senders: this.senders,
      groups: this.groups,
      documentSources: this.documentSources,
      rowFiles: this.rowFiles,
      distinctRowFiles: this.distinctFiles.size,
      digitalRows: this.digitalRows,
    };
  }

  private countAction(action: RowAction): void {
    if (action === 'skip') return;
    this.rowsToProcess += 1;
    if (action === 'send') this.rowsToSend += 1;
  }
}

function increment<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
