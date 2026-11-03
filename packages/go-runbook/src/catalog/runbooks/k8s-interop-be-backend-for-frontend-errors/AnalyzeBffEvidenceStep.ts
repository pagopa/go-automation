import { readRowField, type ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import { readCloudWatchResultRows } from '../../../steps/data/readCloudWatchResultRows.js';
import { BFF_ALARM } from './alarmDefinition.js';

export const BFF_EVIDENCE_STEP_ID = 'analyze-bff-case-evidence';

interface LogEvidence {
  readonly podApp: string;
  readonly message: string;
  readonly cid?: string;
}

interface RequestEvidence {
  readonly cid: string;
  readonly logs: ReadonlyArray<LogEvidence>;
}

interface BffCaseEvidence {
  readonly bffRows: ReadonlyArray<LogEvidence>;
  readonly purposeRows: ReadonlyArray<LogEvidence>;
  readonly expiredNotificationRequests: ReadonlyArray<RequestEvidence>;
  readonly selfcareUsersTimeouts: ReadonlyArray<RequestEvidence>;
}

/** Keeps the emitting service and CID boundary when matching the documented BFF cases. */
export class AnalyzeBffEvidenceStep implements Step<BffCaseEvidence> {
  readonly id: string = BFF_EVIDENCE_STEP_ID;
  readonly label = 'Correlazione degli errori BFF per servizio e CID';
  readonly kind = 'transform' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<BffCaseEvidence>> {
    const application = readCloudWatchResultRows(context.stepResults.get(BFF_ALARM.stepIds.queryApplicationLogs));
    const tracker: unknown = context.stepResults.get(BFF_ALARM.stepIds.queryCidTracker);
    if (application === undefined || !Array.isArray(tracker)) {
      return { success: false, error: 'Log applicativi BFF o CID tracker non disponibili' };
    }

    const bffRows = application.map((row) => normalizeRow(row)).filter((row) => row.podApp === BFF_ALARM.podApp);
    const purposeRows: LogEvidence[] = [];
    const requests = new Map<string, LogEvidence[]>();
    for (const row of bffRows) {
      if (row.cid === undefined) continue;
      const logs = requests.get(row.cid) ?? [];
      logs.push(row);
      requests.set(row.cid, logs);
    }
    for (const entry of tracker as unknown[]) {
      if (typeof entry !== 'object' || entry === null || !('cid' in entry) || !('rows' in entry)) continue;
      if (typeof entry.cid !== 'string') continue;
      const logs = requests.get(entry.cid);
      const rows = readCloudWatchResultRows(entry.rows);
      if (logs === undefined || rows === undefined) continue;
      for (const raw of rows) {
        const row = normalizeRow(raw, entry.cid);
        logs.push(row);
        if (row.podApp === BFF_ALARM.podApp) bffRows.push(row);
        else if (row.podApp === 'interop-be-purpose-process') purposeRows.push(row);
      }
    }

    const expiredNotificationRequests: RequestEvidence[] = [];
    const selfcareUsersTimeouts: RequestEvidence[] = [];
    for (const [cid, logs] of requests) {
      const own = logs.filter((row) => row.podApp === BFF_ALARM.podApp);
      if (
        own.some(({ message }) =>
          /Error while fetching unread notifications: AxiosError: Request failed with status code 401\b/u.test(message),
        ) &&
        logs.some(({ message }) => message.includes('Token verification failed: TokenExpiredError: jwt expired'))
      )
        expiredNotificationRequests.push({ cid, logs });
      if (
        own.some(({ message }) => message.includes('Error while retrieving users corresponding to tenant')) &&
        own.some(({ message }) =>
          /errors:\s*008-9991[^\r\n]*AxiosError: Request failed with status code 504\b/u.test(message),
        )
      )
        selfcareUsersTimeouts.push({ cid, logs: own });
    }

    context.services.reporter.add({
      label:
        `Evidenze BFF: ${bffRows.length} righe, ${purposeRows.length} righe purpose-process, ` +
        `${expiredNotificationRequests.length} CID con notifiche 401 e token scaduto, ` +
        `${selfcareUsersTimeouts.length} CID con recupero utenti in timeout`,
    });
    return { success: true, output: { bffRows, purposeRows, expiredNotificationRequests, selfcareUsersTimeouts } };
  }
}

function normalizeRow(row: ReadonlyArray<ResultField>, trackerCid?: string): LogEvidence {
  const raw = readRowField(row, 'log') ?? readRowField(row, '@message') ?? readRowField(row, 'message') ?? '';
  let message = raw;
  let podApp = readRowField(row, 'pod_app') ?? '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      if ('log' in parsed && typeof parsed.log === 'string') message = parsed.log;
      if (podApp === '' && 'pod_app' in parsed && typeof parsed.pod_app === 'string') podApp = parsed.pod_app;
    }
  } catch {
    // Plain application log.
  }
  const cid =
    trackerCid ?? readRowField(row, 'cid') ?? readRowField(row, 'CID') ?? /\bCID=([^\]\s,"']+)/u.exec(message)?.[1];
  return { podApp, message, ...(cid === undefined || cid.trim() === '' ? {} : { cid }) };
}
