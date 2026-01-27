/**
 * Notification Service for sending and managing notifications
 */

import type { GOAbortableRequest } from '../../../core/network/GOAbortableRequest.js';
import { GOHttpClient } from '../../../core/network/GOHttpClient.js';

import type { SENDNotificationCreationResponse } from './models/SENDNotificationCreationResponse.js';
import type { SENDNotificationRequest } from './models/SENDNotificationRequest.js';
import type { SENDNotificationServiceConfig } from './models/SENDNotificationServiceConfig.js';
import type { SENDNotificationStatusResponse } from './models/SENDNotificationStatusResponse.js';

/**
 * Group information from PA registry
 */
export interface GroupInfo {
  /** Group ID */
  id: string;
  /** Group name */
  name: string;
  /** Group description */
  description?: string;
  /** Group status */
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
}

/**
 * Options for polling IUN
 */
export interface PollIunOptions {
  /** Maximum number of attempts (default: 8) */
  maxAttempts?: number;
  /** Delay between attempts in milliseconds (default: 30000) */
  delayMs?: number;
  /** Callback called on each attempt */
  onAttempt?: (attempt: number, status: SENDNotificationStatusResponse) => void;
}

/**
 * Service for managing notifications
 */
export class SENDNotificationService {
  private readonly httpClient: GOHttpClient;

  constructor(config: SENDNotificationServiceConfig) {
    this.httpClient = new GOHttpClient({
      baseUrl: config.basePath,
      defaultHeaders: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      proxyUrl: config.proxyUrl,
      timeout: config.timeout,
      debug: config.debug,
    });
  }

  /**
   * Send a notification
   * @param notification - Notification request
   * @param apiVersion - API version to use (default: 'v2.5')
   * @returns Creation response with notificationRequestId
   */
  async sendNotification(
    notification: SENDNotificationRequest,
    apiVersion: 'v2.5' | 'v2.4' = 'v2.4',
  ): Promise<SENDNotificationCreationResponse> {
    const path = `/delivery/${apiVersion}/requests`;

    const response = await this.httpClient.post<SENDNotificationCreationResponse>(
      path,
      notification,
    );

    return response;
  }

  /**
   * Get notification status
   * @param notificationRequestId - Notification request ID
   * @returns Notification status
   */
  async getNotificationStatus(
    notificationRequestId: string,
  ): Promise<SENDNotificationStatusResponse> {
    const path = `/delivery/requests?notificationRequestId=${notificationRequestId}`;
    const response = await this.httpClient.get<SENDNotificationStatusResponse>(path);
    return response;
  }

  /**
   * Poll for IUN until available or max attempts reached
   * @param notificationRequestId - Notification request ID
   * @param options - Polling options
   * @returns IUN when available
   * @throws Error if IUN not available after max attempts
   */
  async pollForIun(notificationRequestId: string, options?: PollIunOptions): Promise<string> {
    const maxAttempts = options?.maxAttempts ?? 8;
    const delayMs = options?.delayMs ?? 30000;
    const onAttempt = options?.onAttempt;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.getNotificationStatus(notificationRequestId);

      if (onAttempt) {
        onAttempt(attempt, status);
      }

      if (status.iun) {
        return status.iun;
      }

      if (attempt < maxAttempts) {
        await this.sleep(delayMs);
      }
    }

    throw new Error(
      `IUN not available after ${maxAttempts} attempts for notification ${notificationRequestId}`,
    );
  }

  /**
   * Send notification and wait for IUN
   * @param notification - Notification request
   * @param pollOptions - Polling options
   * @returns Object with notificationRequestId and IUN
   */
  async sendAndWaitForIun(
    notification: SENDNotificationRequest,
    pollOptions?: PollIunOptions,
  ): Promise<{ notificationRequestId: string; iun: string }> {
    const response = await this.sendNotification(notification);
    const iun = await this.pollForIun(response.notificationRequestId, pollOptions);

    return {
      notificationRequestId: response.notificationRequestId,
      iun,
    };
  }

  /**
   * Get list of groups for the PA
   * @param metadataOnly - Whether to retrieve only metadata (default: true)
   * @returns List of groups
   */
  async getGroups(metadataOnly: boolean = true): Promise<GroupInfo[]> {
    const path = `/ext-registry-b2b/pa/v1/groups?metadataOnly=${metadataOnly}`;
    const response = await this.httpClient.get<GroupInfo[]>(path);
    return response;
  }

  /**
   * Get first active group for the PA
   * @returns First active group or undefined
   */
  async getActiveGroup(): Promise<GroupInfo | undefined> {
    const groups = await this.getGroups(true);
    return groups.find((group) => group.status === 'ACTIVE');
  }

  /**
   * Send a notification (abortable)
   * Returns an object with the promise and abort function
   * @param notification - Notification request
   * @param apiVersion - API version to use (default: 'v2.5')
   * @returns Abortable request with promise and abort function
   */
  sendNotificationAbortable(
    notification: SENDNotificationRequest,
    apiVersion: 'v2.5' | 'v2.4' = 'v2.5',
  ): GOAbortableRequest<SENDNotificationCreationResponse> {
    const path = `/delivery/${apiVersion}/requests`;
    return this.httpClient.postAbortable<SENDNotificationCreationResponse>(path, notification);
  }

  /**
   * Get notification status (abortable)
   * Returns an object with the promise and abort function
   * @param notificationRequestId - Notification request ID
   * @returns Abortable request with promise and abort function
   */
  getNotificationStatusAbortable(
    notificationRequestId: string,
  ): GOAbortableRequest<SENDNotificationStatusResponse> {
    const path = `/delivery/requests?notificationRequestId=${notificationRequestId}`;
    return this.httpClient.getAbortable<SENDNotificationStatusResponse>(path);
  }

  /**
   * Sleep utility for polling
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
