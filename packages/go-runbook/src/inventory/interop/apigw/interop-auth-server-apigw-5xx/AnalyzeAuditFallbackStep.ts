import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookContext, Step, StepResult } from '../../../../engine/index.js';
import {
  isInteropEnvironment,
  normalizeInteropApiGwAggregateValue,
  readCidTrackerResults,
  readCloudWatchResultRows,
  readInteropLogRow,
  type CloudWatchLogsRow,
  type CloudWatchLogsRows,
} from '../../../../toolkits/interop/index.js';
import { AUTH_SERVER_5XX_ALARM } from './alarmDefinition.js';

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

/** The fallback sequence of a CID, in order: started, stored in the expected bucket, succeeded, token generated. */
const FALLBACK_SEQUENCE = ['fallback', 'stored', 'succeeded', 'token'] as const;

/** Verifies fallback sequences per CID and reports the remaining application and gateway evidence. */
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
    const { stepIds } = AUTH_SERVER_5XX_ALARM;
    const application = readCloudWatchResultRows(context.stepResults.get(stepIds.queryApplicationLogs));
    const apiGateway = readCloudWatchResultRows(context.stepResults.get(stepIds.queryApiGwAggregates));
    const tracker = readCidTrackerResults(context.stepResults.get(stepIds.queryCidTracker));
    if (application === undefined || apiGateway === undefined || tracker === undefined) {
      return {
        success: false,
        error: 'Aggregati API Gateway, log applicativi o CID tracker non disponibili per la verifica audit',
      };
    }

    const applicationErrors = readApplicationErrors(application);
    const traces = readTrackerTraces(tracker);
    const gateway = readGatewayCounts(apiGateway);
    const expectedBucket = `interop-generated-jwt-details-fallback-${environment}-es1`;
    const confirmedCids: string[] = [];
    const unresolvedCids: string[] = [];
    for (const cid of new Set([...applicationErrors.failedCids, ...traces.failedCids])) {
      (hasCompletedFallback(traces.messages.get(cid) ?? [], expectedBucket) ? confirmedCids : unresolvedCids).push(cid);
    }

    // A saturated or failed read (rows at the cap, unread pages, a CID left unread) may hide another fallback.
    const applicationEvidenceComplete = context.reads.isComplete(stepIds.queryApplicationLogs);
    const trackerEvidenceComplete = context.reads.isComplete(stepIds.queryCidTracker);
    const gatewayReadComplete = context.reads.isComplete(stepIds.queryApiGwAggregates);
    const apiGatewayEvidenceComplete = apiGateway.length > 0 && gatewayReadComplete;
    const sequenceConfirmed =
      applicationEvidenceComplete &&
      trackerEvidenceComplete &&
      confirmedCids.length > 0 &&
      unresolvedCids.length === 0 &&
      applicationErrors.uncorrelatedErrors === 0;
    // Derived from evidence: `unknown` when that evidence is incomplete, never a certain `false`.
    // A certain `false` (no fallback sequence) lets the WAF case close the alarm: every read must be complete,
    // the API Gateway aggregates included.
    const sequenceState = sequenceConfirmed
      ? 'true'
      : applicationEvidenceComplete && trackerEvidenceComplete && gatewayReadComplete
        ? 'false'
        : 'unknown';
    // Aggregates do not expose the application CID: access-log request counts cannot be
    // compared with deduplicated application CIDs because retries may emit multiple 5xx.
    // Keep the evidence fail-closed on truncation/malformed counts and reject an explicit
    // gateway-side integration error, without pretending the two cardinalities correlate.
    const confirmed =
      sequenceConfirmed &&
      applicationErrors.additionalApplicationErrors === 0 &&
      traces.additionalTrackerErrors === 0 &&
      apiGatewayEvidenceComplete &&
      gateway.countsValid &&
      gateway.integrationErrorCount === 0;
    const output: AuditFallbackAnalysis = {
      confirmedCids,
      unresolvedCids,
      uncorrelatedErrors: applicationErrors.uncorrelatedErrors,
      additionalApplicationErrors: applicationErrors.additionalApplicationErrors,
      additionalTrackerErrors: traces.additionalTrackerErrors,
      applicationEvidenceComplete,
      apiGatewayErrorCount: gateway.errorCount,
      apiGatewayIntegrationErrorCount: gateway.integrationErrorCount,
      apiGatewayCountsValid: gateway.countsValid,
      apiGatewayEvidenceComplete,
    };
    context.services.reporter.add({
      label:
        `Fallback audit: ${confirmedCids.length} CID confermati, ${unresolvedCids.length} da verificare, ` +
        `${output.uncorrelatedErrors} errori senza CID, ${output.additionalApplicationErrors} errori applicativi aggiuntivi, ` +
        `${output.additionalTrackerErrors} errori aggiuntivi nel CID tracker, ` +
        `${output.apiGatewayErrorCount} errori API Gateway (${output.apiGatewayIntegrationErrorCount} di integrazione), ` +
        `evidenza applicativa ${applicationEvidenceComplete ? 'completa' : 'potenzialmente troncata'}, ` +
        `evidenza API Gateway ${apiGatewayEvidenceComplete ? 'completa' : 'potenzialmente troncata'}`,
    });
    return {
      success: true,
      output,
      vars: {
        [AUDIT_FALLBACK_SEQUENCE_CONFIRMED_VAR]: sequenceState,
        [AUDIT_FALLBACK_CONFIRMED_VAR]: String(confirmed),
      },
    };
  }
}

