/**
 * DTOs for the Watchtower REST API — read-only subset consumed by go-rta-check.
 * Cohesive module (external API contract); intentionally not split per type.
 */

/** Generic paginated envelope returned by Watchtower list endpoints. */
export interface Paginated<T> {
  readonly data: ReadonlyArray<T>;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
}

/** Response of `POST /auth/login`. */
export interface LoginResponse {
  readonly accessToken: string;
  readonly refreshToken?: string;
}

/** A Watchtower product (`GET /api/products`). */
export interface ProductDto {
  readonly id: string;
  readonly name: string;
}

/** An alarm of a product (`GET /api/products/:productId/alarms`). */
export interface AlarmDto {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
}

/** An environment of a product (`GET /api/products/:productId/environments`). */
export interface EnvironmentDto {
  readonly id: string;
  readonly name: string;
}

/** A fired-alarm occurrence (`GET /api/alarm-events`). */
export interface AlarmEventDto {
  readonly id: string;
  readonly name: string;
  readonly firedAt: string;
  readonly awsRegion: string;
  readonly awsAccountId: string;
  readonly analysisId: string | null;
  readonly environment?: { readonly id: string; readonly name: string };
}

/** A tracking entry inside an analysis (per-occurrence error detail). */
interface TrackingEntry {
  readonly traceId: string;
  readonly errorCode?: string;
  readonly errorDetail?: string;
  readonly timestamp?: string;
}

/** A hand-written analysis (`GET /api/products/:productId/analyses/:id`). */
export interface AlarmAnalysisDto {
  readonly id: string;
  readonly analysisType: 'ANALYZABLE' | 'IGNORABLE';
  readonly status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED';
  readonly occurrences: number;
  readonly firstAlarmAt: string;
  readonly lastAlarmAt: string;
  readonly errorDetails: string | null;
  readonly conclusionNotes: string | null;
  readonly trackingIds: ReadonlyArray<TrackingEntry>;
  readonly downstreams: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly resources: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly finalActions: ReadonlyArray<{ readonly id: string; readonly name: string }>;
}
