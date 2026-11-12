/**
 * Send Monitor Athena Query - Configuration Module
 *
 * Contains script metadata and parameters definition.
 */

import {
  type GOConfigParameterOptions,
  GOConfigParameterType,
  type GOConfigParameterValue,
  type GOScriptHookContext,
  type GOScriptMetadata,
} from '@go-automation/go-script';
import { AWSS3Uri } from '@pagopa/go-aws/s3';

/**
 * Script metadata
 */
export const scriptMetadata: GOScriptMetadata = {
  name: 'Send Monitor Athena Query',
  version: '1.0.0',
  description:
    'Esegue una query Athena generica, esporta i risultati in CSV o JSON e pubblica un report su Slack con allegato e valutazione opzionale di soglie',
  authors: ['Team GO - Gestione Operativa'],
};

/**
 * Script parameter definitions
 */
export const scriptParameters: ReadonlyArray<GOConfigParameterOptions> = [
  {
    name: 'from',
    type: GOConfigParameterType.STRING,
    description: 'Start date/time for the query range. Supports ISO, date-only, SQL datetime, epoch seconds/ms.',
    required: false,
    aliases: ['f'],
  },
  {
    name: 'to',
    type: GOConfigParameterType.STRING,
    description: 'End date/time for the query range. Defaults to current time.',
    required: false,
    aliases: ['t'],
  },
  {
    name: 'time.lookback.hours',
    type: GOConfigParameterType.INT,
    description: 'Lookback window used when from is not provided.',
    required: false,
    aliases: ['tlh'],
    defaultValue: 24,
    validator: positiveInteger,
  },
  {
    name: 'time.zone',
    type: GOConfigParameterType.STRING,
    description: 'Timezone used for date parsing and template tokens.',
    required: false,
    aliases: ['tz'],
    defaultValue: 'Europe/Rome',
  },
  {
    name: 'aws.profile',
    type: GOConfigParameterType.STRING,
    description:
      'AWS SSO profile name. Optional in AWS-managed environments or when default credentials are available.',
    required: false,
    aliases: ['ap'],
  },
  {
    name: 'aws.region',
    type: GOConfigParameterType.STRING,
    description: 'AWS region.',
    required: false,
    aliases: ['ar'],
    defaultValue: 'eu-south-1',
  },
  {
    name: 'athena.database',
    type: GOConfigParameterType.STRING,
    description: 'Athena database name.',
    required: true,
    aliases: ['ad'],
  },
  {
    name: 'athena.catalog',
    type: GOConfigParameterType.STRING,
    description: 'Athena data catalog.',
    required: false,
    aliases: ['ac'],
    defaultValue: 'AwsDataCatalog',
  },
  {
    name: 'athena.workgroup',
    type: GOConfigParameterType.STRING,
    description: 'Athena workgroup.',
    required: false,
    aliases: ['aw'],
    defaultValue: 'primary',
  },
  {
    name: 'athena.output.location',
    type: GOConfigParameterType.STRING,
    description: 'S3 output location for Athena query results.',
    required: true,
    aliases: ['ao'],
  },
  {
    name: 'athena.query',
    type: GOConfigParameterType.STRING,
    description: 'Inline SQL query template.',
    required: false,
    aliases: ['aq'],
  },
  {
    name: 'athena.query.file',
    type: GOConfigParameterType.STRING,
    description: 'SQL query template file. Relative paths are resolved from the script config directory.',
    required: false,
    aliases: ['aqf'],
  },
  {
    name: 'athena.max.poll.attempts',
    type: GOConfigParameterType.INT,
    description: 'Maximum Athena query status polling attempts.',
    required: false,
    aliases: ['ampa'],
    defaultValue: 60,
    validator: positiveInteger,
  },
  {
    name: 'athena.poll.interval.ms',
    type: GOConfigParameterType.INT,
    description: 'Constant delay between Athena query status polling attempts.',
    required: false,
    aliases: ['apim'],
    defaultValue: 5000,
    validator: nonNegativeInteger,
  },
  {
    name: 'template.params',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Template parameters as key=value entries or JSON objects. Used by {{param.key}} placeholders.',
    required: false,
    aliases: ['tp'],
    defaultValue: [],
  },
  {
    name: 'template.raw',
    type: GOConfigParameterType.STRING_ARRAY,
    description: 'Validated raw template values as key=value entries. Used by {{raw.key}} placeholders.',
    required: false,
    aliases: ['tr'],
    defaultValue: [],
  },
  {
    name: 'template.legacy.aliases',
    type: GOConfigParameterType.BOOL,
    description: 'Enable legacy TPP aliases such as {{startYear}} and {{endDate}}.',
    required: false,
    aliases: ['tla'],
    defaultValue: true,
  },
  {
    name: 'output.folder',
    type: GOConfigParameterType.STRING,
    description: 'Local output folder. Relative paths are created under the execution output directory.',
    required: false,
    aliases: ['of'],
    defaultValue: 'reports',
  },
  {
    name: 'output.format',
    type: GOConfigParameterType.STRING,
    description: 'Artifact format: csv, json, or jsonl.',
    required: false,
    aliases: ['fmt'],
    defaultValue: 'csv',
    validator: outputFormat,
  },
  {
    name: 'output.file.prefix',
    type: GOConfigParameterType.STRING,
    description: 'Generated artifact file prefix.',
    required: false,
    aliases: ['ofp'],
    defaultValue: 'athena-report',
  },
  {
    name: 'output.attach.when.empty',
    type: GOConfigParameterType.BOOL,
    description: 'Attach the generated artifact to Slack even when the query returns zero rows.',
    required: false,
    aliases: ['oawe'],
    defaultValue: false,
  },
  {
    name: 'artifact.s3.location',
    type: GOConfigParameterType.STRING,
    description: 'Optional S3 location where the final local artifact is uploaded.',
    required: false,
    aliases: ['asl'],
  },
  {
    name: 'slack.token',
    type: GOConfigParameterType.STRING,
    description: 'Slack bot token for report notifications.',
    required: false,
    sensitive: true,
    aliases: ['st'],
  },
  {
    name: 'slack.channel',
    type: GOConfigParameterType.STRING,
    description: 'Slack channel ID or name.',
    required: false,
    aliases: ['sc'],
  },
  {
    name: 'slack.message.template',
    type: GOConfigParameterType.STRING,
    description: 'Slack message template using {{key}} placeholders.',
    required: false,
    aliases: ['smt'],
    defaultValue:
      '*Athena monitor report*\n\n*Range:* {{startDate}} - {{endDate}}\n*Rows:* {{rowCount}}\n*Analysis:* {{analysis}}\n*Artifact:* {{fileName}}',
  },
  {
    name: 'slack.send.on.empty',
    type: GOConfigParameterType.BOOL,
    description: 'Send a Slack message even when the query returns zero rows.',
    required: false,
    aliases: ['ssoe'],
    defaultValue: true,
  },
  {
    name: 'slack.send.on.error',
    type: GOConfigParameterType.BOOL,
    description: 'Send a Slack error message when execution fails after config load.',
    required: false,
    aliases: ['ssoerr'],
    defaultValue: true,
  },
  {
    name: 'analysis.rules',
    type: GOConfigParameterType.STRING_ARRAY,
    description:
      'Threshold rules as JSON strings or semicolon DSL entries: name=x;field=count;operator=>;value=10;aggregation=sum.',
    required: false,
    aliases: ['arules'],
    defaultValue: [],
  },
  {
    name: 'analysis.threshold.field',
    type: GOConfigParameterType.STRING,
    description: 'Legacy single threshold field.',
    required: false,
    aliases: ['atf'],
  },
  {
    name: 'analysis.threshold',
    type: GOConfigParameterType.INT,
    description: 'Legacy single threshold value.',
    required: false,
    aliases: ['at'],
  },
] as const;

