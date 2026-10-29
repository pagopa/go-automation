import { knownCase, type KnownCase } from '../framework.js';
import { varEquals } from '../common/varConditions.js';

/** Source: Confluence 2843770902 v5 note on suspicious paths, verified against the real access logs. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'att-eservices-documented-probe-paths-403',
    description: 'HTTP 403 su richieste GET ai percorsi sospetti documentati',
    priority: 100,
    condition: varEquals('attEservicesAllDocumentedProbes', 'true'),
    resolution: "In caso di chiamate effettuate a path sospetti, non c'è alcuna azione da intraprendere.",
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Richieste 4xx', '{{vars.attEservicesRequestCount}}'],
      ['Richieste 403 documentate', '{{vars.attEservicesProbeCount}}'],
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
