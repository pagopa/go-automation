import { Core } from '@go-automation/go-common';

export function resolveDryRunTimeoutMs(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${Core.GOConfigKeyTransformer.toCLIFlag('dry.run.timeout.ms')} must be a positive integer`);
  }
  return value;
}
