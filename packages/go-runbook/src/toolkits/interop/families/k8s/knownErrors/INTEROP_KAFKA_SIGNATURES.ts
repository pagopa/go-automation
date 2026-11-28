import type { InteropKafkaSignatures } from './InteropKafkaSignatures.js';

/** A coordinator that does not know the member, after the request that received the answer. */
const UNKNOWN_MEMBER = 'The coordinator is not aware of this member\\b';
/** The consumer joining the group again because the coordinator does not know it. */
const REJOIN = 'The coordinator is not aware of this member,\\s*re-joining the group';
/** A broker that is not the coordinator of the group. */
const WRONG_COORDINATOR = 'This is not the correct coordinator for this group\\b';

/**
 * The KafkaJS signatures of the INTEROP consumers, as regular expressions matched against the application logs: one
 * definition for every runbook, each in its widest form (any protocol version, any spacing, every group request).
 *
 * The forms of the same error stay distinct, because a runbook recognizes the forms its documentation lists: the bare
 * message, the answer to a request, the rejoin. A runbook combines them, anchors them to the error line with
 * `interopErrorLine` where it needs to, and keeps its own resolution and links.
 *
 * @example
 * ```typescript
 * const { unknownMemberHeartbeat, unknownMemberRejoin } = INTEROP_KAFKA_SIGNATURES;
 * stepEvidenceMatches(stepId, interopErrorLine(unknownMemberHeartbeat, unknownMemberRejoin));
 * ```
 */
export const INTEROP_KAFKA_SIGNATURES: InteropKafkaSignatures = {
  unknownMember: UNKNOWN_MEMBER,
  unknownMemberHeartbeat: `Response Heartbeat\\(key:\\s*12,\\s*version:\\s*\\d+\\)\\s*-\\s*${UNKNOWN_MEMBER}`,
  unknownMemberRejoin: `${REJOIN}\\b`,
  unknownMemberRejoinWithReason: `${REJOIN}\\s*-\\s*${UNKNOWN_MEMBER}`,
  wrongCoordinator: WRONG_COORDINATOR,
  wrongCoordinatorResponse: `Response (?:Heartbeat\\(key:\\s*12|JoinGroup\\(key:\\s*11|LeaveGroup\\(key:\\s*13),\\s*version:\\s*\\d+\\)\\s*-\\s*${WRONG_COORDINATOR}`,
  connectionRefused: 'Connection\\s+error:\\s*connect ECONNREFUSED\\b',
  tlsDisconnected:
    'Connection\\s+error:\\s*Client network socket disconnected before secure TLS connection was established\\b',
  connectionTimeout: 'Connection\\s+timeout\\b',
  offsetCommitTimeout: 'Response OffsetCommit\\(key:\\s*8,\\s*version:\\s*\\d+\\)\\s*-\\s*The request timed out\\b',
};
