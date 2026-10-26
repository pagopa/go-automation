import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'delegation-outbound-writer-kafka-heartbeat-unknown-member',
    description: 'Il coordinator Kafka non riconosce il consumer durante l’heartbeat',
    priority: 100,
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'compare',
          ref: 'vars.interopEnvironment',
          operator: '==',
          value: 'prod',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-be-delegation-outbound-writer',
          regex:
            'ERROR\\s*-\\s*(?:Response Heartbeat\\(key:\\s*12, version:\\s*\\d+\\)\\s*-\\s*The coordinator is not aware of this member\\b|The coordinator is not aware of this member,\\s*re-joining the group\\b)',
        },
      ],
    },
    title: 'Il coordinator Kafka non riconosce il consumer durante l’heartbeat',
    resolution: 'Non sono necessarie azioni di risoluzione se i log sono concentrati ad un timestamp breve.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopDelegationOutboundWriterCidCount}}'],
      ['Log di contesto', '{{vars.delegationOutboundWriterContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il coordinator Kafka non riconosce il consumer durante l’heartbeat',
      downstreams: ['Nessuno'],
      finalActions: [],
      links: [
        {
          url: 'https://pagopa.atlassian.net/browse/PIN-7325',
          name: 'PIN-7325',
          type: 'JIRA',
        },
      ],
    },
  }),
  knownCase({
    id: 'delegation-outbound-writer-kafka-connection-refused',
    description: 'Connessione al broker Kafka rifiutata per il delegation outbound writer',
    priority: 120,
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'compare',
          ref: 'vars.interopEnvironment',
          operator: '==',
          value: 'prod',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-be-delegation-outbound-writer',
          regex: 'ERROR\\s*-\\s*Connection error:\\s*connect ECONNREFUSED\\b',
        },
      ],
    },
    title: 'Connessione al broker Kafka rifiutata per il delegation outbound writer',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopDelegationOutboundWriterCidCount}}'],
      ['Log di contesto', '{{vars.delegationOutboundWriterContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione al broker Kafka rifiutata per il delegation outbound writer',
      downstreams: ['Nessuno'],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'delegation-outbound-writer-kafka-wrong-coordinator',
    description: 'Il broker non è il coordinator corretto del consumer group del writer',
    priority: 110,
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'compare',
          ref: 'vars.interopEnvironment',
          operator: '==',
          value: 'prod',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-be-delegation-outbound-writer',
          regex:
            'ERROR\\s*-\\s*Response (?:Heartbeat\\(key:\\s*12|JoinGroup\\(key:\\s*11), version:\\s*\\d+\\)\\s*-\\s*This is not the correct coordinator for this group\\b',
        },
      ],
    },
    title: 'Il broker non è il coordinator corretto del consumer group del writer',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopDelegationOutboundWriterCidCount}}'],
      ['Log di contesto', '{{vars.delegationOutboundWriterContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il broker non è il coordinator corretto del consumer group del writer',
      downstreams: ['Nessuno'],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'delegation-outbound-writer-kafka-retries-exhausted',
    description: 'Consumer del delegation outbound writer in crash con retry Kafka esauriti',
    priority: 200,
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'compare',
          ref: 'vars.interopEnvironment',
          operator: '==',
          value: 'prod',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-be-delegation-outbound-writer',
          regex:
            'ERROR\\s*-\\s*(?:Crash:\\s*KafkaJSNumberOfRetriesExceeded\\b|Error Consumer crashed\\b[^\\n]*KafkaJSNumberOfRetriesExceeded\\b)',
        },
      ],
    },
    title: 'Consumer del delegation outbound writer in crash con retry Kafka esauriti',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopDelegationOutboundWriterCidCount}}'],
      ['Log di contesto', '{{vars.delegationOutboundWriterContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Consumer del delegation outbound writer in crash con retry Kafka esauriti',
      downstreams: ['Nessuno'],
      finalActions: [],
      links: [],
    },
  }),
];
