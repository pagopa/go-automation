import type { SENDApiVersion } from '../../services/notification/models/SENDApiVersion.js';
import type { SENDNotificationCreationResponse } from '../../services/notification/models/SENDNotificationCreationResponse.js';
import type { SENDNotificationRequest } from '../../services/notification/models/SENDNotificationRequest.js';
import type { SENDNotificationStatusResponse } from '../../services/notification/models/SENDNotificationStatusResponse.js';
import type { DispatchGroup } from '../model/DispatchGroup.js';

/**
 * Calls of the SEND B2B API used by a run; faked in tests.
 *
 * Failures reject with `GOHttpClientError` (status code and parsed body).
 * Only the read-only calls take an abort signal: `send` is never aborted, so
 * the outcome of a POST in flight is always journaled.
 */
export interface B2BApi {
  send(request: SENDNotificationRequest, apiVersion: SENDApiVersion): Promise<SENDNotificationCreationResponse>;
  status(
    notificationRequestId: string,
    apiVersion: SENDApiVersion,
    signal?: AbortSignal,
  ): Promise<SENDNotificationStatusResponse>;
  lookup(
    paProtocolNumber: string,
    idempotenceToken: string,
    apiVersion: SENDApiVersion,
    signal?: AbortSignal,
  ): Promise<SENDNotificationStatusResponse>;
  groups(): Promise<ReadonlyArray<DispatchGroup>>;
}
