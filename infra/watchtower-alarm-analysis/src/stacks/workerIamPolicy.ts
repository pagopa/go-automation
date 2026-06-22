export interface WorkerIamPolicyInput {
  readonly region: string;
  readonly logGroupArns: ReadonlyArray<string>;
  readonly athenaWorkgroupArns: ReadonlyArray<string>;
  readonly athenaResultObjectArns: ReadonlyArray<string>;
  readonly servicePrincipalSecretArn: string;
}

export interface WorkerIamStatement {
  readonly effect: 'Allow';
  readonly actions: ReadonlyArray<string>;
  readonly resources: ReadonlyArray<string>;
  readonly conditions?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** Least-privilege worker policy model used by SST transforms and snapshot tests. */
export function buildWorkerIamPolicy(input: WorkerIamPolicyInput): ReadonlyArray<WorkerIamStatement> {
  if (input.logGroupArns.length === 0) throw new Error('Worker IAM requires explicit log group ARNs');
  return [
    {
      effect: 'Allow',
      actions: ['logs:StartQuery', 'logs:GetQueryResults'],
      resources: [...input.logGroupArns],
    },
    {
      effect: 'Allow',
      actions: ['logs:StopQuery'],
      resources: ['*'],
      conditions: { StringEquals: { 'aws:RequestedRegion': input.region } },
    },
    ...(input.athenaWorkgroupArns.length === 0
      ? []
      : [
          {
            effect: 'Allow' as const,
            actions: [
              'athena:StartQueryExecution',
              'athena:GetQueryExecution',
              'athena:GetQueryResults',
              'athena:StopQueryExecution',
            ],
            resources: [...input.athenaWorkgroupArns],
          },
        ]),
    ...(input.athenaResultObjectArns.length === 0
      ? []
      : [
          {
            effect: 'Allow' as const,
            actions: ['s3:GetObject', 's3:PutObject', 's3:GetBucketLocation'],
            resources: [...input.athenaResultObjectArns],
          },
        ]),
    {
      effect: 'Allow',
      actions: ['secretsmanager:GetSecretValue'],
      resources: [input.servicePrincipalSecretArn],
    },
  ];
}
