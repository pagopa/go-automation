import { knownCase } from '../../../../toolkits/send/index.js';
import { all, type KnownCase, stepEvidenceMatches } from '../../../../engine/index.js';

const STEP = 'query-spidhub-diagnostics';

const DETAILS = [
  ['Servizio', 'pn-hub-spid-login-aws'],
  ['Account', '{{vars.spidHubAccountId}}'],
  ['Log di errore', '{{vars.spidHubErrorLogCount}}'],
  ['Stream osservati', '{{vars.spidHubStreamCount}}'],
  ['Errori SAML Responder', '{{vars.spidHubResponderCount}}'],
  ['Errori headers già inviati', '{{vars.spidHubHeadersSentCount}}'],
] as const;
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'spidhub-headers-already-sent',
    description: 'ERR_HTTP_HEADERS_SENT nei log SPID Hub: correlazione HTTP ancora da verificare',
    // The counter of the error scan, bound to its rows so the case has their time.
    condition: all(
      { type: 'compare', ref: 'vars.spidHubHeadersSentCount', operator: '>', value: 0 },
      stepEvidenceMatches(STEP, '\\bERR_HTTP_HEADERS_SENT\\b'),
    ),
    level: 'warn',
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownCase({
    id: 'spidhub-saml-responder',
    description: 'Firma storica SAML Responder: causa HTTP e recupero ancora da verificare',
    condition: all(
      { type: 'compare', ref: 'vars.spidHubResponderCount', operator: '>', value: 0 },
      stepEvidenceMatches(
        STEP,
        '^(?=[\\s\\S]*\\[io-spid-commons\\])(?=[\\s\\S]*Spid Authentication\\|Authentication Error\\|ERROR=Error: Value attribute of StatusCode is invalid: urn:oasis:names:tc:SAML:2\\.0:status:Responder)',
      ),
    ),
    level: 'warn',
    resolution:
      'Nel caso documentato il problema \u00E8 stato considerato momentaneo; non \u00E8 indicata una risoluzione specifica.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
];
