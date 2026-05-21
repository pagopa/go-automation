import type { ApiGwService } from '../types/ApiGwService.js';

export interface ApiGwRunbookContext {
  readonly kind: 'apigw';
  readonly services: ReadonlyArray<ApiGwService>;
  readonly apiGwLogGroup: string;
  readonly queryProfileId: string;
}

export function isApiGwRunbookContext(value: unknown): value is ApiGwRunbookContext {
  if (!isRecord(value)) return false;
  if (value['kind'] !== 'apigw') return false;
  if (!isNonEmptyString(value['apiGwLogGroup'])) return false;
  if (!isNonEmptyString(value['queryProfileId'])) return false;
  const services = value['services'];
  return Array.isArray(services) && services.every(isApiGwService);
}

function isApiGwService(value: unknown): value is ApiGwService {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value['name']) && isNonEmptyString(value['varPrefix']) && isNonEmptyString(value['logGroup']);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
