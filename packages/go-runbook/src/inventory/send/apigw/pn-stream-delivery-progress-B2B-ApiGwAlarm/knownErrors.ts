import { apiGwStatusIs, knownError } from '../../../../toolkits/send/index.js';
import { all, any, type KnownError, stepEvidenceMatches, varExists, varMatches } from '../../../../engine/index.js';

/** Cases documented in Confluence and correlated production evidence. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_APIGW_PSDPB2BAGA_STR-AUT-RUN-TIM',
    description: 'Timeout di esecuzione confermato nei log dell’authorizer pn-ApiKeyAuthorizerV2Lambda',
    condition: stepEvidenceMatches('query-stream-authorizer-lambda', 'REPORT RequestId:[^"\r\n]*Status: timeout'),
    title: 'Timeout Lambda authorizer API Gateway',
    resolution:
      'Nessuna azione necessaria se il timeout si presenta sporadicamente. In caso contrario segnalare al gruppo infra e valutare un aumento del tempo di esecuzione della Lambda o l’apertura di un bug.',
    details: [['Lambda', 'pn-ApiKeyAuthorizerV2Lambda']],
    // The current window does not establish whether the timeout is sporadic.
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'pn-ApiKeyAuthorizerV2Lambda' }],
      finalActions: [],
    },
  }),
  knownError({
    code: 'SEND_APIGW_PSDPB2BAGA_STR-LAM-INV-504',
    description: 'API Gateway non riesce a invocare una Lambda: status 504 e Lambda request id N/A',
    condition: stepEvidenceMatches(
      'query-api-gw-execution-logs',
      'Lambda invocation failed with status: 504\\. Lambda request id: N/A',
    ),
    title: 'Invocazione Lambda fallita con status 504',
    resolution: 'Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
  knownError({
    code: 'SEND_APIGW_PSDPB2BAGA_STR-WAF-EVA-ERR',
    description: 'Errore di valutazione delle regole AWS WAF sull’API Gateway',
    condition: stepEvidenceMatches(
      'query-api-gw-logs',
      'There was an error evaluating the AWS WAF rules associated with this API',
    ),
    resolution: 'Thread Slack: https://pagopaspa.slack.com/archives/C087KRMD16E/p1774371019255439',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1774371019255439',
          name: 'Thread Slack WAF',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownError({
    code: 'SEND_APIGW_PSDPB2BAGA_STR-LAM-INV-500',
    description: 'Invocation error della Lambda di versioning riscontrato negli execution log API Gateway',
    condition: stepEvidenceMatches('query-api-gw-execution-logs', 'Lambda invocation failed with status: 500\\.'),
    resolution: 'Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
  knownError({
    code: 'SEND_APIGW_PSDPB2BAGA_STR-AUT-INV-ERR',
    description: 'Errore dell’authorizer rilevato negli execution log, senza prova di timeout del runtime Lambda',
    condition: stepEvidenceMatches('query-api-gw-execution-logs', 'AUTHORIZER_CONFIGURATION_ERROR'),
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-ApiKeyAuthorizerV2Lambda' }],
    },
  }),
  knownError({
    code: 'SEND_APIGW_PSDPB2BAGA_STR-VER-CLI-403',
    description: 'Errore client 403 nella Lambda pn-versioningV1V2StreamLambda',
    condition: stepEvidenceMatches(
      'query-stream-versioning-lambda',
      'PN_GENERIC_ERROR AxiosError: Request failed with status code 403',
    ),
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-versioningV1V2StreamLambda' }],
    },
  }),
  knownError({
    code: 'SEND_APIGW_PSDPB2BAGA_STR-END-TIM',
    description: 'Timeout della richiesta API Gateway; la firma non identifica la causa nel backend',
    condition: all(
      any(apiGwStatusIs('500'), apiGwStatusIs('504')),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      varExists('streamLogCount'),
    ),
    resolution: 'Verificare comunque i log di pn-stream. Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
];
