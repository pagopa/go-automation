import { GOHttpClientError } from '@go-automation/go-common/core';

import type { SENDApiVersion } from '../../../services/notification/models/SENDApiVersion.js';
import type { SENDNotificationCreationResponse } from '../../../services/notification/models/SENDNotificationCreationResponse.js';
import type { SENDNotificationRequest } from '../../../services/notification/models/SENDNotificationRequest.js';
import type { SENDNotificationStatusResponse } from '../../../services/notification/models/SENDNotificationStatusResponse.js';
import type { B2BApi } from '../../channels/B2BApi.js';
import type { DispatchClock } from '../../model/DispatchClock.js';
import type { DispatchGroup } from '../../model/DispatchGroup.js';

/** A call received by the fake. */
export interface FakeCall {
  readonly at: number;
  readonly op: string;
}

/** A notification created by the fake. */
export interface FakeNotification {
  readonly notificationRequestId: string;
  readonly iun: string;
  readonly request: SENDNotificationRequest;
}

/** Scripted status of one check. */
export type FakeStatusOutcome = 'WAITING' | 'ACCEPTED' | 'REFUSED' | GOHttpClientError;

/** Scripted outcome of one POST: an error to throw, or `created` (default). */
export type FakeSendOutcome = 'created' | 'created-then-timeout' | GOHttpClientError;

/** Builds a `GOHttpClientError` like the real client does. */
export function httpError(status: number, body?: unknown, retryAfterMs?: number): GOHttpClientError {
  return new GOHttpClientError(`HTTP ${status}`, status, body, 1, retryAfterMs);
}

/** Builds a transport error (no status), like a timeout. */
export function transportError(): GOHttpClientError {
  return new GOHttpClientError('Request aborted');
}

/** Base64 of a fake IUN derived from a counter. */
function fakeIun(n: number): string {
  const letters = (value: number): string =>
    Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + (Math.floor(value / 26 ** i) % 26))).join('');
  return `${letters(n)}-${letters(n + 7)}-${letters(n + 13)}-202611-A-${n % 10}`;
}

/**
 * In-memory SEND B2B API. Notifications are keyed by protocol + token, so a
 * second POST with the same keys gets `409` like the real service.
 */
export class FakeB2BApi implements B2BApi {
  public readonly calls: FakeCall[] = [];
  public readonly created: Map<string, FakeNotification> = new Map<string, FakeNotification>();
  public readonly sendScript: FakeSendOutcome[] = [];
  public statusScript: FakeStatusOutcome[] = [];
  public groupsResult: ReadonlyArray<DispatchGroup> | GOHttpClientError = [
    { id: 'group-1', name: 'Ente di test', status: 'ACTIVE' },
  ];
  public sendLatencyMs = 0;

  constructor(private readonly clock: DispatchClock) {}

  public async send(
    request: SENDNotificationRequest,
    _apiVersion: SENDApiVersion,
  ): Promise<SENDNotificationCreationResponse> {
    this.calls.push({ at: this.clock.now(), op: 'send' });
    if (this.sendLatencyMs > 0) await this.clock.sleep(this.sendLatencyMs);
    const outcome = this.sendScript.shift() ?? 'created';
    if (outcome instanceof GOHttpClientError) throw outcome;
    const key = `${request.paProtocolNumber}##${request.idempotenceToken ?? ''}`;
    if (this.created.has(key)) {
      throw httpError(409, {
        errors: [{ code: 'PN_GENERIC_INVALIDPARAMETER_DUPLICATED', element: `00000000000##${key}` }],
      });
    }
    const iun = fakeIun(this.created.size + 1);
    const notificationRequestId = Buffer.from(iun, 'utf8').toString('base64');
    this.created.set(key, { notificationRequestId, iun, request });
    if (outcome === 'created-then-timeout') throw transportError();
    return { notificationRequestId, paProtocolNumber: request.paProtocolNumber };
  }

  public async status(
    notificationRequestId: string,
    _apiVersion: SENDApiVersion,
  ): Promise<SENDNotificationStatusResponse> {
    await Promise.resolve();
    this.calls.push({ at: this.clock.now(), op: 'status' });
    const entry = [...this.created.values()].find((item) => item.notificationRequestId === notificationRequestId);
    const scripted = this.statusScript.shift() ?? 'ACCEPTED';
    if (scripted instanceof GOHttpClientError) throw scripted;
    if (entry === undefined) throw httpError(404);
    return {
      notificationRequestId,
      notificationRequestStatus: scripted,
      ...(scripted === 'ACCEPTED' && { iun: entry.iun }),
      ...(scripted === 'WAITING' && { retryAfter: 10 }),
      ...(scripted === 'REFUSED' && { errors: [{ code: 'FILE_NOTFOUND', detail: 'missing' }] }),
    };
  }

  public async lookup(
    paProtocolNumber: string,
    idempotenceToken: string,
    _apiVersion: SENDApiVersion,
  ): Promise<SENDNotificationStatusResponse> {
    await Promise.resolve();
    this.calls.push({ at: this.clock.now(), op: 'lookup' });
    const entry = this.created.get(`${paProtocolNumber}##${idempotenceToken}`);
    if (entry === undefined) throw httpError(404);
    return { notificationRequestId: entry.notificationRequestId, notificationRequestStatus: 'WAITING' };
  }

  public async groups(): Promise<ReadonlyArray<DispatchGroup>> {
    await Promise.resolve();
    this.calls.push({ at: this.clock.now(), op: 'groups' });
    if (this.groupsResult instanceof GOHttpClientError) throw this.groupsResult;
    return this.groupsResult;
  }

  /** Number of calls of an operation. */
  public count(op: string): number {
    return this.calls.filter((call) => call.op === op).length;
  }
}
