import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

const DETAILS = [
  ['Servizio', 'pn-hub-spid-login-aws'],
  ['Account', '350578575906'],
  ['Log di errore', '{{vars.spidHubErrorLogCount}}'],
  ['Stream osservati', '{{vars.spidHubStreamCount}}'],
  ['Errori SAML Responder', '{{vars.spidHubResponderCount}}'],
  ['Errori headers già inviati', '{{vars.spidHubHeadersSentCount}}'],
] as const;
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'spidhub-headers-already-sent',
    description: 'ERR_HTTP_HEADERS_SENT nei log SPID Hub: correlazione HTTP ancora da verificare',
    priority: 110,
    condition: { type: 'compare', ref: 'vars.spidHubHeadersSentCount', operator: '>', value: 0 },
    level: 'warn',
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
  knownCase({
    id: 'spidhub-saml-responder',
    description: 'Firma storica SAML Responder: causa HTTP e recupero ancora da verificare',
    priority: 100,
    condition: { type: 'compare', ref: 'vars.spidHubResponderCount', operator: '>', value: 0 },
    level: 'warn',
    resolution:
      'Nel caso documentato il problema \u00E8 stato considerato momentaneo; non \u00E8 indicata una risoluzione specifica.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
  }),
];
