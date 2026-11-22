/** The KafkaJS signatures of the INTEROP consumers, one regular expression per form. */
export interface InteropKafkaSignatures {
  readonly unknownMember: string;
  readonly unknownMemberHeartbeat: string;
  readonly unknownMemberRejoin: string;
  readonly unknownMemberRejoinWithReason: string;
  readonly wrongCoordinator: string;
  readonly wrongCoordinatorResponse: string;
  readonly connectionRefused: string;
  readonly tlsDisconnected: string;
  readonly connectionTimeout: string;
}
