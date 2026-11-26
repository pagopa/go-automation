import { lambda } from '../../../../toolkits/send/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { METADATA_STATUS_UPDATER_ESM_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAMS, LAMBDA_FUNCTION } from './knownServices.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3464888321/pn-MetadataStatusUpdaterLambda-ESM-Alarm';

/**
 * Builds the pn-MetadataStatusUpdaterLambda-ESM-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return lambda.createSendLambdaAlarmRunbook({
    id: METADATA_STATUS_UPDATER_ESM_ALARM,
    metadata: {
      name: METADATA_STATUS_UPDATER_ESM_ALARM,
      description:
        'Analizza i fallimenti di elaborazione degli eventi Kinesis della lambda pn-delivery-metadata-status-updater-lambda.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-delivery', 'metadata-status-updater', 'kinesis', 'esm'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: METADATA_STATUS_UPDATER_ESM_ALARM,
      links: [{ url: RUNBOOK_URL, name: METADATA_STATUS_UPDATER_ESM_ALARM, type: 'CONFLUENCE' }],
    },
  });
}
