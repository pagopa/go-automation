import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SENDTimelineElement } from '../../../services/timeline/models/SENDTimelineElement.js';
import type { SENDTimelineService } from '../../../services/timeline/SENDTimelineService.js';
import { MemorySink } from '../../__tests__/helpers/MemorySink.js';
import { VirtualClock } from '../../__tests__/helpers/VirtualClock.js';
import { RowLedger } from '../../journal/RowLedger.js';
import { DEFAULT_REQUEST_ID_OPTIONS } from '../defaultRequestIdOptions.js';
import { DynamoTimelineSource } from '../DynamoTimelineSource.js';
import { RequestIdStage } from '../RequestIdStage.js';
import type { TimelineSource } from '../TimelineSource.js';

/** Element that appears in the timeline after `afterMs` of virtual time. */
interface ScheduledElement {
  readonly afterMs: number;
  readonly category: string;
}

class CredentialsExpiredError extends Error {
  constructor() {
    super('The SSO session associated with this profile has expired');
    this.name = 'CredentialsExpiredError';
  }
}

/** Timeline that grows with virtual time; can fail on demand. */
class FakeTimelineSource implements TimelineSource {
  public queries = 0;
  public failWith: Error | undefined;
  /** Remaining queries that fail with `failWith` (unlimited when undefined). */
  public failTimes: number | undefined;
  private readonly start: number;

  constructor(
    private readonly clock: VirtualClock,
    private readonly timelines: ReadonlyMap<string, ReadonlyArray<ScheduledElement>>,
  ) {
    this.start = clock.now();
  }

  public async query(iun: string): Promise<ReadonlyArray<SENDTimelineElement>> {
    await Promise.resolve();
    this.queries += 1;
    if (this.failWith !== undefined && (this.failTimes === undefined || this.failTimes > 0)) {
      if (this.failTimes !== undefined) this.failTimes -= 1;
      throw this.failWith;
    }
    const elapsed = this.clock.now() - this.start;
    return (this.timelines.get(iun) ?? [])
      .filter((element) => element.afterMs <= elapsed)
      .map((element) => ({
        category: element.category,
        timelineElementId: `${element.category}.IUN_${iun}.RECINDEX_0.ATTEMPT_0`,
        timestamp: new Date(this.start + element.afterMs).toISOString(),
      }));
  }
}

function setup(
  timelines: ReadonlyMap<string, ReadonlyArray<ScheduledElement>>,
  isCredentialError = (error: unknown): boolean => error instanceof CredentialsExpiredError,
): { clock: VirtualClock; source: FakeTimelineSource; ledger: RowLedger; sink: MemorySink; stage: RequestIdStage } {
  const clock = new VirtualClock();
  const source = new FakeTimelineSource(clock, timelines);
  const sink = new MemorySink();
  const ledger = new RowLedger(sink, () => new Date(clock.now()));
  const stage = new RequestIdStage({
    source,
    ledger,
    clock,
    selection: DEFAULT_REQUEST_ID_OPTIONS,
    isCredentialError,
    signal: new AbortController().signal,
  });
  return { clock, source, ledger, sink, stage };
}

const MINUTE = 60_000;

