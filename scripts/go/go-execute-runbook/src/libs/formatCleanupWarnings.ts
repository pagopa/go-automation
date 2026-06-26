import type { AWS } from '@go-automation/go-common';

const MAX_CLEANUP_WARNINGS = 32;
const MAX_CLEANUP_WARNING_LENGTH = 100;

export function formatCleanupWarnings(warnings: ReadonlyArray<AWS.AWSRemoteCleanupWarning>): string[] {
  return warnings
    .slice(0, MAX_CLEANUP_WARNINGS)
    .map((warning) => `${warning.service}:${warning.code}:${warning.message}`.slice(0, MAX_CLEANUP_WARNING_LENGTH));
}
