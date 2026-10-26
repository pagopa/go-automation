import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { all, any } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varExists, varMatches } from '../common/varConditions.js';
import { apiGwStatusIs } from '../../../apigw/knownCases/conditions.js';

/** Cases documented in Confluence and correlated production evidence. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'stream-authorizer-runtime-timeout',
    description: 'Timeout di esecuzione confermato nei log dell’authorizer pn-ApiKeyAuthorizerV2Lambda',
    priority: 300,
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
  knownCase({
    id: 'stream-lambda-invocation-504',
    description: 'API Gateway non riesce a invocare una Lambda: status 504 e Lambda request id N/A',
    priority: 290,
    condition: stepEvidenceMatches(
      'query-api-gw-execution-logs',
      'Lambda invocation failed with status: 504\\. Lambda request id: N/A',
    ),
    title: 'Invocazione Lambda fallita con status 504',
    resolution: 'Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
  knownCase({
    id: 'stream-waf-evaluation-error',
    description: 'Errore di valutazione delle regole AWS WAF sull’API Gateway',
    priority: 280,
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
  knownCase({
    id: 'stream-lambda-invocation-500',
    description: 'Invocation error della Lambda di versioning riscontrato negli execution log API Gateway',
    priority: 270,
    condition: stepEvidenceMatches('query-api-gw-execution-logs', 'Lambda invocation failed with status: 500\\.'),
    resolution: 'Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
  knownCase({
    id: 'stream-authorizer-invocation-error',
    description: 'Errore dell’authorizer rilevato negli execution log, senza prova di timeout del runtime Lambda',
    priority: 260,
    condition: stepEvidenceMatches('query-api-gw-execution-logs', 'AUTHORIZER_CONFIGURATION_ERROR'),
    resolution: 'Risoluzione non documentata.',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      resources: [{ name: 'pn-ApiKeyAuthorizerV2Lambda' }],
    },
  }),
  knownCase({
    id: 'stream-versioning-client-403',
    description: 'Errore client 403 nella Lambda pn-versioningV1V2StreamLambda',
    priority: 250,
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
  knownCase({
    id: 'stream-endpoint-timeout',
    description: 'Timeout della richiesta API Gateway; la firma non identifica la causa nel backend',
    priority: 240,
    condition: all(
      any(apiGwStatusIs('500'), apiGwStatusIs('504')),
      varMatches('apiGwErrorMessage', 'Endpoint request timed out'),
      varExists('streamLogCount'),
    ),
    resolution: 'Verificare comunque i log di pn-stream. Risoluzione non documentata.',
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
];
