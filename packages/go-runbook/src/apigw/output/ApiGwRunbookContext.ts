import type { ApiGwService } from '../types/ApiGwService.js';

export interface ApiGwRunbookContext {
  readonly kind: 'apigw';
  readonly services: ReadonlyArray<ApiGwService>;
  readonly apiGwLogGroup: string;
  readonly queryProfileId: string;
}

export function isApiGwRunbookContext(value: unknown): value is ApiGwRunbookContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === 'apigw' &&
    Array.isArray((value as { readonly services?: unknown }).services)
  );
}
