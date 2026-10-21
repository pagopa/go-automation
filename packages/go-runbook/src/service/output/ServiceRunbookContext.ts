import { isNonBlankString, isPlainObject } from '@go-automation/go-common/core';
import type { ServiceDescriptor } from '../types/ServiceDescriptor.js';

/** Additional log-query output included as evidence alongside errors and trace logs. */
export interface ServiceLogEvidenceSource {
  readonly id: string;
  readonly label: string;
  readonly sourceStep: string;
  /** Defaults to the output builder's sample limit. */
  readonly maxLogLines?: number;
}

export interface ServiceRunbookContext {
  readonly kind: 'service';
  readonly service: ServiceDescriptor;
  readonly queryProfileId: string;
  readonly additionalLogEvidence?: ReadonlyArray<ServiceLogEvidenceSource>;
}

export function isServiceRunbookContext(value: unknown): value is ServiceRunbookContext {
  if (!isPlainObject(value)) return false;
  if (value['kind'] !== 'service') return false;
  if (!isNonBlankString(value['queryProfileId'])) return false;

  const additionalLogEvidence = value['additionalLogEvidence'];
  if (
    additionalLogEvidence !== undefined &&
    (!Array.isArray(additionalLogEvidence) ||
      !additionalLogEvidence.every(
        (source: unknown) =>
          isPlainObject(source) &&
          isNonBlankString(source['id']) &&
          isNonBlankString(source['label']) &&
          isNonBlankString(source['sourceStep']) &&
          (source['maxLogLines'] === undefined ||
            (typeof source['maxLogLines'] === 'number' &&
              Number.isSafeInteger(source['maxLogLines']) &&
              source['maxLogLines'] > 0)),
      ))
  ) {
    return false;
  }

  const service = value['service'];
  return (
    isPlainObject(service) &&
    isNonBlankString(service['name']) &&
    isNonBlankString(service['logGroup']) &&
    isNonBlankString(service['varPrefix'])
  );
}
