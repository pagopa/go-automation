import { lambda, knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

const SLOW_DOWN_PATTERN =
  'Invoke Error[\\s\\S]*errorType[\\s\\S]*SlowDown[\\s\\S]*errorMessage[\\s\\S]*Please reduce your request rate\\.[\\s\\S]*httpStatusCode[\\s\\S]*503';

const SLOW_DOWN_RESOLUTION =
  'Verificare frequenza e persistenza degli errori SlowDown nel log group omonimo sia nell’account core sia ' +
  'nell’account confinfo. Per ogni requestId coinvolto cercare nel flusso ricostruito un successivo marker ' +
  '`Written <N> record(s) to s3://.../downstream-http-call/...`: la sua assenza indica che il recupero non è ' +
  'confermato. Controllare metriche e concorrenza della Lambda e il throttling S3. Mantenere l’allarme in lavorazione ' +
  'finché Infra non completa la remediation; chiudere solo dopo aver verificato il recupero dei record e l’assenza di ' +
  'nuove occorrenze in una finestra successiva.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'downstream-monitoring-aws-slow-down',
    description: 'AWS SlowDown HTTP 503: frequenza delle richieste da ridurre',
    priority: 120,
    condition: lambdaLogEvidenceMatches(SLOW_DOWN_PATTERN),
    title: 'Throttling S3 nella Lambda downstream monitoring (SlowDown 503)',
    resolution: SLOW_DOWN_RESOLUTION,
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['Categoria', '{{vars.lambdaErrorCategory}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'La scrittura nel bucket pn-datamonitoring ha ricevuto una risposta S3 SlowDown con HTTP 503.',
      finalActions: [
        'Controllare /aws/lambda/pn-downstream-monitoring-lambda nell’account core',
        'Controllare /aws/lambda/pn-downstream-monitoring-lambda nell’account confinfo',
        'Correlare ogni SlowDown con il successivo marker Written sullo stesso requestId',
        'Verificare metriche e concorrenza della Lambda e il throttling S3',
        'Confermare l’assenza di nuove occorrenze dopo la remediation Infra',
      ],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
