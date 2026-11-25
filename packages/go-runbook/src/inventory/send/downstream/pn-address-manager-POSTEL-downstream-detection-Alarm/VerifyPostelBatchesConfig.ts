export interface VerifyPostelBatchesConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly logGroup: string;
  readonly recoveryAfterMinutes?: number;
}
