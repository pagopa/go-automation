import { knownCase, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import { type KnownCase, stepEvidenceMatches } from '../../../../engine/index.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'external-channel-pec-provider-unavailable',
    description: 'Disservizio momentaneo del provider PEC Namirial',
    condition: stepEvidenceMatches(
      'query-pn-external-channel',
      '\\* FATAL \\* ALLARM!: (?:scaricamentoEsitiPecScheduler\\(\\)|CancellazioneRicevutePecService\\.cancellazioneRicevutePec\\(\\))',
    ),
    title: 'Provider PEC Namirial momentaneamente non disponibile',
    resolution:
      'Verificare lo stato del servizio PEC Namirial su https://status.namirial.com/, la durata del disservizio e lo stato delle code di external-channel nell’account pn-confinfo-prod.',
    details: [
      ['Servizio', 'pn-external-channel'],
      ['Errore', '{{vars.externalChannelErrorMsg}}'],
      ['Trace ID', '{{vars.externalChannelTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Errori FATAL nello scaricamento degli esiti o nella cancellazione delle ricevute PEC.',
      downstreams: [SEND_DOWNSTREAMS.NAMIRIAL],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1794559769878009',
          name: 'Thread Slack 13/11/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
