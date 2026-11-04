import { GOPollingError } from '@go-automation/go-common/core';

import type { DispatchClock } from '../../model/DispatchClock.js';

/** Fires a virtual timer. */
type VirtualTimerFireFn = () => void;

interface VirtualTimer {
  readonly at: number;
  readonly seq: number;
  readonly resolve: VirtualTimerFireFn;
}

/** Start of virtual time: 2026-11-03T10:00:00.000Z. */
const VIRTUAL_EPOCH: number = Date.UTC(2026, 10, 3, 10, 0, 0);

/**
 * Deterministic clock for tests: `sleep` registers a virtual timer, and
 * {@link run} advances time to the next timer only when nothing else can
 * progress (microtasks and real I/O are given the chance to settle first).
 */
export class VirtualClock implements DispatchClock {
  private current = VIRTUAL_EPOCH;
  private seq = 0;
  private timers: VirtualTimer[] = [];

  public now(): number {
    return this.current;
  }

  /** Virtual time is monotonic: the same counter as {@link now}. */
  public monotonic(): number {
    return this.current;
  }

  /** Milliseconds elapsed since {@link VIRTUAL_EPOCH}. */
  public get elapsed(): number {
    return this.current - VIRTUAL_EPOCH;
  }

  /** Moves time forward without firing timers (for synchronous tests). */
  public advance(ms: number): void {
    this.current += ms;
  }

  public async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted === true) throw new GOPollingError('aborted', 'Aborted before sleep');
    return new Promise<void>((resolve, reject) => {
      const timer: VirtualTimer = {
        at: this.current + Math.max(0, ms),
        seq: this.seq++,
        resolve: (): void => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
      };
      const onAbort = (): void => {
        this.timers = this.timers.filter((candidate) => candidate !== timer);
        reject(new GOPollingError('aborted', 'Aborted during sleep'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.timers.push(timer);
    });
  }

  /**
   * Drives virtual time until `promise` settles.
   *
   * @param promise - Work to complete
   * @param maxVirtualMs - Safety limit of virtual time
   * @returns The value of `promise`
   */
  public async run<T>(promise: Promise<T>, maxVirtualMs: number = 24 * 3_600_000): Promise<T> {
    let settled = false;
    const tracked = promise.finally(() => {
      settled = true;
    });
    tracked.catch(() => undefined);
    const limit = this.current + maxVirtualMs;
    while (!settled) {
      await settle();
      if (settled) break;
      if (this.timers.length === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2)); // real I/O in progress
        continue;
      }
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.timers[0];
      if (next === undefined) continue;
      if (next.at > limit) throw new Error('VirtualClock: virtual time limit exceeded');
      this.current = Math.max(this.current, next.at);
      const due = this.timers.filter((timer) => timer.at <= this.current);
      this.timers = this.timers.filter((timer) => timer.at > this.current);
      for (const timer of due) timer.resolve();
    }
    return tracked;
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}
