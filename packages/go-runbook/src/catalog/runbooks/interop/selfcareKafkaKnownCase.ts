import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import { jiraLink } from '../common/analysisLinks.js';

import type { InteropKnownCaseRefs } from './interopKnownCases.js';
import { interopKnownCase } from './interopKnownCases.js';

const SELFCARE_KAFKA_ERROR_PATTERN = [
  'The coordinator is not aware of this member',
  'The group coordinator is not available',
  'KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  'Connection error: read ECONNRESET',
].join('|');

/** Builds the Kafka/Selfcare case shared by INTEROP consumer runbooks. */
export function createSelfcareKafkaBrokerCommunicationKnownCase(refs: InteropKnownCaseRefs): KnownCase {
  return interopKnownCase(refs, {
    id: 'selfcare-kafka-broker-communication-errors',
    description: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    priority: 100,
    regex: SELFCARE_KAFKA_ERROR_PATTERN,
    resolution:
      'Caso noto legato ai broker Kafka di Selfcare o a una temporanea indisponibilità di rete. ' +
      'Verificare PIN-7325 e, se il problema persiste, coinvolgere il team Selfcare.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    links: [jiraLink('PIN-7325')],
  });
}
