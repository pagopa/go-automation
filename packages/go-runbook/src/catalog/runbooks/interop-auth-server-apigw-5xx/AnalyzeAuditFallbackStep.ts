import { readRowField, type ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { readCloudWatchResultRows } from '../../../steps/data/readCloudWatchResultRows.js';
import { INTEROP_API_GW_APPLICATION_QUERY_LIMIT } from '../../../interop/apigw/queries/interopApiGwApplicationQueries.js';
import { INTEROP_API_GW_STATUS_AGGREGATE_QUERY_LIMIT } from '../../../interop/apigw/queries/index.js';
import { normalizeInteropApiGwAggregateValue } from '../../../interop/apigw/helpers/normalizeInteropApiGwAggregateValue.js';
import { AUTH_SERVER_5XX_ALARM } from './alarmDefinition.js';
import { isInteropEnvironment } from '../interop/InteropEnvironment.js';

export const AUDIT_FALLBACK_PATTERN = 'Main auditing flow failed, going through fallback';
export const KAFKA_LOCK_PATTERN = 'Timeout while acquiring lock[^\\n]*connect to broker';
export const AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR = 'interopAuthServerAuditFallbackSequenceConfirmed';
export const AUDIT_FALLBACK_CONFIRMED_VAR = 'interopAuthServerAuditFallbackConfirmed';
const FALLBACK_STORAGE_PATTERN = /Storing file token-details\/\S+ in bucket ([a-z0-9.-]+)(?=$|[\s"'])/u;
const AUDIT_FALLBACK_SUCCEEDED_PATTERN = 'Auditing succeeded through fallback';

interface AuditFallbackAnalysis {
  readonly confirmedCids: ReadonlyArray<string>;
  readonly unresolvedCids: ReadonlyArray<string>;
  readonly uncorrelatedErrors: number;
  readonly additionalApplicationErrors: number;
  readonly additionalTrackerErrors: number;
  readonly applicationEvidenceComplete: boolean;
  readonly apiGatewayErrorCount: number;
  readonly apiGatewayIntegrationErrorCount: number;
  readonly apiGatewayCountsValid: boolean;
  readonly apiGatewayEvidenceComplete: boolean;
}

/** Confirms every fallback CID and permits completion only when no other application or gateway error remains. */
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
    const apiGateway = readCloudWatchResultRows(
      context.stepResults.get(AUTH_SERVER_5XX_ALARM.stepIds.queryApiGwAggregates),
    );
    const tracker: unknown = context.stepResults.get(AUTH_SERVER_5XX_ALARM.stepIds.queryCidTracker);
    if (application === undefined || apiGateway === undefined || !Array.isArray(tracker)) {
      return {
        success: false,
        error: 'Aggregati API Gateway, log applicativi o CID tracker non disponibili per la verifica audit',
      };
    }

    const candidates = new Set<string>();
    let uncorrelatedErrors = 0;
    let additionalApplicationErrors = 0;
    let additionalTrackerErrors = 0;
    for (const row of application) {
      const message = readMessage(row);
      if (!isAuditFailure(message)) {
        additionalApplicationErrors += 1;
        continue;
      }
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
      const messages = rows.flatMap((row) => {
        const message = readMessage(row);
        // Failure and token-generation boundaries remain trusted only from the auth server.
        if (isAuthServerRow(row)) return [message];
        // The two portable fallback markers may instead come from a correlated writer service.
        // Any other error from that service makes the recovery outcome unsafe to close.
        if (isTrackerError(row, message)) {
          additionalTrackerErrors += 1;
          return [];
        }
        return isPortableFallbackEvidence(message) ? [message] : [];
      });
      traces.set(entry.cid, messages);
      if (messages.some(isAuditFailure)) candidates.add(entry.cid);
    }

    const confirmedCids: string[] = [];
    const unresolvedCids: string[] = [];
    for (const cid of candidates) {
      (hasCompletedFallback(traces.get(cid) ?? [], expectedBucket) ? confirmedCids : unresolvedCids).push(cid);
    }
    // Reaching the query cap means additional failures may have been omitted. Without
    // a total count, only a result strictly below the cap proves that the evidence is complete.
    const applicationEvidenceComplete = application.length < INTEROP_API_GW_APPLICATION_QUERY_LIMIT;
    let apiGatewayErrorCount = 0;
    let apiGatewayIntegrationErrorCount = 0;
    let apiGatewayCountsValid = true;
    for (const row of apiGateway) {
      const count = readAggregateCount(row);
      if (count === undefined) apiGatewayCountsValid = false;
      else apiGatewayErrorCount += count;
      if (normalizeInteropApiGwAggregateValue(readRowField(row, 'integrationError')) !== undefined) {
        apiGatewayIntegrationErrorCount += count ?? 1;
      }
    }
    const apiGatewayEvidenceComplete = apiGateway.length < INTEROP_API_GW_STATUS_AGGREGATE_QUERY_LIMIT;
    const sequenceConfirmed =
      applicationEvidenceComplete &&
      confirmedCids.length > 0 &&
      unresolvedCids.length === 0 &&
      uncorrelatedErrors === 0;
    // Aggregates do not expose the application CID: access-log request counts cannot be
    // compared with deduplicated application CIDs because retries may emit multiple 5xx.
    // Keep the evidence fail-closed on truncation/malformed counts and reject an explicit
    // gateway-side integration error, without pretending the two cardinalities correlate.
    const apiGatewayEvidenceMatchesFallbacks =
      apiGatewayEvidenceComplete && apiGatewayCountsValid && apiGatewayIntegrationErrorCount === 0;
    const confirmed =
      sequenceConfirmed &&
      additionalApplicationErrors === 0 &&
      additionalTrackerErrors === 0 &&
      apiGatewayEvidenceMatchesFallbacks;
    const output = {
      confirmedCids,
      unresolvedCids,
      uncorrelatedErrors,
      additionalApplicationErrors,
      additionalTrackerErrors,
      applicationEvidenceComplete,
      apiGatewayErrorCount,
      apiGatewayIntegrationErrorCount,
      apiGatewayCountsValid,
      apiGatewayEvidenceComplete,
    };
    context.services.reporter.add({
      label:
        `Fallback audit: ${confirmedCids.length} CID confermati, ${unresolvedCids.length} da verificare, ` +
        `${uncorrelatedErrors} errori senza CID, ${additionalApplicationErrors} errori applicativi aggiuntivi, ` +
        `${additionalTrackerErrors} errori aggiuntivi nei servizi correlati, ` +
        `${apiGatewayErrorCount} errori API Gateway (${apiGatewayIntegrationErrorCount} di integrazione), ` +
        `evidenza applicativa ${applicationEvidenceComplete ? 'completa' : 'potenzialmente troncata'}, ` +
        `evidenza API Gateway ${apiGatewayEvidenceComplete ? 'completa' : 'potenzialmente troncata'}`,
    });
    return {
      success: true,
      output,
      vars: {
        [AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR]: String(sequenceConfirmed),
        [AUDIT_FALLBACK_CONFIRMED_VAR]: String(confirmed),
      },
    };
  }
}

function readAggregateCount(row: ReadonlyArray<ResultField>): number | undefined {
  const count = Number(readRowField(row, 'count'));
  return Number.isSafeInteger(count) && count > 0 ? count : undefined;
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

function isPortableFallbackEvidence(message: string): boolean {
  return FALLBACK_STORAGE_PATTERN.test(message) || message.includes(AUDIT_FALLBACK_SUCCEEDED_PATTERN);
}

function isTrackerError(row: ReadonlyArray<ResultField>, message: string): boolean {
  return readRowField(row, 'stream') === 'stderr' || message.includes('ERROR');
}

function hasCompletedFallback(messages: ReadonlyArray<string>, expectedBucket: string): boolean {
  // CID tracker returns chronological logs. Every new failure invalidates prior success.
  let stage = 0;
  for (const message of messages) {
    if (isAuditFailure(message)) stage = message.includes(AUDIT_FALLBACK_PATTERN) ? 1 : 0;
    else if (stage === 1 && FALLBACK_STORAGE_PATTERN.exec(message)?.[1] === expectedBucket) stage = 2;
    else if (stage === 2 && message.includes(AUDIT_FALLBACK_SUCCEEDED_PATTERN)) stage = 3;
    else if (stage === 3 && message.includes('Token generated')) stage = 4;
  }
  return stage === 4;
}
