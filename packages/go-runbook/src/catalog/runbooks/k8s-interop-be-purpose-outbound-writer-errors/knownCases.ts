import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'purpose-outbound-writer-kafka-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
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
          ref: 'steps.query-interop-be-purpose-outbound-writer',
          regex: 'ERROR\\s*-\\s*The coordinator is not aware of this member,\\s*re-joining the group\\b',
        },
      ],
    },
    title: 'Il coordinator Kafka non riconosce il member del consumer group',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopPurposeOutboundWriterCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il coordinator Kafka non riconosce il member del consumer group',
      downstreams: ['Nessuno'],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'purpose-outbound-writer-kafka-connection-refused',
    description: 'Connessione al broker rifiutata durante l’esecuzione del purpose outbound writer',
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
          ref: 'steps.query-interop-be-purpose-outbound-writer',
          regex: 'ERROR\\s*-\\s*Connection error:\\s*connect ECONNREFUSED\\b',
        },
      ],
    },
    title: 'Connessione al broker rifiutata durante l’esecuzione del purpose outbound writer',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopPurposeOutboundWriterCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Connessione al broker rifiutata durante l’esecuzione del purpose outbound writer',
      downstreams: ['Nessuno'],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'purpose-outbound-writer-kafka-wrong-coordinator',
    description: 'Il broker contattato non è il coordinator corretto del consumer group',
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
          ref: 'steps.query-interop-be-purpose-outbound-writer',
          regex:
            'Response Heartbeat\\(key:\\s*12, version:\\s*\\d+\\)\\s*-\\s*This is not the correct coordinator for this group\\b',
        },
      ],
    },
    title: 'Il broker contattato non è il coordinator corretto del consumer group',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopPurposeOutboundWriterCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il broker contattato non è il coordinator corretto del consumer group',
      downstreams: ['Nessuno'],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'purpose-outbound-writer-kafka-retries-exhausted',
    description: 'Consumer del purpose outbound writer in crash con retry Kafka esauriti',
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
          ref: 'steps.query-interop-be-purpose-outbound-writer',
          regex:
            '(?:Crash:\\s*KafkaJSNumberOfRetriesExceeded\\b|Error Consumer crashed\\b[^\\n]*KafkaJSNumberOfRetriesExceeded\\b)',
        },
      ],
    },
    title: 'Consumer del purpose outbound writer in crash con retry Kafka esauriti',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopPurposeOutboundWriterCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Consumer del purpose outbound writer in crash con retry Kafka esauriti',
      downstreams: ['Nessuno'],
      finalActions: [],
      links: [],
    },
  }),
];
