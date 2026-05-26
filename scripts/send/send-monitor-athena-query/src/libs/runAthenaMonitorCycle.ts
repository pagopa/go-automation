import { AWS, Core } from '@go-automation/go-common';

import { buildTimeRange } from './buildTimeRange.js';
import { loadQueryTemplate } from './loadQueryTemplate.js';
import { notifySlackIfConfigured } from './notifySlack.js';
import { parseKeyValueList } from './parseKeyValueList.js';
import { parseThresholdRules } from './parseThresholdRules.js';
import { uploadArtifactToS3 } from './uploadArtifactToS3.js';
import { validateConfig } from './validateConfig.js';
import { writeResultArtifact } from './writeResultArtifact.js';
import type { ReportPipelineResult, SendMonitorAthenaQueryConfig } from '../types/index.js';

export async function runAthenaMonitorCycle(
  script: Core.GOScript,
  config: SendMonitorAthenaQueryConfig,
): Promise<ReportPipelineResult> {
  validateConfig(config);

  const timeRange = buildTimeRange(config);
  script.logger.section('Time Range');
  script.logger.info(`From: ${timeRange.from.toISOString()}`);
  script.logger.info(`To: ${timeRange.to.toISOString()}`);

  const queryTemplate = await loadQueryTemplate(config, script.paths);
  const compiledQuery = new AWS.AWSAthenaQueryTemplateCompiler().compile({
    template: queryTemplate,
    values: parseKeyValueList(config.templateParams),
    rawValues: parseKeyValueList(config.templateRaw),
    from: timeRange.from,
    to: timeRange.to,
    timeZone: config.timeZone,
    legacyAliases: config.templateLegacyAliases,
  });

  script.logger.section('Athena Query');
  script.logger.info(`Compiled placeholders: ${compiledQuery.usedPlaceholders.join(', ') || 'none'}`);
  script.logger.info(`Execution parameters: ${String(compiledQuery.parameters.length)}`);

  script.prompt.startSpinner('Running Athena query...');
  let athenaResult: AWS.AWSAthenaQueryResult;
  try {
    athenaResult = await script.aws.services.athena.executeQuery(config.athenaDatabase, compiledQuery.query, {
      catalog: config.athenaCatalog,
      workGroup: config.athenaWorkgroup,
      outputLocation: config.athenaOutputLocation,
      parameters: compiledQuery.parameters,
      maxPollAttempts: config.athenaMaxPollAttempts,
      pollIntervalMs: config.athenaPollIntervalMs,
      onPollAttempt: (info) => {
        script.logger.info(
          `Athena status: ${info.reason ?? 'UNKNOWN'} (attempt ${String(info.attempt + 1)}/${String(config.athenaMaxPollAttempts)}, nextDelayMs=${String(info.nextDelayMs)})`,
        );
      },
    });
  } catch (error) {
    script.prompt.spinnerFail('Athena query failed');
    throw error;
  }
  script.prompt.spinnerStop('Athena query completed');

  script.logger.info(`Execution ID: ${athenaResult.executionId}`);
  script.logger.info(`Rows: ${String(athenaResult.rowCount)}`);

  script.logger.section('Output Artifact');
  let artifact = await writeResultArtifact(athenaResult.rows, config, script.paths);
  script.logger.info(`Local artifact: ${artifact.filePath}`);

  artifact = await uploadArtifactToS3(artifact, config.artifactS3Location, script.aws.services.s3);
  if (artifact.s3Uri !== undefined) {
    script.logger.info(`S3 artifact: ${artifact.s3Uri}`);
  }

  const rules = parseThresholdRules(config);
  const evaluation = new Core.GOThresholdEvaluator().evaluate(athenaResult.rows, rules);
  script.logger.section('Threshold Analysis');
  script.logger.info(evaluation.summary);

  const slackSent = await notifySlackIfConfigured(script, config, timeRange, athenaResult, artifact, evaluation);

  script.logger.section('Execution Summary');
  script.logger.info(`Artifact: ${artifact.fileName}`);
  script.logger.info(`Slack notification: ${slackSent ? 'SENT' : 'SKIPPED'}`);

  return {
    athenaResult,
    artifact,
    evaluation,
    slackSent,
  };
}
