import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { INTEROP_KAFKA_SIGNATURES } from '../INTEROP_KAFKA_SIGNATURES.js';
import type { InteropKafkaSignatures } from '../InteropKafkaSignatures.js';
import { interopErrorLine } from '../interopErrorLine.js';

/** Lines of the INTEROP consumers each form recognizes, and similar lines it must not. */
const VARIANTS: ReadonlyArray<{
  readonly form: keyof InteropKafkaSignatures;
  readonly matches: ReadonlyArray<string>;
  readonly rejects: ReadonlyArray<string>;
}> = [
  {
    form: 'unknownMember',
    matches: [
      'The coordinator is not aware of this member',
      'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member',
    ],
    rejects: ['The coordinator is not aware of this membership', 'The group coordinator is not available'],
  },
  {
    form: 'unknownMemberHeartbeat',
    matches: [
      'Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member',
      'ERROR - Response Heartbeat(key:  12,  version:  4)  -  The coordinator is not aware of this member',
    ],
    rejects: [
      'Response Heartbeat(key: 13, version: 3) - The coordinator is not aware of this member',
      'Response OffsetCommit(key: 8, version: 5) - The coordinator is not aware of this member',
      'Response Heartbeat(key: 12, version: 3) - The coordinator is not available',
    ],
  },
  {
    form: 'unknownMemberRejoin',
    matches: [
      'The coordinator is not aware of this member, re-joining the group',
      'The coordinator is not aware of this member,  re-joining the group - The coordinator is not aware of this member',
    ],
    rejects: [
      'The coordinator is not aware of this member',
      'The coordinator is not aware of another member, re-joining the group',
      'The coordinator is not aware of this member, re-joining the groups',
    ],
  },
  {
    form: 'unknownMemberRejoinWithReason',
    matches: [
      'The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member',
    ],
    rejects: ['The coordinator is not aware of this member, re-joining the group'],
  },
  {
    form: 'wrongCoordinator',
    matches: [
      'This is not the correct coordinator for this group',
      'Crash: KafkaJSNonRetriableError: This is not the correct coordinator for this group',
    ],
    rejects: ['This is not the correct coordinator for this groups'],
  },
  {
    form: 'wrongCoordinatorResponse',
    matches: [
      'Response Heartbeat(key: 12, version: 3) - This is not the correct coordinator for this group',
      'Response Heartbeat(key:12, version:4) - This is not the correct coordinator for this group',
      'Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
      'Response LeaveGroup(key: 13, version: 3) - This is not the correct coordinator for this group',
    ],
    rejects: [
      'Response Metadata(key: 3, version: 6) - This is not the correct coordinator for this group',
      'Crash: KafkaJSNonRetriableError: This is not the correct coordinator for this group',
    ],
  },
  {
    form: 'connectionRefused',
    matches: ['Connection error: connect ECONNREFUSED 10.0.0.10:9098', 'Connection  error:connect ECONNREFUSED'],
    rejects: ['Connection error: connect ETIMEDOUT', 'Connection error: read ECONNRESET'],
  },
  {
    form: 'tlsDisconnected',
    matches: [
      'Connection error: Client network socket disconnected before secure TLS connection was established',
      'Connection  error:Client network socket disconnected before secure TLS connection was established',
    ],
    rejects: ['Client network socket disconnected before secure TLS connection was established'],
  },
  {
    form: 'connectionTimeout',
    matches: ['Connection timeout', 'Connection  timeout after 1000ms'],
    rejects: ['Connection timeouts', 'Connection error: connect ETIMEDOUT'],
  },
  {
    form: 'offsetCommitTimeout',
    matches: [
      'Response OffsetCommit(key: 8, version: 5) - The request timed out',
      'ERROR -  Response OffsetCommit(key:8,  version: 7)  -  The request timed out',
    ],
    rejects: [
      'Response OffsetCommit(key: 8, version: 5) - The coordinator is not aware of this member',
      'Response Heartbeat(key: 12, version: 3) - The request timed out',
      'The request timed out',
    ],
  },
];

describe('INTEROP_KAFKA_SIGNATURES', () => {
  for (const { form, matches, rejects } of VARIANTS) {
    it(`recognizes the ${form} variants seen in the runbooks, and no similar line`, () => {
      const pattern = new RegExp(INTEROP_KAFKA_SIGNATURES[form], 'u');
      for (const line of matches) assert.ok(pattern.test(line), line);
      for (const line of rejects) assert.ok(!pattern.test(line), line);
    });
  }
});

describe('interopErrorLine', () => {
  it('recognizes the signatures only as the message of an error line', () => {
    const pattern = new RegExp(
      interopErrorLine(INTEROP_KAFKA_SIGNATURES.connectionRefused, INTEROP_KAFKA_SIGNATURES.connectionTimeout),
      'u',
    );
    assert.ok(pattern.test('ERROR - Connection error: connect ECONNREFUSED 10.0.0.10:9098'));
    assert.ok(pattern.test('ERROR-Connection timeout'));
    assert.ok(!pattern.test('Request failed: Connection timeout'));
    assert.ok(!pattern.test('ERROR - Crash: KafkaJSNumberOfRetriesExceeded: Connection error: connect ECONNREFUSED'));
  });
});