describe('RequestIdStage', () => {
  it('finds the PREPARE that appears 70 minutes after acceptance (courtesy channels)', async () => {
    const h = setup(
      new Map([
        [
          'IUN-A',
          [
            { afterMs: 1 * MINUTE, category: 'REQUEST_ACCEPTED' },
            { afterMs: 5 * MINUTE, category: 'PROBABLE_SCHEDULING_ANALOG_DATE' },
            { afterMs: 70 * MINUTE, category: 'PREPARE_ANALOG_DOMICILE' },
          ],
        ],
      ]),
    );
    h.stage.schedule(0, 'S-0', 'IUN-A');
    await h.clock.run(h.stage.drain());
    const state = h.ledger.get(0);
    assert.equal(state?.status, 'REQUEST_ID_FOUND');
    assert.equal(state?.requestId, 'PREPARE_ANALOG_DOMICILE.IUN_IUN-A.RECINDEX_0.ATTEMPT_0');
    assert.equal(state?.requestIdReason, 'FOUND');
    assert.ok(h.clock.elapsed >= 70 * MINUTE && h.clock.elapsed <= 72 * MINUTE, `closed at ${h.clock.elapsed} ms`);
    assert.ok(h.source.queries <= 40, `${h.source.queries} queries`);
  });

  it('closes early when the workflow ends without PREPARE', async () => {
    const h = setup(new Map([['IUN-B', [{ afterMs: 3 * MINUTE, category: 'COMPLETELY_UNREACHABLE' }]]]));
    h.stage.schedule(0, 'S-0', 'IUN-B');
    await h.clock.run(h.stage.drain());
    assert.equal(h.ledger.get(0)?.status, 'REQUEST_ID_NOT_FOUND');
    assert.equal(h.ledger.get(0)?.requestIdReason, 'WORKFLOW_ENDED:COMPLETELY_UNREACHABLE');
  });

  it('times out after 2 hours with an empty timeline', async () => {
    const h = setup(new Map());
    h.stage.schedule(0, 'S-0', 'IUN-C');
    await h.clock.run(h.stage.drain());
    assert.equal(h.ledger.get(0)?.requestIdReason, 'TIMEOUT');
    assert.equal(h.ledger.get(0)?.error, undefined, 'the queries worked: no cause to report');
    assert.equal(h.clock.elapsed, 2 * 3_600_000);
  });

  it('records a row without IUN as REQUEST_ID_NOT_FOUND IUN_UNKNOWN instead of dropping it', async () => {
    const h = setup(new Map());
    h.stage.schedule(0, 'S-0', undefined);
    await h.clock.run(h.stage.drain());
    assert.equal(h.ledger.get(0)?.status, 'REQUEST_ID_NOT_FOUND');
    assert.equal(h.ledger.get(0)?.requestIdReason, 'IUN_UNKNOWN');
    assert.equal(h.ledger.get(0)?.error?.code, 'IUN_UNKNOWN');
    assert.equal(h.source.queries, 0, 'no timeline query without the IUN');
  });

  it('reports the cause of a timeout when the queries kept failing', async () => {
    const h = setup(new Map());
    h.source.failWith = new Error('ResourceNotFoundException: Requested resource not found');
    h.stage.schedule(0, 'S-0', 'IUN-C');
    await h.clock.run(h.stage.drain());
    assert.equal(h.ledger.get(0)?.requestIdReason, 'TIMEOUT');
    assert.equal(h.ledger.get(0)?.error?.code, 'TIMELINE_QUERY_FAILED');
    assert.match(h.ledger.get(0)?.error?.message ?? '', /ResourceNotFoundException/);
  });

  it('tolerates transient query errors', async () => {
    const h = setup(new Map([['IUN-D', [{ afterMs: 0, category: 'PREPARE_DIGITAL_DOMICILE' }]]]));
    h.source.failWith = new Error('ProvisionedThroughputExceededException');
    h.source.failTimes = 2;
    h.stage.schedule(0, 'S-0', 'IUN-D');
    await h.clock.run(h.stage.drain());
    assert.equal(h.ledger.get(0)?.status, 'REQUEST_ID_FOUND');
    assert.equal(h.ledger.get(0)?.requestIdChecks, 3);
    assert.equal(h.ledger.get(0)?.error, undefined);
  });

  it('stops on expired credentials without closing any row', async () => {
    const h = setup(new Map([['IUN-E', []]]));
    h.source.failWith = new CredentialsExpiredError();
    h.stage.schedule(0, 'S-0', 'IUN-E');
    h.stage.schedule(1, 'S-1', 'IUN-F');
    await h.clock.run(h.stage.drain());
    assert.equal(h.stage.credentialsExpired, true);
    assert.equal(h.sink.entries.length, 0, 'no REQUEST_ID_NOT_FOUND: rows stay open for the resume');
    h.stage.schedule(2, 'S-2', 'IUN-G');
    assert.equal(h.stage.pendingCount, 0, 'nothing is scheduled after the stop');
  });

  it('runs no query queued behind the pool after the credentials expired', async () => {
    const clock = new VirtualClock();
    const source = new FakeTimelineSource(clock, new Map());
    source.failWith = new CredentialsExpiredError();
    const stage = new RequestIdStage({
      source,
      ledger: new RowLedger(undefined),
      clock,
      selection: DEFAULT_REQUEST_ID_OPTIONS,
      concurrency: 1,
      isCredentialError: (error) => error instanceof CredentialsExpiredError,
      signal: new AbortController().signal,
    });
    for (let i = 0; i < 5; i++) stage.schedule(i, `S-${i}`, `IUN-${i}`);
    await clock.run(stage.drain());
    assert.equal(stage.credentialsExpired, true);
    assert.equal(source.queries, 1, 'the 4 queued queries never reach DynamoDB');
  });

  it('reads pn-Timelines through SENDTimelineService', async () => {
    const elements = [{ category: 'PREPARE_ANALOG_DOMICILE', timelineElementId: 'P', timestamp: 't' }];
    const service = {
      queryTimelineElements: async (iun: string) => {
        await Promise.resolve();
        return iun === 'IUN' ? elements : [];
      },
    };
    const source = new DynamoTimelineSource(service as unknown as SENDTimelineService);
    assert.deepEqual(await source.query('IUN'), elements);
  });
});
