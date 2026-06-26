/** SQS/Lambda envelope metadata kept separate from the WT command body. */
export interface ExecuteRunbookDelivery {
  readonly sqsMessageId: string;
  readonly approximateReceiveCount: number;
  readonly workerDeadlineAt: string;
}
