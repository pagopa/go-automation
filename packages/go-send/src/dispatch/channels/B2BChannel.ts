import type { GOHttpRequestOptions } from '@go-automation/go-common/core';

import type { SENDApiVersion } from '../../services/notification/models/SENDApiVersion.js';
import type { SENDNotificationCreationResponse } from '../../services/notification/models/SENDNotificationCreationResponse.js';
import type { SENDNotificationRequest } from '../../services/notification/models/SENDNotificationRequest.js';
import type { SENDNotificationStatusResponse } from '../../services/notification/models/SENDNotificationStatusResponse.js';
import type { SENDNotificationService } from '../../services/notification/SENDNotificationService.js';
import type { DispatchGroup } from '../model/DispatchGroup.js';
import type { B2BApi } from './B2BApi.js';

/**
 * {@link B2BApi} backed by `SENDNotificationService` (`e2e` mode).
 */
export class B2BChannel implements B2BApi {
  constructor(private readonly service: SENDNotificationService) {}

  /**
   * Creates a notification (`POST requests`).
   *
   * @param request - Notification request
   * @param apiVersion - Version of the `requests` endpoint
   * @returns The `notificationRequestId` assigned by SEND
   * @throws GOHttpClientError on an HTTP error, classified by `classifySendFailure`
   */
  public async send(
    request: SENDNotificationRequest,
    apiVersion: SENDApiVersion,
  ): Promise<SENDNotificationCreationResponse> {
    return this.service.sendNotification(request, apiVersion);
  }

  /**
   * Reads the status of a notification request (verification).
   *
   * @param notificationRequestId - Id returned by `send`
   * @param apiVersion - Version of the `requests` endpoint
   * @param signal - Abandons the check on a stop
   * @returns Status, with the IUN once accepted
   */
  public async status(
    notificationRequestId: string,
    apiVersion: SENDApiVersion,
    signal?: AbortSignal,
  ): Promise<SENDNotificationStatusResponse> {
    return this.service.getNotificationRequestStatus(notificationRequestId, apiVersion, requestOptions(signal));
  }

  /**
   * Finds a notification request by its idempotency keys (reconciliation).
   *
   * @param paProtocolNumber - Protocol number of the row
   * @param idempotenceToken - Idempotence token of the row
   * @param apiVersion - Version of the `requests` endpoint
   * @param signal - Abandons the lookup on a stop
   * @returns Status of the request
   * @throws GOHttpClientError `404` when no request has these keys
   */
  public async lookup(
    paProtocolNumber: string,
    idempotenceToken: string,
    apiVersion: SENDApiVersion,
    signal?: AbortSignal,
  ): Promise<SENDNotificationStatusResponse> {
    return this.service.getNotificationStatusByProtocol(
      paProtocolNumber,
      idempotenceToken,
      apiVersion,
      requestOptions(signal),
    );
  }

  /**
   * Lists the active groups of the API key (preflight).
   *
   * @returns The groups
   */
  public async groups(): Promise<ReadonlyArray<DispatchGroup>> {
    return this.service.getGroups(true);
  }
}

function requestOptions(signal: AbortSignal | undefined): GOHttpRequestOptions | undefined {
  return signal === undefined ? undefined : { signal };
}
