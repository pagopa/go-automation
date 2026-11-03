import { isInspectionFailure } from '../documents/isInspectionFailure.js';
import { deriveRowIdentifiers, MAX_IDENTIFIER_LENGTH } from '../ids/identifiers.js';
import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { DocumentSourceKind } from '../model/DocumentSourceKind.js';
import type { ValidationIssue } from '../mapping/ValidationIssue.js';
import type { ValidationPassOptions } from './ValidationPassOptions.js';
import type { ValidationSummary } from './ValidationSummary.js';

/**
 * First pass over the input, before any call (§14.2): maps and validates
 * every row, inspects every row document (existence, PDF, size, SHA-256),
 * checks identifier lengths and row-key uniqueness, and collects the figures
 * of the send plan. Invalid rows are recorded as `ROW_INVALID`.
 *
 * @param options - Reader, factory, inspector and ledger
 * @returns Summary for the send plan
 */
export async function runValidationPass(options: ValidationPassOptions): Promise<ValidationSummary> {
  const counters = new SummaryCounters();
  const firstRowByKey = new Map<string, number>();
  const duplicates = new Set<string>();

  for await (const row of options.reader.rows()) {
    counters.totalRows += 1;
    if (options.presetMode === true) {
      const preset = options.factory.createPreset(row);
      const rowKey = preset.ok ? preset.preset.rowKey : options.factory.create(row).rowKey;
      if (firstRowByKey.has(rowKey)) duplicates.add(rowKey);
      else firstRowByKey.set(rowKey, row.rowIndex);
      if (preset.ok) counters.addPreset();
      else {
        counters.invalidRows += 1;
        await recordInvalid(options, row.rowIndex, rowKey, preset.issues);
      }
      continue;
    }
    const created = options.factory.create(row);
    if (firstRowByKey.has(created.rowKey)) duplicates.add(created.rowKey);
    else firstRowByKey.set(created.rowKey, row.rowIndex);

    const issues = created.result.ok ? await recordIssues(created.result.record, options) : created.result.issues;
    if (issues.length > 0 || !created.result.ok) {
      counters.invalidRows += 1;
      await recordInvalid(options, row.rowIndex, created.rowKey, issues);
      continue;
    }
    await counters.addValid(created.result.record, options);
  }

  return counters.toSummary([...duplicates]);
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
      const inspection = await options.inspector.inspect(file.path);
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
  rowIndex: number,
  rowKey: string,
  issues: ReadonlyArray<ValidationIssue>,
): Promise<void> {
  if (options.ledger.get(rowIndex)?.status === 'INVALID') return; // already journaled (resume)
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
  private digitalRows = 0;
  private rowFiles = 0;
  private readonly distinctFiles = new Set<string>();
  private readonly products = new Map<string, number>();
  private readonly senders = new Map<string, number>();
  private readonly groups = new Map<string, number>();
  private readonly documentSources = new Map<DocumentSourceKind, number>();

  /** Counts a valid row of the phases without `send`. */
  public addPreset(): void {
    this.validRows += 1;
  }

  public async addValid(record: DispatchRecord, options: ValidationPassOptions): Promise<void> {
    this.validRows += 1;
    increment(this.products, record.product);
    increment(this.senders, `${record.sender.taxId} — ${record.sender.denomination}`);
    increment(this.groups, record.options.group ?? '');
    increment(this.documentSources, record.documents.kind);
    if (record.digitalDomicile !== undefined) this.digitalRows += 1;
    if (record.documents.kind === 'rowFiles') {
      for (const file of record.documents.files) {
        this.rowFiles += 1;
        const inspection = await options.inspector.inspect(file.path); // cached
        if (!isInspectionFailure(inspection)) this.distinctFiles.add(inspection.sha256);
      }
    }
  }

  public toSummary(duplicateRowKeys: ReadonlyArray<string>): ValidationSummary {
    return {
      totalRows: this.totalRows,
      validRows: this.validRows,
      invalidRows: this.invalidRows,
      duplicateRowKeys,
      products: this.products,
      senders: this.senders,
      groups: this.groups,
      documentSources: this.documentSources,
      rowFiles: this.rowFiles,
      distinctRowFiles: this.distinctFiles.size,
      digitalRows: this.digitalRows,
    };
  }
}

function increment<K>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
