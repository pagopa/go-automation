import { knownCase } from '../../../../toolkits/interop/index.js';
import { type KnownCase, varEquals } from '../../../../engine/index.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'att-eservices-403-without-integration',
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
