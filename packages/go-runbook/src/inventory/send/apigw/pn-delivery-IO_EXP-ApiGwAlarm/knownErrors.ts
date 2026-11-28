import { downstreamMarkerPattern, knownError, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import {
  all,
  any,
  type KnownError,
  stepEvidenceMatches,
  varEquals,
  varExists,
  varMatches,
} from '../../../../engine/index.js';

// Evaluate gateway cases only after the execution logs are grouped by request.
const EXECUTION_LOGS_GROUPED = { type: 'exists', ref: 'steps.resolve-api-gw-diagnosis' } as const;

export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_APIGW_PDIOEXPAGA_AUT-INV-504',
    description: 'Invocazione authorizer terminata con 504 senza Lambda request ID',
    condition: stepEvidenceMatches(
      'resolve-api-gw-diagnosis.requests',
      '^(?=[\\s\\S]*Lambda invocation failed with status: 504\\. Lambda request id: N/A)' +
        '(?=[\\s\\S]*AUTHORIZER_CONFIGURATION_ERROR)',
    ),
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-ioAuthorizerLambda' }],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_APIGW_PDIOEXPAGA_INT-SIG-MIS',
    description: 'Firma AWS non valida durante l’invocazione dell’integrazione',
    condition: all(
      EXECUTION_LOGS_GROUPED,
      stepEvidenceMatches(
        'query-api-gw-execution-logs',
        'Execution failed due to configuration error: The request signature we calculated does not match the signature you provided',
      ),
    ),
    resolution: 'Thread Slack 25/08/2026 - Apertura ticket AWS',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownError({
    code: 'SEND_APIGW_PDIOEXPAGA_AUT-CON-ERR',
    description: 'Errore nella fase di autorizzazione API Gateway',
    condition: all(
      EXECUTION_LOGS_GROUPED,
      stepEvidenceMatches(
        'query-api-gw-execution-logs',
        'Gateway response type: AUTHORIZER_CONFIGURATION_ERROR with status code: 500',
      ),
    ),
    resolution: 'Da notificare a team prodotto',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownError({
    code: 'SEND_APIGW_PDIOEXPAGA_AUT-ACC-LOG-FAI',
    description: 'Errore authorizer segnalato dall’access log con dettaglio da verificare',
    condition: all(
      EXECUTION_LOGS_GROUPED,
      varExists('apiGwExecutionLogMode'),
      varMatches('apiGwAuthorizerStatus', '^5[0-9]{2}$'),
    ),
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-ioAuthorizerLambda' }],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_APIGW_PDIOEXPAGA_INT-502',
    description: 'Integrazione 502 con authorizer 200 e risposta API Gateway 500',
    condition: all(
      EXECUTION_LOGS_GROUPED,
      varExists('apiGwExecutionLogMode'),
      varEquals('apiGwAuthorizerStatus', '200'),
      varEquals('apiGwIntegrationServiceStatus', '502'),
      varEquals('apiGwStatusCode', '500'),
    ),
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-delivery', role: 'PRIMARY' }],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_APIGW_PDIOEXPAGA_EXE-FAI-CON-ERR',
    description: 'Allarme',
    condition: all(
      EXECUTION_LOGS_GROUPED,
      stepEvidenceMatches('query-api-gw-execution-logs', 'Execution failed due to configuration error'),
    ),
    title: '[EXECUTION LOG] Execution failed due to configuration error',
    resolution: 'Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownError({
    code: 'SEND_APIGW_PDIOEXPAGA_DOW-PDV-500-INT-SER-ERR',
    description: 'Allarme',
    condition: any(
      stepEvidenceMatches(
        'query-pn-data-vault',
        downstreamMarkerPattern('PersonalDataVault_UserRegistry', { status: '500 Internal Server Error' }),
      ),
      stepEvidenceMatches(
        'query-pn-data-vault',
        '500 Internal Server Error from GET https://api\\.pdv\\.pagopa\\.it/user-registry/v1/users/',
      ),
    ),
    title: '[DOWNSTREAM] Service PersonalDataVault_UserRegistry returned errors=500 Internal Server Error',
    details: [['Downstream', 'PersonalDataVault']],
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-data-vault' }],
      downstreams: [SEND_DOWNSTREAMS.PERSONAL_DATA_VAULT],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_APIGW_PDIOEXPAGA_F24-MET-GON',
    description: 'Metadati F24 non disponibili con risposta Safe Storage 410',
    condition: stepEvidenceMatches(
      'query-pn-f24',
      '410 Gone from GET https?://[^\\s]+/safe-storage/v1/files/PN_F24_META-',
    ),
    resolution:
      "caso 1: Errore noto e lecito. L'utente ha tentato ad accedere all'allegato (f24) associato alla notifica <IUN> che tuttavia risulta perfezionata per presa visione da 121 giorni -> il file non \u00E8 pi\u00F9 disponibile su safestorate.",
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-f24' }, { name: 'pn-safestorage' }],
      links: [],
    },
  }),
];
