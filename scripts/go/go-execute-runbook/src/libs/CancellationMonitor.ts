import type { ProgressExecutionRequest, WatchtowerClient } from '@go-automation/go-watchtower-client';

import type { ExecuteRunbookDelivery } from '../types/ExecuteRunbookDelivery.js';
import { ExecutionAbortCoordinator } from './ExecutionAbortCoordinator.js';

export interface CancellationMonitorOptions {
  readonly intervalMs?: number;
  readonly jitterRatio?: number;
  readonly maxConsecutiveFailures?: number;
  readonly maxUnavailableMs?: number;
  readonly random?: CancellationMonitorRandomFn;
}

type CancellationMonitorRandomFn = () => number;

/** Single-flight heartbeat loop that turns persistent control-plane loss into a typed abort. */
export class CancellationMonitor {
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;
  private stopped = false;
  private phase = 'STARTED';
  private consecutiveFailures = 0;
  private unavailableSinceMs: number | undefined;
  private observedCancelRequestId: string | undefined;

  constructor(
    private readonly client: Pick<WatchtowerClient, 'progressExecution'>,
    private readonly executionId: string,
    private readonly attemptId: string,
    private readonly delivery: ExecuteRunbookDelivery,
    private readonly coordinator: ExecutionAbortCoordinator,
    private readonly options: CancellationMonitorOptions = {},
  ) {}

  get cancelRequestId(): string | undefined {
    return this.observedCancelRequestId;
  }

  async start(phase: string): Promise<void> {
    this.phase = phase;
    await this.progress(phase);
    this.schedule();
  }

  async progress(phase: string): Promise<void> {
    this.phase = phase;
    if (this.inFlight !== undefined) return await this.inFlight;
    this.inFlight = this.sendProgress().finally(() => {
      this.inFlight = undefined;
    });
    return await this.inFlight;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    if (this.inFlight !== undefined) await this.inFlight.catch(() => undefined);
  }

  private async sendProgress(): Promise<void> {
    const heartbeatSequence = ++this.sequence;
    const request: ProgressExecutionRequest = {
      attemptId: this.attemptId,
      phase: this.phase,
      heartbeatSequence,
      sqsMessageId: this.delivery.sqsMessageId,
      approximateReceiveCount: this.delivery.approximateReceiveCount,
    };
    try {
      const response = await this.client.progressExecution(this.executionId, request, {
        idempotencyKey: `progress:${this.executionId}:${this.attemptId}:${heartbeatSequence}`,
        deadlineAtMs: Date.parse(this.delivery.workerDeadlineAt),
        signal: this.coordinator.signal,
      });
      this.consecutiveFailures = 0;
      this.unavailableSinceMs = undefined;
      if (response.staleAttempt === true) {
        this.coordinator.abort('CONTROL_PLANE_UNAVAILABLE');
      } else if (response.cancelRequested) {
        this.observedCancelRequestId = response.cancelRequestId;
        this.coordinator.abort('USER_CANCELLED');
      }
    } catch (error: unknown) {
      if (this.coordinator.cause !== undefined) return;
      this.consecutiveFailures += 1;
      this.unavailableSinceMs ??= Date.now();
      if (
        this.consecutiveFailures >= (this.options.maxConsecutiveFailures ?? 3) ||
        Date.now() - this.unavailableSinceMs >= (this.options.maxUnavailableMs ?? 20_000)
      ) {
        this.coordinator.abort('CONTROL_PLANE_UNAVAILABLE');
      }
      throw error;
    }
  }

  private schedule(): void {
    if (this.stopped || this.coordinator.signal.aborted) return;
    const interval = this.options.intervalMs ?? 5_000;
    const jitter = this.options.jitterRatio ?? 0.2;
    const random = this.options.random?.() ?? Math.random();
    const delay = Math.round(interval * (1 - jitter + random * jitter * 2));
    this.timer = setTimeout(() => {
      this.progress(this.phase)
        .catch(() => undefined)
        .finally(() => this.schedule());
    }, delay);
  }
}
