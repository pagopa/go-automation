import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildWorkerIamPolicy } from '../stacks/workerIamPolicy.js';

describe('worker IAM policy', () => {
  it('isolates the only wildcard to logs:StopQuery with a region condition', () => {
    const statements = buildWorkerIamPolicy({
      region: 'eu-south-1',
      logGroupArns: ['arn:aws:logs:eu-south-1:123456789012:log-group:/aws/lambda/source'],
      athenaWorkgroupArns: ['arn:aws:athena:eu-south-1:170533023216:workgroup/runbook'],
      athenaResultObjectArns: ['arn:aws:s3:::runbook-results/*'],
      servicePrincipalSecretArn: 'arn:aws:secretsmanager:eu-south-1:170533023216:secret:runbook-worker',
    });
    const wildcard = statements.filter((statement) => statement.resources.includes('*'));
    assert.deepStrictEqual(wildcard, [
      {
        effect: 'Allow',
        actions: ['logs:StopQuery'],
        resources: ['*'],
        conditions: { StringEquals: { 'aws:RequestedRegion': 'eu-south-1' } },
      },
    ]);
    assert.ok(statements.every((statement) => !statement.actions.includes('lambda:DeleteFunction')));
    assert.ok(statements.every((statement) => !statement.actions.includes('sqs:DeleteMessage')));
  });

  it('grants S3 bucket-location permission on bucket ARNs and object access on object ARNs', () => {
    const statements = buildWorkerIamPolicy({
      region: 'eu-south-1',
      logGroupArns: ['arn:aws:logs:eu-south-1:123456789012:log-group:/aws/lambda/source'],
      athenaWorkgroupArns: [],
      athenaResultObjectArns: ['arn:aws:s3:::runbook-results/*', 'arn:aws:s3:::runbook-results/query-output/*'],
      servicePrincipalSecretArn: 'arn:aws:secretsmanager:eu-south-1:170533023216:secret:runbook-worker',
    });

    assert.deepStrictEqual(
      statements.find((statement) => statement.actions.includes('s3:GetBucketLocation')),
      {
        effect: 'Allow',
        actions: ['s3:GetBucketLocation'],
        resources: ['arn:aws:s3:::runbook-results'],
      },
    );
    assert.deepStrictEqual(
      statements.find((statement) => statement.actions.includes('s3:GetObject')),
      {
        effect: 'Allow',
        actions: ['s3:GetObject', 's3:PutObject'],
        resources: ['arn:aws:s3:::runbook-results/*', 'arn:aws:s3:::runbook-results/query-output/*'],
      },
    );
  });
});
