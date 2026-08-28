import { isNonBlankString, isObject } from '@go-automation/go-common/core';
import type { ServiceDescriptor } from '../types/ServiceDescriptor.js';

export interface ServiceRunbookContext {
  readonly kind: 'service';
  readonly service: ServiceDescriptor;
  readonly queryProfileId: string;
}

export function isServiceRunbookContext(value: unknown): value is ServiceRunbookContext {
  if (!isObject(value)) return false;
  if (value['kind'] !== 'service') return false;
  if (!isNonBlankString(value['queryProfileId'])) return false;

  const service = value['service'];
  return (
    isObject(service) &&
    isNonBlankString(service['name']) &&
    isNonBlankString(service['logGroup']) &&
    isNonBlankString(service['varPrefix'])
  );
}
