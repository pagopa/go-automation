import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ExecuteRunbookDelivery } from '../../types/ExecuteRunbookDelivery.js';
import type { ExecuteRunbookDeps } from '../../types/ExecuteRunbookDeps.js';
import { failPreStartCommand } from '../failPreStartCommand.js';

const EXECUTION_ID = '0192c000-0000-7000-8000-000000000001';
const DELIVERY: ExecuteRunbookDelivery = {
  sqsMessageId: 'message-1',
  approximateReceiveCount: 1,
  workerDeadlineAt: new Date(Date.now() + 60_000).toISOString(),
};

describe('failPreStartCommand', () => {
  it('treats cancellation and terminal conflicts as ACKable no-ops', async () => {
    for (const conflict of ['CANCELLATION_REQUESTED', 'CANNOT_CANCEL_TERMINAL'] as const) {
      await assert.doesNotReject(
        failPreStartCommand(fakeDeps({ conflict, status: 'FAILED' }), EXECUTION_ID, DELIVERY, invalidCommandError()),
      );
    }
  });

  it('rejects idempotency payload mismatch conflicts', async () => {
    await assert.rejects(
      failPreStartCommand(
        fakeDeps({ conflict: 'IDEMPOTENCY_PAYLOAD_MISMATCH', status: 'FAILED' }),
        EXECUTION_ID,
        DELIVERY,
        invalidCommandError(),
      ),
      /IDEMPOTENCY_PAYLOAD_MISMATCH/,
    );
  });
});

function fakeDeps(result: Readonly<Record<string, unknown>>): ExecuteRunbookDeps {
  return {
    watchtower: {
      failExecution: async () => {
        await Promise.resolve();
        return result;
      },
    },
  } as unknown as ExecuteRunbookDeps;
}

function invalidCommandError(): Error & { readonly workerFailureCode: 'INVALID_COMMAND' } {
  return Object.assign(new Error('bad command'), { workerFailureCode: 'INVALID_COMMAND' as const });
}
