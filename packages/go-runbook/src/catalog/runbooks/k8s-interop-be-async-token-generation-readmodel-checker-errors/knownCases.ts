import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { jiraLink, slackLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_ALARM as alarm } from './alarmDefinition.js';

const UUID_PATTERN = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'async-token-generation-catalog-platform-states-difference',
    description: 'Disallineamento dei platform state di una voce del catalogo ESERVICEDESCRIPTOR',
    priority: 100,
    // The tracker includes other microservices; only the checker's own errors identify this case.
    condition: all(
      varEquals('interopEnvironment', 'att'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'Differences in platform-states when checking catalog entry ESERVICEDESCRIPTOR#' +
          `${UUID_PATTERN}#${UUID_PATTERN}(?=$|[\\s:;"\\\\])`,
      ),
    ),
    level: 'warn',
    resolution:
      'Il checker rileva una differenza nei platform state di una voce del catalogo. Consultare PIN-10541 e il thread Slack collegato. ' +
      'La card riguarda il supporto degli stati Archiving e ArchivingSuspended ed è risolta nella Core 2.20.1: ' +
      'verificare la versione effettivamente installata in attestazione. Il commento della card mostra errori sulle producer keychain, ' +
      'diversi dal messaggio di catalogo: confermare il collegamento con il team di prodotto. ' +
      'Confrontare la voce ESERVICEDESCRIPTOR nei platform state, conservare identificativi, log completi e CID disponibili ' +
      'e verificare l’esito delle esecuzioni successive del checker. La pagina non documenta una procedura risolutiva ' +
      'né un criterio di chiusura; mantenere l’analisi aperta fino alla verifica del disallineamento e della ripresa.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Errore', `{{vars.${alarm.varPrefix}ErrorMsg}}`],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Differenze nei platform state di una voce ESERVICEDESCRIPTOR; causa, collegamento a PIN-10541 e recupero da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [
        'Consultare PIN-10541 e il thread Slack collegato e verificare la versione installata in attestazione',
        'Confrontare la voce ESERVICEDESCRIPTOR nei platform state e verificare il collegamento a PIN-10541 con il team di prodotto',
        'Verificare l’esito delle esecuzioni successive del checker prima di proporre la chiusura',
      ],
      links: [
        jiraLink('PIN-10541'),
        slackLink('https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784019090399849', 'Thread Slack del caso noto'),
      ],
    },
  }),
];
