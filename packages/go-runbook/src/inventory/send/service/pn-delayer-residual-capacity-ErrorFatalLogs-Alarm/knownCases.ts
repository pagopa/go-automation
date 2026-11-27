import { knownCase } from '../../../../toolkits/send/index.js';
import { type KnownCase, stepEvidenceMatches } from '../../../../engine/index.js';

const STEP_ID = 'query-pn-delayer-residual-capacity-job';
const MISSING_CAPACITY =
  'No PaperDeliveryDriverCapacity found for tenderId: \\S+, unifiedDeliveryDriver: [^,]+, geoKey: ';
const DETAILS = [
  ['Servizio', 'pn-delayer'],
  ['Job', 'pn-delayer-residual-capacity-job'],
  ['Errore', '{{vars.delayerResidualCapacityJobErrorMsg}}'],
  ['Trace ID', '{{vars.delayerResidualCapacityJobTraceId}}'],
] as const;
/** Missing driver capacities: the FAKE geoKey of UAT is ignorable, every other geoKey is the tracked defect. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'missing-driver-capacity',
    description: 'Capacità del recapitista assente per la geoKey nel job pn-delayer residual capacity',
    condition: stepEvidenceMatches(STEP_ID, `${MISSING_CAPACITY}(?!FAKE,)[^,]+, deliveryDate: `),
    title: 'Capacità del recapitista assente: errore noto',
    resolution: 'Errore noto e in fase di risoluzione da parte del gruppo di sviluppo (PN-16697).',
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Nessuna PaperDeliveryDriverCapacity trovata per tender, recapitista e geoKey; errore tracciato in PN-16697.',
      finalActions: [],
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PN-16697', name: 'PN-16697', type: 'JIRA' },
        {
          url: 'https://pagopaspa.slack.com/archives/C065FA9U9H8/p1760352405309459',
          name: 'Thread Slack 13/10/2025',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C065FA9U9H8/p1765293840263989',
          name: 'Thread Slack 09/12/2025',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790860820816089',
          name: 'Thread Slack 30/09/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'missing-driver-capacity-fake-geokey-uat',
    description: 'Capacità del recapitista assente per la geoKey FAKE di UAT nel job pn-delayer residual capacity',
    condition: stepEvidenceMatches(STEP_ID, `${MISSING_CAPACITY}FAKE, deliveryDate: `),
    title: 'Capacità assente per geoKey FAKE: ignorabile in UAT',
    resolution: 'Errore noto. In ambiente UAT, per la geoKey FAKE, può essere ignorato.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Nessuna PaperDeliveryDriverCapacity trovata per la geoKey FAKE di UAT.',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1792413429692719',
          name: 'Thread Slack 19/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
