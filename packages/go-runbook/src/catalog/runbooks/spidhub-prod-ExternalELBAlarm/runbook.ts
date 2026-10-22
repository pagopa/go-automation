import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import type { Runbook } from '../framework.js';
import {
  SPIDHUB_ALARM,
  RUNBOOK_URL,
  SPIDHUB_ACCOUNT_ID,
  SPIDHUB_LOG_GROUP,
  SPIDHUB_REGION,
} from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { QuerySpidHubDiagnosticsStep } from './QuerySpidHubDiagnosticsStep.js';

export function buildRunbook(): Runbook {
  const builder = RunbookBuilder.create(SPIDHUB_ALARM)
    .metadata({
      name: SPIDHUB_ALARM,
      description:
        'Raccoglie gli errori e gli stream SPID Hub e prepara la correlazione con le richieste del load balancer.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'spidhub', 'alb', 'saml', 'authentication'],
    })
    .cloudExecutionPolicy({ sideEffects: 'NONE' })
    .occurrenceTimeWindow({ beforeMinutes: 5, afterMinutes: 5 })
    .output({
      metadata: {
        service: 'pn-hub-spid-login-aws',
        logGroup: SPIDHUB_LOG_GROUP,
        accountId: SPIDHUB_ACCOUNT_ID,
        region: SPIDHUB_REGION,
        albCorrelation: 'MANUAL',
      },
      fields: [
        { name: 'alarmName', label: 'Alarm', ref: 'params.alarmName', valueType: 'string' },
        {
          name: 'spidHubDiagnostics',
          label: 'Diagnostica SPID Hub',
          ref: 'vars.spidHubDiagnostics',
          valueType: 'string',
        },
        {
          name: 'spidHubErrorLogCount',
          label: 'Log di errore',
          ref: 'vars.spidHubErrorLogCount',
          valueType: 'integer',
        },
        { name: 'spidHubStreamCount', label: 'Stream osservati', ref: 'vars.spidHubStreamCount', valueType: 'integer' },
        {
          name: 'spidHubResponderCount',
          label: 'Errori SAML Responder',
          ref: 'vars.spidHubResponderCount',
          valueType: 'integer',
        },
        {
          name: 'spidHubHeadersSentCount',
          label: 'Errori headers già inviati',
          ref: 'vars.spidHubHeadersSentCount',
          valueType: 'integer',
        },
      ],
    })
    .analysisDefaults({
      runbookName: SPIDHUB_ALARM,
      resources: [{ name: 'pn-hub-spid-login-aws', type: 'Service', role: 'PRIMARY' }],
      links: [{ url: RUNBOOK_URL, name: SPIDHUB_ALARM, type: 'CONFLUENCE' }],
    })
    .step(new QuerySpidHubDiagnosticsStep(), {
      silent: true,
      evidence: [
        {
          id: 'spidhub-errors',
          label: 'Errori applicativi SPID Hub',
          type: 'log-sample',
          filter: { field: 'queryKind', equals: 'errors' },
          retention: { mode: 'latest', limit: 5, timestampField: '@timestamp' },
        },
        {
          id: 'spidhub-streams',
          label: 'Stream applicativi SPID Hub',
          type: 'step-output',
          filter: { field: 'queryKind', equals: 'streams' },
          retention: { mode: 'latest', limit: 5, timestampField: 'lastLog' },
        },
      ],
    });
  for (const knownCase of KNOWN_CASES) builder.knownCase(knownCase);
  return builder
    .fallback(unknownCaseFallback('Diagnosi SPID Hub non disponibile', [['Azione', 'Risoluzione non documentata.']]))
    .build();
}
