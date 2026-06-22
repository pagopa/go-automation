/* Generated from the WT-owned JSON Schema. Do not edit. */

export interface AutomaticAlarmAnalysisCommandV1 {
  alarmEvent: {
    alarmId: string;
    alarmName: string;
    awsAccountId: string;
    awsRegion: string;
    environmentId: string;
    firedAt: string;
    id: string;
    productId: string;
  };
  executionId: string;
  schemaVersion: "1.0.0";
  trigger: {
    actorId?: string;
    kind: "SLACK_INGESTER" | "WATCHTOWER_UI" | "WATCHTOWER_API" | "RETRY";
    parentExecutionId?: string;
  };
}
