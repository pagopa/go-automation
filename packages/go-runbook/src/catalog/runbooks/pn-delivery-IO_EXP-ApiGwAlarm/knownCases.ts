import { knownCase, SEND_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { all, any } from '../common/conditions.js';
import { varEquals, varExists, varMatches } from '../common/varConditions.js';

const FOLLOW_UP =
  'Verificare ricorrenza, impatto e richieste successive; coinvolgere prodotto e Infra se causa o recupero non sono confermati';

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
    resolution:
      'API Gateway ha fallito l’invocazione dell’authorizer. Correlare requestId, attesa e risposta 500; l’assenza di Lambda request ID non prova un timeout del codice Lambda. Verificare invocazioni, throttling, disponibilità e log dell’authorizer. Un success rate Lambda del 100% o log vuoti non escludono un errore prima dell’esecuzione. Coinvolgere Infra/prodotto e verificare l’esito delle richieste successive.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-ioAuthorizerLambda' }],
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
    resolution:
      'Distinguere il 403 dell’invocazione Lambda dal 500 restituito da API Gateway. Se l’authorizer è terminato correttamente, non attribuire il problema a pn-ioAuthorizerLambda. Identificare la risorsa di integrazione dagli execution log e coinvolgere Infra/prodotto; verificare configurazione di firma e ruolo di invocazione senza modificare credenziali o permessi. Un precedente ticket AWS o la sporadicità non provano il recupero.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [FOLLOW_UP] },
  }),
  knownCase({
    id: 'authorizer-configuration-error',
    description: 'Errore nella fase di autorizzazione API Gateway',
    priority: 580,
    condition: stepEvidenceMatches(
      'query-api-gw-execution-logs',
      'Gateway response type: AUTHORIZER_CONFIGURATION_ERROR with status code: 500',
    ),
    resolution:
      'Correlare requestId e dettaglio dell’errore negli execution log. Verificare authorizer effettivo, invocazione, permessi e risposta, distinguendo configurazione, servizio di invocazione e codice Lambda. Coinvolgere Infra/prodotto; non concludere che il codice dell’authorizer sia guasto dal solo 500.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [FOLLOW_UP] },
  }),
  knownCase({
    id: 'authorizer-access-log-failure',
    description: 'Errore authorizer segnalato dall’access log con dettaglio da verificare',
    priority: 570,
    condition: all(varExists('apiGwExecutionLogMode'), varMatches('apiGwAuthorizerStatus', '^5[0-9]{2}$')),
    resolution:
      'L’access log segnala un errore in fase di autorizzazione. Verificare execution log per requestId e log dell’authorizer per authorizerRequestId se disponibile. L’attesa elevata non dimostra un timeout del codice Lambda: distinguere invocazione e handler. Se mancano evidenze verificare account, permessi, ingestione e retention. Non attribuire un guasto a pn-delivery senza prova che sia stato invocato.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-ioAuthorizerLambda' }],
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
    resolution:
      'Il 502 di integrazione non prova che pn-delivery fosse indisponibile. Correlare requestId e trace, verificare destinazione, log dell’integrazione, bilanciatore, target e risorse ECS nella stessa finestra. Verificare impatto e richieste successive; non chiudere per la sola sporadicità.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-delivery' }],
    },
  }),
  knownCase({
    id: 'execution-failed-configuration-error',
    description: 'Allarme',
    priority: 101,
    condition: stepEvidenceMatches('query-api-gw-execution-logs', 'Execution failed due to configuration error'),
    title: '[EXECUTION LOG] Execution failed due to configuration error',
    resolution:
      'Errore di configurazione rilevato da API Gateway: leggere il dettaglio completo per lo stesso requestId, distinguere authorizer e integrazione e coinvolgere Infra/prodotto. Il prefisso generico non identifica una causa specifica e non giustifica una chiusura automatica.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [FOLLOW_UP] },
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
    resolution:
      'Correlare il 500 dell’API IO_EXP con la chiamata di pn-data-vault-sep verso PDV UserRegistry. Verificare impatto, ricorrenza e richieste successive; coinvolgere il referente PDV se persiste. Non attribuire la causa a PDV dal solo messaggio generico di pn-delivery e oscurare gli identificativi utente.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-data-vault' }],
      downstreams: [SEND_DOWNSTREAMS.PERSONAL_DATA_VAULT],
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
      'Verificare nel trace l’allegato, lo stato della notifica e la scadenza del file; il solo 410 non prova che la cancellazione sia prevista. Distinguere la risposta interna Safe Storage dallo status esterno IO_EXP. La casistica storica dei 121 giorni non è una regola generale: validare il comportamento con il prodotto prima della chiusura, senza rigenerare o modificare dati automaticamente.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [FOLLOW_UP],
      resources: [{ name: 'pn-f24' }, { name: 'pn-safestorage' }],
    },
  }),
];
