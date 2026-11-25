import type { RunbookContext, Step, StepResult } from '../../../../engine/index.js';
import {
  type InteropLogRow,
  readCidTrackerResults,
  readCloudWatchResultRows,
  readInteropLogRow,
} from '../../../../toolkits/interop/index.js';
import { BFF_ALARM } from './alarmDefinition.js';
import type { BffCaseEvidence } from './BffCaseEvidence.js';
import type { RequestEvidence } from './RequestEvidence.js';

export const BFF_EVIDENCE_STEP_ID = 'analyze-bff-case-evidence';

const UNREAD_NOTIFICATIONS_401 =
  /Error while fetching unread notifications: AxiosError: Request failed with status code 401\b/u;
const TOKEN_EXPIRED = 'Token verification failed: TokenExpiredError: jwt expired';
const USERS_RETRIEVAL_ERROR = 'Error while retrieving users corresponding to tenant';
const SELFCARE_504 = /errors:\s*008-9991[^\r\n]*AxiosError: Request failed with status code 504\b/u;

/** Keeps the emitting service and CID boundary when matching the documented BFF cases. */
export class AnalyzeBffEvidenceStep implements Step<BffCaseEvidence> {
  readonly id: string = BFF_EVIDENCE_STEP_ID;
  readonly label = 'Correlazione degli errori BFF per servizio e CID';
  readonly kind = 'transform' as const;

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<BffCaseEvidence>> {
    const application = readCloudWatchResultRows(context.stepResults.get(BFF_ALARM.stepIds.queryApplicationLogs));
    const tracker = readCidTrackerResults(context.stepResults.get(BFF_ALARM.stepIds.queryCidTracker));
    if (application === undefined || tracker === undefined) {
      return { success: false, error: 'Log applicativi BFF o CID tracker non disponibili' };
    }

    const bffRows = application.map((row) => readInteropLogRow(row)).filter((row) => row.podApp === BFF_ALARM.podApp);
    const purposeRows: InteropLogRow[] = [];
    // The tracker reads again the BFF rows of the window: a row already read counts once.
    const seen = new Set(bffRows.map((row) => evidenceIdentity(row)));
    const requests = new Map<string, InteropLogRow[]>();
    for (const row of bffRows) {
      if (row.cid === undefined) continue;
      const logs = requests.get(row.cid) ?? [];
      logs.push(row);
      requests.set(row.cid, logs);
    }
    for (const entry of tracker) {
      const logs = requests.get(entry.cid);
      if (logs === undefined) continue;
      for (const raw of entry.rows) {
        const row = readInteropLogRow(raw, entry.cid);
        const identity = evidenceIdentity(row);
        if (seen.has(identity)) continue;
        seen.add(identity);
        logs.push(row);
        if (row.podApp === BFF_ALARM.podApp) bffRows.push(row);
        else if (row.podApp === 'interop-be-purpose-process') purposeRows.push(row);
      }
    }

    const expiredNotificationRequests: RequestEvidence[] = [];
    const selfcareUsersTimeouts: RequestEvidence[] = [];
    for (const [cid, logs] of requests) {
      const own = logs.filter((row) => row.podApp === BFF_ALARM.podApp);
      const unauthorized = own.filter(({ message }) => UNREAD_NOTIFICATIONS_401.test(message));
      const expired = logs.filter(({ message }) => message.includes(TOKEN_EXPIRED));
      if (unauthorized.length > 0 && expired.length > 0) {
        expiredNotificationRequests.push({ cid, logs, supportingRows: [...unauthorized, ...expired] });
      }
      const usersErrors = own.filter(({ message }) => message.includes(USERS_RETRIEVAL_ERROR));
      const timeouts = own.filter(({ message }) => SELFCARE_504.test(message));
      if (usersErrors.length > 0 && timeouts.length > 0) {
        selfcareUsersTimeouts.push({ cid, logs: own, supportingRows: [...usersErrors, ...timeouts] });
      }
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

/** The identity of a log row across the reads of the window and of the tracker: service, time and message. */
function evidenceIdentity(row: InteropLogRow): string {
  return `${row.podApp}\u0001${row.timestamp ?? ''}\u0001${row.message}`;
}
