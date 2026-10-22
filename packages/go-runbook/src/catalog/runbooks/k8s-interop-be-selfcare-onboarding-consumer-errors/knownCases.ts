import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'selfcare-kafka-broker-communication-errors',
    description: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    priority: 100,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-interop-be-selfcare-onboarding-consumer',
          regex:
            'The coordinator is not aware of this member|The group coordinator is not available|KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition|Connection error: read (?:ECONNRESET|ETIMEDOUT)',
        },
        {
          type: 'contains',
          ref: 'steps.query-interop-cid-tracker',
          regex:
            'The coordinator is not aware of this member|The group coordinator is not available|KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition|Connection error: read (?:ECONNRESET|ETIMEDOUT)',
        },
      ],
    },
    title: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    resolution: 'PIN-7325',
    level: 'info',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', '{{vars.interopSelfcareOnboardingConsumerCidCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: ['Selfcare'],
      links: [
        {
          url: 'https://pagopa.atlassian.net/browse/PIN-7325',
          name: 'PIN-7325',
          type: 'JIRA',
        },
      ],
      finalActions: [],
    },
  }),
];
