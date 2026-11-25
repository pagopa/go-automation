import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FlagBffReadTimeoutStep } from '../FlagBffReadTimeoutStep.js';
import { BFF_READ_TIMEOUT_VAR } from '../bffReadTimeout.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { messageRow } from '../../../../../__tests__/helpers/logRow.js';

const TIMEOUT =
  'Request to GET http://bff.internal/ext-registry/pa/v1/user-institutions failed: ' +
  'io.netty.handler.timeout.ReadTimeoutException';

describe('FlagBffReadTimeoutStep', () => {
  it('flags the BFF read timeout towards pn-external-registries', async () => {
    const result = await new FlagBffReadTimeoutStep().execute(
      createTestContext({ stepResults: { 'query-pn-bff': [messageRow(TIMEOUT)] } }),
    );
    assert.equal(result.success, true);
    assert.equal(result.vars?.[BFF_READ_TIMEOUT_VAR], 'true');
  });

  it('does not flag another BFF error', async () => {
    const result = await new FlagBffReadTimeoutStep().execute(
      createTestContext({ stepResults: { 'query-pn-bff': [messageRow('500 Internal Server Error')] } }),
    );
    assert.equal(result.vars?.[BFF_READ_TIMEOUT_VAR], 'false');
  });
});
