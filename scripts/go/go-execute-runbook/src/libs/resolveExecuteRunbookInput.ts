import type { AutomaticAlarmAnalysisCommandV1 } from '@go-automation/go-watchtower-client';

import type { ExecuteRunbookCliConfig } from '../types/ExecuteRunbookConfig.js';
import type { ExecuteRunbookDeps } from '../types/ExecuteRunbookDeps.js';

export async function resolveExecuteRunbookInput(
  deps: ExecuteRunbookDeps,
  config: ExecuteRunbookCliConfig,
): Promise<AutomaticAlarmAnalysisCommandV1> {
  const alarmEvent = await deps.watchtower.getAlarmEvent(config.alarmEventId);
  if (alarmEvent.alarmId === null) throw new Error('Alarm event is not linked to an alarm');
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
    trigger: { kind: 'WATCHTOWER_API' },
  };
}
