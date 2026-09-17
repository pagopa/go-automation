import type { ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { readCloudWatchResultRows } from '../../../steps/data/readCloudWatchResultRows.js';
import { AUTH_SERVER_5XX_ALARM } from './alarmDefinition.js';
import { isInteropEnvironment } from '../interop/InteropEnvironment.js';

export const AUDIT_FALLBACK_PATTERN = 'Main auditing flow failed, going through fallback';
export const KAFKA_LOCK_PATTERN = 'Timeout while acquiring lock[^\\n]*connect to broker';
export const AUDIT_FALLBACK_CONFIRMED_VAR = 'interopAuthServerAuditFallbackConfirmed';

interface AuditFallbackAnalysis {
  readonly confirmedCids: ReadonlyArray<string>;
  readonly unresolvedCids: ReadonlyArray<string>;
  readonly uncorrelatedErrors: number;
}

/** Confirms recovery only when every observed audit/Kafka failure has a complete CID trace. */
export class AnalyzeAuditFallbackStep implements Step<AuditFallbackAnalysis> {
  readonly id = 'analyze-auth-server-audit-fallback';
  readonly label = 'Verifica fallback audit S3 e generazione token per CID';
  readonly kind = 'transform' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<AuditFallbackAnalysis>> {
    const environment = context.vars.get('interopEnvironment');
    if (!isInteropEnvironment(environment)) {
      return { success: false, error: 'Ambiente INTEROP mancante o non supportato per la verifica audit' };
    }
    const expectedBucket = `interop-generated-jwt-details-fallback-${environment}-es1`;
    const application = readCloudWatchResultRows(
      context.stepResults.get(AUTH_SERVER_5XX_ALARM.stepIds.queryApplicationLogs),
    );
    const tracker: unknown = context.stepResults.get(AUTH_SERVER_5XX_ALARM.stepIds.queryCidTracker);
    if (application === undefined || !Array.isArray(tracker)) {
      return { success: false, error: 'Log applicativi o CID tracker non disponibili per la verifica audit' };
    }

    const candidates = new Set<string>();
    let uncorrelatedErrors = 0;
    for (const row of application) {
      const message = readMessage(row);
      if (!isAuditFailure(message)) continue;
      const explicitCid = row.find((field) => field.field === 'cid' || field.field === 'CID')?.value?.trim();
      const cid =
        explicitCid !== undefined && explicitCid !== '' ? explicitCid : /\bCID=([^\]\s,"']+)/u.exec(message)?.[1];
      if (cid === undefined) uncorrelatedErrors += 1;
      else candidates.add(cid);
    }

    const traces = new Map<string, ReadonlyArray<string>>();
    for (const entry of tracker as unknown[]) {
      if (typeof entry !== 'object' || entry === null || !('cid' in entry) || !('rows' in entry)) continue;
      if (typeof entry.cid !== 'string' || entry.cid.trim() === '') continue;
      const rows = readCloudWatchResultRows(entry.rows);
      if (rows === undefined) continue;
      const messages = rows.filter(isAuthServerRow).map(readMessage);
      traces.set(entry.cid, messages);
      if (messages.some(isAuditFailure)) candidates.add(entry.cid);
    }

    const confirmedCids: string[] = [];
    const unresolvedCids: string[] = [];
    for (const cid of candidates) {
      (hasCompletedFallback(traces.get(cid) ?? [], expectedBucket) ? confirmedCids : unresolvedCids).push(cid);
    }
    const confirmed = confirmedCids.length > 0 && unresolvedCids.length === 0 && uncorrelatedErrors === 0;
    const output = { confirmedCids, unresolvedCids, uncorrelatedErrors };
    context.services.reporter.add({
      label: `Fallback audit: ${confirmedCids.length} CID confermati, ${unresolvedCids.length} da verificare, ${uncorrelatedErrors} errori senza CID`,
    });
    return { success: true, output, vars: { [AUDIT_FALLBACK_CONFIRMED_VAR]: String(confirmed) } };
  }
}

function readMessage(row: ReadonlyArray<ResultField>): string {
  const raw = row.find((field) => ['log', '@message', 'message'].includes(field.field ?? ''))?.value ?? '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'log' in parsed && typeof parsed.log === 'string')
      return parsed.log;
  } catch {
    /* Plain application log. */
  }
  return raw;
}

function isAuthServerRow(row: ReadonlyArray<ResultField>): boolean {
  return row.find((field) => field.field === 'pod_app')?.value?.startsWith('interop-be-authorization-server') === true;
}

function isAuditFailure(message: string): boolean {
  return (
    message.includes(AUDIT_FALLBACK_PATTERN) || /Timeout while acquiring lock[^\n]*connect to broker/u.test(message)
  );
}

function hasCompletedFallback(messages: ReadonlyArray<string>, expectedBucket: string): boolean {
  // CID tracker returns chronological logs. Every new failure invalidates prior success.
  let stage = 0;
  for (const message of messages) {
    if (isAuditFailure(message)) stage = message.includes(AUDIT_FALLBACK_PATTERN) ? 1 : 0;
    else if (
      stage === 1 &&
      /Storing file token-details\/\S+ in bucket ([a-z0-9.-]+)(?=$|[\s"'])/u.exec(message)?.[1] === expectedBucket
    )
      stage = 2;
    else if (stage === 2 && message.includes('Auditing succeeded through fallback')) stage = 3;
    else if (stage === 3 && message.includes('Token generated')) stage = 4;
  }
  return stage === 4;
}
