import type { AWSRemoteCleanupWarning } from '@pagopa/go-aws';

const MAX_CLEANUP_WARNINGS = 32;
const MAX_CLEANUP_WARNING_LENGTH = 100;

export function formatCleanupWarnings(warnings: ReadonlyArray<AWSRemoteCleanupWarning>): string[] {
  return warnings
    .slice(0, MAX_CLEANUP_WARNINGS)
    .map((warning) => `${warning.service}:${warning.code}:${warning.message}`.slice(0, MAX_CLEANUP_WARNING_LENGTH));
}
