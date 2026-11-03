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

  public async send(
    request: SENDNotificationRequest,
    apiVersion: SENDApiVersion,
  ): Promise<SENDNotificationCreationResponse> {
    return this.service.sendNotification(request, apiVersion);
  }

  public async status(
    notificationRequestId: string,
    apiVersion: SENDApiVersion,
  ): Promise<SENDNotificationStatusResponse> {
    return this.service.getNotificationRequestStatus(notificationRequestId, apiVersion);
  }

  public async lookup(
    paProtocolNumber: string,
    idempotenceToken: string,
    apiVersion: SENDApiVersion,
  ): Promise<SENDNotificationStatusResponse> {
    return this.service.getNotificationStatusByProtocol(paProtocolNumber, idempotenceToken, apiVersion);
  }

  public async groups(): Promise<ReadonlyArray<DispatchGroup>> {
    return this.service.getGroups(true);
  }
}