/** The audit failures of the application errors: the CIDs they carry, the ones without CID, the other errors. */
function readApplicationErrors(application: CloudWatchLogsRows): {
  readonly failedCids: ReadonlyArray<string>;
  readonly uncorrelatedErrors: number;
  readonly additionalApplicationErrors: number;
} {
  const failedCids: string[] = [];
  let uncorrelatedErrors = 0;
  let additionalApplicationErrors = 0;
  for (const row of application) {
    const { message, cid } = readInteropLogRow(row);
    if (!isAuditFailure(message)) additionalApplicationErrors += 1;
    else if (cid === undefined) uncorrelatedErrors += 1;
    else failedCids.push(cid);
  }
  return { failedCids, uncorrelatedErrors, additionalApplicationErrors };
}

/**
 * The fallback evidence the tracker holds for each CID, the CIDs whose trace shows an audit failure and the errors of
 * the traced services outside the sequence.
 */
function readTrackerTraces(tracker: NonNullable<ReturnType<typeof readCidTrackerResults>>): {
  readonly messages: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly failedCids: ReadonlyArray<string>;
  readonly additionalTrackerErrors: number;
} {
  const messages = new Map<string, ReadonlyArray<string>>();
  const failedCids: string[] = [];
  let additionalTrackerErrors = 0;
  for (const entry of tracker) {
    if (entry.cid.trim() === '') continue;
    const evidence = entry.rows.flatMap((row) => {
      const { message, podApp } = readInteropLogRow(row);
      // Only the fallback sequence is trusted from the auth server; the two portable fallback markers may instead
      // come from a correlated writer service. Any other error of either makes the recovery outcome unsafe to close.
      const trusted = podApp.startsWith('interop-be-authorization-server')
        ? isAuditFailure(message) || isPortableFallbackEvidence(message) || message.includes('Token generated')
        : !isTrackerError(row, message) && isPortableFallbackEvidence(message);
      if (trusted) return [message];
      if (isTrackerError(row, message)) additionalTrackerErrors += 1;
      return [];
    });
    messages.set(entry.cid, evidence);
    if (evidence.some(isAuditFailure)) failedCids.push(entry.cid);
  }
  return { messages, failedCids, additionalTrackerErrors };
}

/** The API Gateway 5xx of the aggregates, those with an integration error, and whether every count was valid. */
function readGatewayCounts(apiGateway: CloudWatchLogsRows): {
  readonly errorCount: number;
  readonly integrationErrorCount: number;
  readonly countsValid: boolean;
} {
  let errorCount = 0;
  let integrationErrorCount = 0;
  let countsValid = true;
  for (const row of apiGateway) {
    const count = readAggregateCount(row);
    if (count === undefined) countsValid = false;
    else errorCount += count;
    if (normalizeInteropApiGwAggregateValue(readRowField(row, 'integrationError')) !== undefined) {
      integrationErrorCount += count ?? 1;
    }
  }
  return { errorCount, integrationErrorCount, countsValid };
}

