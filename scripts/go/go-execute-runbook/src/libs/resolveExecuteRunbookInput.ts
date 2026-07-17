import type { AutomaticAlarmAnalysisCommandV1 } from '@go-automation/go-watchtower-client';
import { AUTOMATIC_RUNBOOK_REGISTRY } from '@go-automation/go-runbook/catalog';

import type { ExecuteRunbookCliConfig } from '../types/ExecuteRunbookConfig.js';
import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';

export async function resolveExecuteRunbookInput(
  deps: ExecuteRunbookDeps,
  config: ExecuteRunbookCliConfig,
): Promise<AutomaticAlarmAnalysisCommandV1> {
  const alarmEvent = await deps.watchtower.getAlarmEvent(config.alarmEventId);
  if (alarmEvent.alarmId === null) throw new Error('Alarm event is not linked to an alarm');
  const resolved = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(alarmEvent.name);
  if (resolved === undefined) throw new Error(`No automatic runbook is registered for alarm "${alarmEvent.name}"`);
  const descriptor = resolved.descriptor;
  return {
    schemaVersion: '1.0.0',
    executionId: config.executionId,
    alarmEvent: {
      id: alarmEvent.id,
      productId: alarmEvent.product.id,
      environmentId: alarmEvent.environment.id,
      alarmId: alarmEvent.alarmId,
      alarmName: alarmEvent.name,
      firedAt: alarmEvent.firedAt,
      awsAccountId: alarmEvent.awsAccountId,
      awsRegion: alarmEvent.awsRegion,
    },
    runbook: {
      key: descriptor.key,
      version: descriptor.version,
      definitionDigest: descriptor.definitionDigest,
      // Local/legacy execution has no cloud catalog. The digest is a stable local snapshot id.
      catalogRevision: descriptor.definitionDigest,
      workerRevision: deps.workerArtifactRevision ?? 'local',
    },
    trigger: { kind: 'WATCHTOWER_API' },
  };
}
