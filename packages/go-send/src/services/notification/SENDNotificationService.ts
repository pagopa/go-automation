/**
 * Notification Service for sending and managing notifications
 */

import type { GOAbortableRequest } from '@go-automation/go-common/core';
import { GOBackoff, GOHttpClient, GOPoller, GOPollingError } from '@go-automation/go-common/core';

import type { SENDNotificationCreationResponse } from './models/SENDNotificationCreationResponse.js';
import type { SENDNotificationRequest } from './models/SENDNotificationRequest.js';
import type { SENDNotificationServiceConfig } from './models/SENDNotificationServiceConfig.js';
import type { SENDNotificationStatusError } from './models/SENDNotificationStatusResponse.js';
import type { SENDNotificationStatusResponse } from './models/SENDNotificationStatusResponse.js';
import { SENDNotificationStatus } from './models/SENDNotificationStatus.js';

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
  onAttempt?: PollIUNAttemptHandler;
  /** Notification statuses that terminate polling without an IUN */
  terminalFailureStatuses?: ReadonlyArray<string>;
}

export type PollIUNAttemptHandler = (attempt: number, status: SENDNotificationStatusResponse) => void;

export interface SENDNotificationPollingTerminalError extends Error {
  readonly name: 'SENDNotificationPollingTerminalError';
  readonly notificationRequestId: string;
  readonly terminalStatus: string;
  readonly statusResponse: SENDNotificationStatusResponse;
}

export function isSENDNotificationPollingTerminalError(error: unknown): error is SENDNotificationPollingTerminalError {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as {
    readonly name?: unknown;
    readonly notificationRequestId?: unknown;
    readonly terminalStatus?: unknown;
    readonly statusResponse?: unknown;
  };

  return (
    candidate.name === 'SENDNotificationPollingTerminalError' &&
    typeof candidate.notificationRequestId === 'string' &&
    typeof candidate.terminalStatus === 'string' &&
    isSENDNotificationStatusResponse(candidate.statusResponse)
  );
}

function isSENDNotificationStatusResponse(value: unknown): value is SENDNotificationStatusResponse {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as {
    readonly notificationRequestId?: unknown;
    readonly notificationRequestStatus?: unknown;
    readonly iun?: unknown;
    readonly errors?: unknown;
  };

  return (
    typeof candidate.notificationRequestId === 'string' &&
    typeof candidate.notificationRequestStatus === 'string' &&
    (candidate.iun === undefined || typeof candidate.iun === 'string') &&
    (candidate.errors === undefined || Array.isArray(candidate.errors))
  );
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

    const response = await this.httpClient.post<SENDNotificationCreationResponse>(path, notification);

    return response;
  }

  /**
   * Get notification status
   * @param notificationRequestId - Notification request ID
   * @returns Notification status
   */
  async getNotificationStatus(notificationRequestId: string): Promise<SENDNotificationStatusResponse> {
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
    const terminalFailureStatuses = new Set(options?.terminalFailureStatuses ?? [SENDNotificationStatus.REFUSED]);

    const poller = new GOPoller({
      maxAttempts,
      backoff: GOBackoff.constant(delayMs),
    });

    try {
      return await poller.poll<string, SENDNotificationPollingTerminalError>(async (attempt) => {
        const status = await this.getNotificationStatus(notificationRequestId);

        // Preserve legacy callback semantics: invoked for EVERY status check
        // (including the one that triggers success or terminal failure), with
        // attempt indices starting at 1 (the poller passes 0-based indices).
        if (onAttempt) {
          onAttempt(attempt + 1, status);
        }

        if (status.iun) {
          return { type: 'success', value: status.iun };
        }
        if (terminalFailureStatuses.has(status.notificationRequestStatus)) {
          return {
            type: 'failure',
            error: createPollingTerminalError(notificationRequestId, status),
            reason: status.notificationRequestStatus,
          };
        }
        return { type: 'continue', reason: status.notificationRequestStatus };
      });
    } catch (error) {
      // Translate GOPoller's infrastructure timeout into the legacy message so
      // callers that match on its text continue to work. Domain errors
      // (SENDNotificationPollingTerminalError) propagate as-is from the poller.
      if (error instanceof GOPollingError && error.kind === 'timeout') {
        throw new Error(
          `IUN not available after ${String(maxAttempts)} attempts for notification ${notificationRequestId}`,
          { cause: error },
        );
      }
      throw error;
    }
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
  getNotificationStatusAbortable(notificationRequestId: string): GOAbortableRequest<SENDNotificationStatusResponse> {
    const path = `/delivery/requests?notificationRequestId=${notificationRequestId}`;
    return this.httpClient.getAbortable<SENDNotificationStatusResponse>(path);
  }
}

function createPollingTerminalError(
  notificationRequestId: string,
  statusResponse: SENDNotificationStatusResponse,
): SENDNotificationPollingTerminalError {
  const status = statusResponse.notificationRequestStatus;
  const errorDetails = formatStatusErrors(statusResponse.errors);
  const details = errorDetails ? ` Errors: ${errorDetails}` : '';
  const error = new Error(
    `Notification ${notificationRequestId} reached terminal status ${status} before IUN was available.${details}`,
  ) as SENDNotificationPollingTerminalError;
  Object.defineProperties(error, {
    name: { value: 'SENDNotificationPollingTerminalError' },
    notificationRequestId: { value: notificationRequestId },
    terminalStatus: { value: status },
    statusResponse: { value: statusResponse },
  });
  return error;
}

function formatStatusErrors(errors: ReadonlyArray<SENDNotificationStatusError> | undefined): string {
  if (!errors || errors.length === 0) return '';
  return errors.map((error) => (typeof error === 'string' ? error : JSON.stringify(error))).join('; ');
}
