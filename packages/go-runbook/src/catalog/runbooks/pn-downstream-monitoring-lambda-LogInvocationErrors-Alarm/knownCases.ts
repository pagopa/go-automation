import { lambda, knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';
import { all, not } from '../common/conditions.js';
import { varEquals } from '../common/varConditions.js';

// Match exact JSON keys and values, in any order, in raw or serialized log evidence.
const QUOTE = '\\\\*"';
const SLOW_DOWN_PATTERN =
  '^(?=[\\s\\S]*Invoke Error\\b)' +
  `(?=[\\s\\S]*${QUOTE}errorType${QUOTE}\\s*:\\s*${QUOTE}SlowDown${QUOTE})` +
  `(?=[\\s\\S]*${QUOTE}errorMessage${QUOTE}\\s*:\\s*${QUOTE}Please reduce your request rate\\.${QUOTE})` +
  `(?=[\\s\\S]*${QUOTE}httpStatusCode${QUOTE}\\s*:\\s*503(?=\\s*[,}]))`;
const S3_SLOW_DOWN = lambdaLogEvidenceMatches(
  `${SLOW_DOWN_PATTERN}(?=[\\s\\S]*(?:S3RestXmlProtocol\\b|middleware-sdk-s3/))`,
);
const RECOVERED = varEquals('downstreamMonitoringS3Recovery', 'RECOVERED_ALL');

const FEEDBACK_ACTION =
  "Ho dubbi sulla criticità dell'allarme, riporto nel canale ufficiale il link all'analisi e chiedo un feedback al team Architettura";

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'downstream-monitoring-s3-slow-down-recovered',
    description: 'SlowDown S3 recuperato per tutte le richieste fallite nei due account verificati',
    priority: 140,
    condition: RECOVERED,
    title: 'SlowDown S3 recuperato dal retry',
    resolution:
      'Verificati core e confinfo: ogni richiesta fallita per SlowDown S3 ha una scrittura successiva ' +
      'dello stesso numero di record e un REPORT completato, nello stesso account e con lo stesso Lambda request ID. ' +
      'Nessun altro tipo di errore è presente nella scansione. Il recupero osservato non è una correzione definitiva: ' +
      'monitorare la ricorrenza e verificare con Infra lo stato dell’eventuale intervento citato nella segnalazione storica.',
    details: [
      ['Account con errori', '{{vars.downstreamMonitoringErrorAccounts}}'],
      ['Richieste recuperate', '{{vars.downstreamMonitoringS3RecoveredRequestCount}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: ['Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto'],
    },
  }),
  knownCase({
    id: 'downstream-monitoring-s3-slow-down',
    description: 'S3 restituisce SlowDown 503 durante l’esecuzione della Lambda',
    priority: 130,
    condition: all(S3_SLOW_DOWN, not(RECOVERED)),
    title: 'Errore S3 SlowDown 503 — recupero da verificare',
    resolution:
      'Lo stack identifica S3 come servizio che restituisce SlowDown 503: non attribuire l’errore al limite ' +
      'di invocazione della Lambda. Controllare i log in account core e confinfo, il flusso per ogni Lambda request ID ' +
      'e la successiva scrittura dei record. Consultare la sezione Monitoring della Lambda e le evidenze S3. ' +
      'Mantenere l’analisi aperta se il recupero è assente, parziale o non verificabile; condividere con Infra ' +
      'bucket, prefisso, request ID S3 e retry osservati. La valutazione Infra dell’8 settembre è un riferimento storico.',
    level: 'warn',
    details: [
      ['Account con errori', '{{vars.downstreamMonitoringErrorAccounts}}'],
      ['Lambda request ID', '{{vars.lambdaRequestId}}'],
      [
        'Recuperate',
        '{{vars.downstreamMonitoringS3RecoveredRequestCount}}/{{vars.downstreamMonitoringS3RequestCount}}',
      ],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'La chiamata S3 restituisce SlowDown HTTP 503; il recupero delle scritture non è confermato per tutte le richieste.',
      finalActions: [FEEDBACK_ACTION],
    },
  }),
  knownCase({
    id: 'downstream-monitoring-aws-slow-down',
    description: 'AWS SlowDown HTTP 503: servizio e recupero da verificare',
    priority: 120,
    condition: all(lambdaLogEvidenceMatches(SLOW_DOWN_PATTERN), not(S3_SLOW_DOWN)),
    title: 'Errore SlowDown 503 nella Lambda downstream monitoring',
    resolution:
      'Verificare gli errori SlowDown nei log della Lambda negli account core e confinfo e consultare i grafici nella ' +
      'sezione Monitoring della Lambda. Identificare il servizio AWS chiamato tramite lo stack e i log precedenti: ' +
      'il solo messaggio SlowDown non dimostra il throttling della Lambda. Ricostruire tutti i retry e gli esiti per request ID. ' +
      'Mantenere l’analisi aperta finché causa e recupero non sono verificati; verificare con Infra lo stato della segnalazione storica.',
    details: [
      ['Errore', 'SlowDown: Please reduce your request rate.'],
      ['HTTP', '503'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Errore di invocazione SlowDown con HTTP 503 e messaggio Please reduce your request rate.',
      finalActions: [FEEDBACK_ACTION],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES.map((runtimeCase) =>
    knownCase({
      id: runtimeCase.id,
      description: runtimeCase.description,
      priority: runtimeCase.priority,
      condition: runtimeCase.condition,
      resolution:
        runtimeCase.id === 'lambda-timeout'
          ? 'Verificare durata e timeout configurato, individuare la chiamata interrotta e controllare i retry ' +
            'del batch nell’account di origine. Mantenere l’analisi aperta se causa o recupero non sono verificati.'
          : 'Verificare l’eccezione, lo stack e il REPORT per confermare la causa di memoria o del processo terminato. ' +
            'Controllare l’esito del batch e valutare con Infra un eventuale intervento di configurazione; ' +
            'mantenere l’analisi aperta se il recupero non è verificato.',
      level: 'warn',
      details: [
        ['Account con errori', '{{vars.downstreamMonitoringErrorAccounts}}'],
        ['Lambda request ID', '{{vars.lambdaRequestId}}'],
      ],
      analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [FEEDBACK_ACTION] },
    }),
  ),
];