function readAggregateCount(row: CloudWatchLogsRow): number | undefined {
  const count = Number(readRowField(row, 'count'));
  return Number.isSafeInteger(count) && count > 0 ? count : undefined;
}

function isAuditFailure(message: string): boolean {
  return (
    message.includes(AUDIT_FALLBACK_PATTERN) || /Timeout while acquiring lock[^\n]*connect to broker/u.test(message)
  );
}

function isPortableFallbackEvidence(message: string): boolean {
  return FALLBACK_STORAGE_PATTERN.test(message) || message.includes(AUDIT_FALLBACK_SUCCEEDED_PATTERN);
}

function isTrackerError(row: CloudWatchLogsRow, message: string): boolean {
  return (
    readRowField(row, 'stream') === 'stderr' ||
    message.includes('ERROR') ||
    readRowField(row, '@message')?.includes('ERROR') === true
  );
}

/**
 * Whether the messages of a CID end with the whole fallback sequence, in order, after the last audit failure: a
 * later failure invalidates an earlier success, and a lock timeout without fallback restarts from nothing.
 */
function hasCompletedFallback(messages: ReadonlyArray<string>, expectedBucket: string): boolean {
  let reached = 0;
  for (const markers of markerGroups(messages, expectedBucket)) {
    if (markers.has('fallback')) reached = 1;
    else if (markers.has('lock-timeout')) reached = 0;
    if (reached === 0) continue;
    // Markers at the same time are checked for presence together, without relying on their ingestion order.
    for (const next of FALLBACK_SEQUENCE.slice(reached)) {
      if (!markers.has(next)) break;
      reached += 1;
    }
  }
  return reached === FALLBACK_SEQUENCE.length;
}

/**
 * The markers of the messages, grouped by time. CloudWatch collection timestamps can reorder application events:
 * when every message has an embedded ISO time they are ordered by it, and messages at the same time are one group;
 * otherwise each message is a group, in the chronological order supplied by the tracker.
 */
function markerGroups(
  messages: ReadonlyArray<string>,
  expectedBucket: string,
): ReadonlyArray<ReadonlySet<(typeof FALLBACK_SEQUENCE)[number] | 'lock-timeout'>> {
  const timed = messages.map((message) => {
    const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\b/u.exec(message)?.[0];
    return {
      marker: markerOf(message, expectedBucket),
      time: timestamp === undefined ? Number.NaN : Date.parse(timestamp),
    };
  });
  if (!timed.every(({ time }) => Number.isFinite(time))) {
    return timed.map(({ marker }) => new Set(marker === undefined ? [] : [marker]));
  }
  timed.sort((left, right) => left.time - right.time);
  const groups: Set<(typeof FALLBACK_SEQUENCE)[number] | 'lock-timeout'>[] = [];
  let groupTime = Number.NaN;
  for (const { marker, time } of timed) {
    if (time !== groupTime || groups.length === 0) {
      groups.push(new Set());
      groupTime = time;
    }
    if (marker !== undefined) groups[groups.length - 1]?.add(marker);
  }
  return groups;
}

/** The fallback marker a message writes, if any. */
function markerOf(
  message: string,
  expectedBucket: string,
): (typeof FALLBACK_SEQUENCE)[number] | 'lock-timeout' | undefined {
  if (isAuditFailure(message)) return message.includes(AUDIT_FALLBACK_PATTERN) ? 'fallback' : 'lock-timeout';
  if (FALLBACK_STORAGE_PATTERN.exec(message)?.[1] === expectedBucket) return 'stored';
  if (message.includes(AUDIT_FALLBACK_SUCCEEDED_PATTERN)) return 'succeeded';
  if (message.includes('Token generated')) return 'token';
  return undefined;
}
