import { lambda, knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

const SLOW_DOWN_PATTERN =
  'Invoke Error[\\s\\S]*errorType[\\s\\S]*SlowDown[\\s\\S]*errorMessage[\\s\\S]*Please reduce your request rate\\.[\\s\\S]*httpStatusCode[\\s\\S]*503';

const SLOW_DOWN_RESOLUTION =
  'Verificare gli errori SlowDown nei log della Lambda negli account core e confinfo e consultare i grafici nella ' +
  'sezione Monitoring della Lambda. Infra sta valutando un intervento lato Lambda/S3; la pagina non documenta ' +
  'ancora una risoluzione conclusa. Mantenere l’analisi aperta e seguire la valutazione di Infra.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'downstream-monitoring-aws-slow-down',
    description: 'AWS SlowDown HTTP 503: frequenza delle richieste da ridurre',
    priority: 120,
    condition: lambdaLogEvidenceMatches(SLOW_DOWN_PATTERN),
    title: 'Errore SlowDown 503 nella Lambda downstream monitoring',
    resolution: SLOW_DOWN_RESOLUTION,
    details: [
      ['Errore', 'SlowDown: Please reduce your request rate.'],
      ['HTTP', '503'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Errore di invocazione SlowDown con HTTP 503 e messaggio Please reduce your request rate.',
      finalActions: [
        'Controllare /aws/lambda/pn-downstream-monitoring-lambda nell’account core',
        'Controllare /aws/lambda/pn-downstream-monitoring-lambda nell’account confinfo',
        'Consultare i grafici nella sezione Monitoring della Lambda',
        'Seguire la valutazione di Infra su Lambda/S3',
      ],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
