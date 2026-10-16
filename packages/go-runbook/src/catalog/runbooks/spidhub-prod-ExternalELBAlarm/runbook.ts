import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import type { Runbook } from '../framework.js';
import { SPIDHUB_ALARM, RUNBOOK_URL } from './alarmDefinition.js';
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
    .analysisDefaults({
      runbookName: SPIDHUB_ALARM,
      resources: [{ name: 'pn-hub-spid-login-aws', type: 'Service', role: 'PRIMARY' }],
      links: [{ url: RUNBOOK_URL, name: SPIDHUB_ALARM, type: 'CONFLUENCE' }],
    })
    .step(new QuerySpidHubDiagnosticsStep(), { silent: true });
  for (const knownCase of KNOWN_CASES) builder.knownCase(knownCase);
  return builder
    .fallback(
      unknownCaseFallback('Diagnosi SPID Hub non disponibile', [
        [
          'Azione',
          'Verificare accesso a confinfo, regione e finestra; proseguire con la correlazione degli access log ALB.',
        ],
      ]),
    )
    .build();
}
