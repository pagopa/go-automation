import { knownCase, SEND_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { all, any } from '../common/conditions.js';
import { varEquals, varExists, varMatches } from '../common/varConditions.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'authorizer-invocation-504',
    description: 'Invocazione authorizer terminata con 504 senza Lambda request ID',
    priority: 600,
    condition: all(
      stepEvidenceMatches(
        'query-api-gw-execution-logs',
        'Lambda invocation failed with status: 504\\. Lambda request id: N/A',
      ),
      stepEvidenceMatches('query-api-gw-execution-logs', 'AUTHORIZER_CONFIGURATION_ERROR'),
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
  knownCase({
    id: 'integration-signature-mismatch',
    description: 'Firma AWS non valida durante l’invocazione dell’integrazione',
    priority: 590,
    condition: stepEvidenceMatches(
      'query-api-gw-execution-logs',
      'Execution failed due to configuration error: The request signature we calculated does not match the signature you provided',
    ),
    resolution: 'Thread Slack 25/08/2026 - Apertura ticket AWS',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownCase({
    id: 'authorizer-configuration-error',
    description: 'Errore nella fase di autorizzazione API Gateway',
    priority: 580,
    condition: stepEvidenceMatches(
      'query-api-gw-execution-logs',
      'Gateway response type: AUTHORIZER_CONFIGURATION_ERROR with status code: 500',
    ),
    resolution: 'Da notificare a team prodotto',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownCase({
    id: 'authorizer-access-log-failure',
    description: 'Errore authorizer segnalato dall’access log con dettaglio da verificare',
    priority: 570,
    condition: all(varExists('apiGwExecutionLogMode'), varMatches('apiGwAuthorizerStatus', '^5[0-9]{2}$')),
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-ioAuthorizerLambda' }],
      links: [],
    },
  }),
  knownCase({
    id: 'integration-502',
    description: 'Integrazione 502 con authorizer 200 e risposta API Gateway 500',
    priority: 560,
    condition: all(
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
  knownCase({
    id: 'execution-failed-configuration-error',
    description: 'Allarme',
    priority: 101,
    condition: stepEvidenceMatches('query-api-gw-execution-logs', 'Execution failed due to configuration error'),
    title: '[EXECUTION LOG] Execution failed due to configuration error',
    resolution: 'Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownCase({
    id: 'downstream-pdv-500-internal-server-error',
    description: 'Allarme',
    priority: 100,
    condition: any(
      stepEvidenceMatches(
        'query-pn-data-vault',
        '\\[DOWNSTREAM\\] Service PersonalDataVault_UserRegistry returned errors=500 Internal Server Error',
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
  knownCase({
    id: 'f24-metadata-gone',
    description: 'Metadati F24 non disponibili con risposta Safe Storage 410',
    priority: 90,
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
