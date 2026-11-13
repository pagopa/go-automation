import { type GOConfigParameterOptions, GOConfigParameterType, type GOScriptMetadata } from '@go-automation/go-script';

export const scriptMetadata: GOScriptMetadata = {
  name: 'Go Execute Runbook',
  version: '1.0.0',
  description: 'Executes one fenced automatic Watchtower runbook lifecycle.',
  authors: ['Team GO - Gestione Operativa'],
};

export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'alarm.event.id',
    type: GOConfigParameterType.STRING,
    description: 'Watchtower alarm event UUID',
    required: false,
  },
  {
    name: 'execution.id',
    type: GOConfigParameterType.STRING,
    description: 'Automatic runbook execution UUID',
    required: false,
  },
  {
    name: 'aws.profiles',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'AWS SSO profile names for local multi-account runbook execution (comma-separated)',
    required: false,
    aliases: ['aps'],
  },
  {
    name: 'aws.region',
    type: GOConfigParameterType.STRING,
    description: 'AWS region for local AWS clients',
    required: false,
    defaultValue: 'eu-south-1',
    aliases: ['ar'],
  },
  {
    name: 'aws.account.directory',
    type: GOConfigParameterType.STRING_ARRAY,
    description:
      'Account directory of the logical AWS accounts read by multi-account runbooks: ' +
      '<product>/<account>/<environment>=<accountId> entries (EVO-AWSACCT-OPUS-01)',
    required: false,
    aliases: ['aad'],
  },
  {
    name: 'aws.account.binding',
    type: GOConfigParameterType.STRING,
    description:
      'How logical accounts are reached: profiles (matched through STS) or oam. ' +
      'Default: profiles with aws.profiles, oam otherwise; always oam in AWS-managed execution',
    required: false,
    aliases: ['aab'],
  },
  {
    name: 'aws.account.permission.sets',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Preferred SSO permission sets when several profiles reach the same account, most preferred first',
    required: false,
    aliases: ['aaps'],
  },
  {
    name: 'watchtower.url',
    type: GOConfigParameterType.STRING,
    description: 'Watchtower internal TLS endpoint',
    required: true,
  },
  {
    name: 'watchtower.service.id',
    type: GOConfigParameterType.STRING,
    description: 'Watchtower service principal id',
    required: true,
    defaultValue: 'runbook-automation-worker',
  },
  {
    name: 'watchtower.password',
    type: GOConfigParameterType.STRING,
    description: 'Watchtower service principal password (local only)',
    required: false,
    sensitive: true,
  },
  {
    name: 'watchtower.service.secret.arn',
    type: GOConfigParameterType.STRING,
    description: 'Secrets Manager ARN containing the service principal password',
    required: false,
    sensitive: true,
  },
  {
    name: 'watchtower.human.token',
    type: GOConfigParameterType.STRING,
    description: 'Scoped Watchtower CLI Personal Access Token for local human-triggered runs',
    required: false,
    sensitive: true,
  },
  {
    name: 'execute.runbook.artifact.revision',
    type: GOConfigParameterType.STRING,
    description: 'Revision of the deployed execute-runbook worker artifact',
    required: false,
  },
  {
    name: 'dry.run',
    type: GOConfigParameterType.BOOL,
    description: 'Preview the CLI command and run the runbook locally without creating/updating a Watchtower execution',
    required: false,
  },
  {
    name: 'dry.run.timeout.ms',
    type: GOConfigParameterType.INT,
    description: 'Optional local dry-run timeout in milliseconds',
    required: false,
  },
  {
    name: 'apply',
    type: GOConfigParameterType.STRING,
    description: 'Apply mode for CLI-created executions: none | known',
    required: false,
  },
  {
    name: 'confirm.apply',
    type: GOConfigParameterType.BOOL,
    description: 'Confirm any apply mode against a non-local Watchtower URL',
    required: false,
  },
] as const;
