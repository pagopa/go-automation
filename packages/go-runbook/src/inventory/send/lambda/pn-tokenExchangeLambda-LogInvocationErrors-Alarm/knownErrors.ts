/**
 * Known errors for the pn-tokenExchangeLambda-LogInvocationErrors-Alarm runbook.
 *
 * Shared runtime cases (timeout / out-of-memory) are spread in from
 * `lambda.LAMBDA_RUNTIME_KNOWN_ERRORS`; the cases below are alarm-specific
 * (downstream pn-emd-integration), matched on the log rows.
 */
import { knownError, lambda, lambdaLogEvidenceMatches } from '../../../../toolkits/send/index.js';
import type { KnownError } from '../../../../engine/index.js';
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_ERRORS,
  knownError({
    code: 'SEND_LAMBDA_PTELLIEA_EMD-RET-ID-SIZ',
    description: '[DOWNSTREAM pn-emd-integration] retrievalId con dimensione non valida (HTTP 400)',
    condition: lambdaLogEvidenceMatches('size must be between 50 and 50'),
    title: '[DOWNSTREAM pn-emd-integration] retrievalId: size must be between 50 and 50 (HTTP 400)',
    resolution: 'Risoluzione non documentata.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_PTELLIEA_EMD-GET-RET-ID-KO',
    description: '[DOWNSTREAM pn-emd-integration] impossibile individuare il retrievalId (HTTP 404)',
    condition: lambdaLogEvidenceMatches('Error in get retrievalId'),
    title: '[DOWNSTREAM pn-emd-integration] GenerateKoResponse: Error in get retrievalId (HTTP 404)',
    resolution:
      'Nessuna azione da intraprendere in quanto il servizio non \u00E8 ancora abilitato e dunque non ancora in funzione.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_PTELLIEA_EMD-GET-RET-PAY-KO',
    description: '[DOWNSTREAM pn-emd-integration] errore nel recupero del retrieval payload (HTTP 404)',
    condition: lambdaLogEvidenceMatches('Error getting retrieval payload'),
    title: '[DOWNSTREAM pn-emd-integration] Ending process _tokenCheckTPP: Error getting retrieval payload (HTTP 404)',
    resolution:
      'Nessuna azione da intraprendere in quanto il servizio non \u00E8 ancora abilitato e dunque non ancora in funzione. Da confermare. Dai log \u00E8 possibile notare la stringa [Service disabled]',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
