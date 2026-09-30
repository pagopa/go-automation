import { lambda } from '../framework.js';
import type { Runbook } from '../framework.js';

import { CDC_PREPROC_DATA_QUALITY_FILTER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { DOWNSTREAMS, LAMBDA_FUNCTION } from './knownServices.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3285942423/pn-cdc-preproc-data-quality-filter-LogInvocationErrors-Alarm';
const CDC_DESIGN_URL =
  'https://pagopa.atlassian.net/wiki/spaces/SENDFE/pages/3254747173/2026+Lambda+di+Pre-processing+e+Data+Quality';

export function buildRunbook(): Runbook {
  return lambda.createLambdaAlarmRunbook({
    id: CDC_PREPROC_DATA_QUALITY_FILTER_ALARM,
    metadata: {
      name: CDC_PREPROC_DATA_QUALITY_FILTER_ALARM,
      description: 'Analizza gli allarmi di log e invocazione della Lambda CDC di preprocessing e data quality.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['lambda', 'pn-cdc', 'data-quality', 'quarantine', 'firehose'],
    },
    lambda: LAMBDA_FUNCTION,
    downstreams: DOWNSTREAMS,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: CDC_PREPROC_DATA_QUALITY_FILTER_ALARM,
      links: [
        { url: RUNBOOK_URL, name: CDC_PREPROC_DATA_QUALITY_FILTER_ALARM, type: 'CONFLUENCE' },
        { url: CDC_DESIGN_URL, name: 'Lambda di Pre-processing e Data Quality', type: 'CONFLUENCE' },
      ],
    },
  });
}
