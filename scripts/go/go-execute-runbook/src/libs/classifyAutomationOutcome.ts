import type { AutomaticRunbookOutcome } from '@go-automation/go-watchtower-client';
import type { RunbookCheck } from '@go-automation/go-runbook';

export function classifyAutomationOutcome(check: RunbookCheck): AutomaticRunbookOutcome {
  switch (check.status) {
    case 'HIT':
      return 'KNOWN_CASE';
    case 'MISS':
      return 'UNKNOWN_CASE';
    case 'NO-DATA':
      return 'NO_DATA';
    case 'NO_RUNBOOK':
      throw new Error('NO_RUNBOOK is not a valid automatic worker outcome; capability pinning must fail first');
    case 'CONFIG-ERROR':
      return 'CONFIGURATION_ERROR';
    case 'EXECUTION-ERROR':
      return 'EXECUTION_ERROR';
    default: {
      const exhaustive: never = check.status;
      void exhaustive;
      throw new Error('Unsupported runbook check status');
    }
  }
}
