import { knownError } from '../../../../toolkits/interop/index.js';
import { type KnownError, varEquals } from '../../../../engine/index.js';

export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'INTEROP_APIGW_IAEAA4_ATT-ESE-403-WIT-INT',
    description: 'HTTP 403 senza riscontro sui log applicativi',
    condition: varEquals('attEservicesAllRejectedBeforeIntegration', 'true'),
    resolution: "In caso di chiamate effettuate a path sospetti, non c'è alcuna azione da intraprendere.",
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Richieste 4xx', '{{vars.attEservicesRequestCount}}'],
      ['Richieste 403 senza integrazione', '{{vars.attEservicesRejectedCount}}'],
      ['Path osservati', '{{vars.attEservicesPaths}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      errorDetails: '{{vars.attEservicesRequestSummary}}',
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1791202742527259',
          name: 'Thread Slack 05/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