/**
 * Prepare/remap hook (wired as `onAfterConfigLoad`, runs in CLI and Lambda).
 *
 * The report destination has a single source of truth for the script core:
 * `artifact.s3.location`. How it is obtained depends on the environment:
 * in AWS the report bucket is injected per-account as the `REPORTS_S3_BUCKET`
 * env var and the folder is the active preset; here we compose the two into
 * `artifact.s3.location`. An explicit operator value (CLI/env/event) wins; a
 * value coming from the preset is treated as a fallback that this composition
 * overrides. With no bucket configured (typical local run) nothing is changed.
 */
export function prepareConfig(context: GOScriptHookContext): void {
  const bucket = context.env.get('REPORTS_S3_BUCKET')?.trim();
  if (bucket === undefined || bucket.length === 0) {
    return;
  }

  const source = context.config.sourceOf('artifact.s3.location');
  const operatorProvided = source !== undefined && !source.startsWith('Preset');
  if (operatorProvided) {
    return;
  }

  const presetName = context.config.getString('script.preset.name')?.trim();
  const folder = presetName !== undefined && presetName.length > 0 ? presetName : 'reports';
  context.config.set('artifact.s3.location', AWSS3Uri.format(bucket, folder));
}

function positiveInteger(value: GOConfigParameterValue): boolean | string {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? true : 'Expected a positive integer';
}

function nonNegativeInteger(value: GOConfigParameterValue): boolean | string {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? true : 'Expected a non-negative integer';
}

function outputFormat(value: GOConfigParameterValue): boolean | string {
  return typeof value === 'string' && ['csv', 'json', 'jsonl'].includes(value)
    ? true
    : 'Expected one of: csv, json, jsonl';
}
