import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { buildQueueRegistry } from '@go-automation/go-execute-runbook-contracts';
import type {
  ExecuteRunbookQueueRegistryEntryV1,
  ExecuteRunbookQueueRegistryV1,
} from '@go-automation/go-execute-runbook-contracts';

import { EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION } from '../config/constants.js';

export interface ExecuteRunbookQueueRegistryFragmentV1 extends ExecuteRunbookQueueRegistryEntryV1 {
  readonly awsRegion: string;
}

export interface QueueRegistryParameterWriter {
  put(name: string, value: string): Promise<void>;
}

export function composeQueueRegistry(
  expectedRegions: ReadonlyArray<string>,
  fragments: ReadonlyArray<ExecuteRunbookQueueRegistryFragmentV1>,
  publishedAt: string,
): ExecuteRunbookQueueRegistryV1 {
  const expected = [...new Set(expectedRegions)].sort();
  if (expected.length !== expectedRegions.length || expected.length === 0) {
    throw new Error('Expected queue registry regions must be non-empty and unique');
  }

  const queues: Record<string, ExecuteRunbookQueueRegistryEntryV1> = {};
  for (const { awsRegion, ...entry } of fragments) {
    if (!expected.includes(awsRegion)) throw new Error(`Unexpected queue registry region: ${awsRegion}`);
    if (queues[awsRegion] !== undefined) throw new Error(`Duplicate queue registry region: ${awsRegion}`);
    queues[awsRegion] = entry;
  }
  const missing = expected.filter((region) => queues[region] === undefined);
  if (missing.length > 0) throw new Error(`Missing queue registry regions: ${missing.join(', ')}`);

  return buildQueueRegistry({ schemaVersion: 1, publishedAt, queues });
}

export async function publishQueueRegistry(
  parameterName: string,
  registry: ExecuteRunbookQueueRegistryV1,
  writer: QueueRegistryParameterWriter = createSsmWriter(),
): Promise<void> {
  if (!/^\/go-automation\/[a-z0-9-]+\/execute-runbook\/queue-registry-v1$/.test(parameterName)) {
    throw new Error(`Invalid execute-runbook registry parameter name: ${parameterName}`);
  }
  await writer.put(parameterName, JSON.stringify(registry));
}

function createSsmWriter(): QueueRegistryParameterWriter {
  const client = new SSMClient({ region: EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION });
  return {
    async put(name: string, value: string): Promise<void> {
      await client.send(new PutParameterCommand({ Name: name, Value: value, Type: 'String', Overwrite: true }));
    },
  };
}
