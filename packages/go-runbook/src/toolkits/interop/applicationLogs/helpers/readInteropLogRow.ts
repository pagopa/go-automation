import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { trimToUndefined } from '@pagopa/go-common/utils';

import { INTEROP_CID_PATTERN } from './INTEROP_CID_PATTERN.js';
import type { InteropLogRow } from './InteropLogRow.js';
import type { CloudWatchLogsRow } from '../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

/**
 * Reads an INTEROP application log row: the message is the `log` of a k8s JSON envelope, or the raw line; the pod
 * app is the `pod_app` field, or the one of the envelope; the CID is the one of the tracker read, the `cid`/`CID`
 * field, or the one the message writes.
 *
 * @param row - Logs Insights row of an application or CID tracker query
 * @param trackerCid - CID of the tracker read the row comes from
 * @returns The row, without blank CID and time
 *
 * @example
 * ```typescript
 * readInteropLogRow([{ field: '@message', value: 'ERROR [CID=abc] boom' }]).cid; // 'abc'
 * ```
 */
export function readInteropLogRow(row: CloudWatchLogsRow, trackerCid?: string): InteropLogRow {
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
    trimToUndefined(trackerCid ?? readRowField(row, 'cid') ?? readRowField(row, 'CID')) ??
    INTEROP_CID_PATTERN.exec(message)?.[1];
  const timestamp = readRowField(row, '@timestamp');
  return {
    podApp,
    message,
    ...(cid === undefined ? {} : { cid }),
    ...(timestamp === undefined || timestamp.trim() === '' ? {} : { timestamp }),
  };
}
