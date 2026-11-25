import type { RunbookMetadata } from '../../engine/types/RunbookMetadata.js';

/** Metadata of a test runbook, without the id the builders take separately. */
export const TEST_RUNBOOK_METADATA: Omit<RunbookMetadata, 'id'> = {
  name: 'Test runbook',
  description: '',
  version: '1.0.0',
  type: 'alarm-resolution',
  team: 'GO',
  tags: [],
};
