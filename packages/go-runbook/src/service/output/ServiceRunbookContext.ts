import type { ServiceDescriptor } from '../types/ServiceDescriptor.js';

export interface ServiceRunbookContext {
  readonly kind: 'service';
  readonly service: ServiceDescriptor;
  readonly queryProfileId: string;
}

export function isServiceRunbookContext(value: unknown): value is ServiceRunbookContext {
  if (!isRecord(value)) return false;
  if (value['kind'] !== 'service') return false;
  if (!isNonEmptyString(value['queryProfileId'])) return false;

  const service = value['service'];
  return (
    isRecord(service) &&
    isNonEmptyString(service['name']) &&
    isNonEmptyString(service['logGroup']) &&
    isNonEmptyString(service['varPrefix'])
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
