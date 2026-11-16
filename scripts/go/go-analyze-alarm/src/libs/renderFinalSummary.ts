import type { GOLogger } from '@pagopa/go-common/logging';
import type { Runbook, RunbookExecutionResult } from '@pagopa/go-runbook';
import { lambda, service } from '@pagopa/go-runbook/toolkits/common';
import { interop } from '@pagopa/go-runbook/toolkits/interop';
import { apigw } from '@pagopa/go-runbook/toolkits/send';

/**
 * Renders the summary of a runbook execution chosen by the product family of the
 * runbook context (EVO-RBREORG-OPUS-01 P19): the SEND service-chain summary only for
 * the SEND API Gateway pipeline, never for an INTEROP API Gateway or K8S runbook.
 *
 * @param logger - Logger of the script
 * @param runbook - The executed runbook
 * @param result - The execution result
 */
export function renderFinalSummary(logger: GOLogger, runbook: Runbook, result: RunbookExecutionResult): void {
  const context = runbook.runbookContext;
  const finalSummaryInput = {
    logger,
    status: result.status,
    matchedCaseIds: result.matchedCases.map((matched) => matched.id),
    vars: result.finalContext.vars,
    ...(result.trace.execution.failureReason !== undefined
      ? { failureReason: result.trace.execution.failureReason }
      : {}),
  };

  if (lambda.isLambdaRunbookContext(context)) {
    lambda.renderLambdaFinalSummary(finalSummaryInput);
    return;
  }
  if (apigw.isSendApiGwRunbookContext(context)) {
    apigw.renderApiGwFinalSummary(finalSummaryInput);
    return;
  }
  if (interop.apigw.isInteropApiGwRunbookContext(context)) {
    logger.section('INTEROP API Gateway Runbook Summary');
    logger.info(`API Gateway log group: ${context.apiGwLogGroup}`);
    for (const apiGwService of context.services) logger.info(`Service: ${apiGwService.name}`);
    return;
  }
  if (interop.k8s.isInteropK8sRunbookContext(context)) {
    logger.section('INTEROP K8S Runbook Summary');
    logger.info(`Service: ${context.service.name}`);
    return;
  }
  if (service.isServiceRunbookContext(context)) {
    logger.section('Service Runbook Summary');
    logger.info(`Service: ${context.service.name}`);
  }
}
