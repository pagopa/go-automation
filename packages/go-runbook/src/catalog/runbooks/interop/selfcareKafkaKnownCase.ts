export const SELFCARE_KAFKA_BROKER_COMMUNICATION_PATTERN: string = [
  'The coordinator is not aware of this member',
  'The group coordinator is not available',
  'KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
  'Connection error: read (?:ECONNRESET|ETIMEDOUT)',
].join('|');
