import type { GOLogger } from '@pagopa/go-common/logging';
import type { Runbook, RunbookExecutionResult } from '@pagopa/go-runbook';
import { lambda, service } from '@pagopa/go-runbook/toolkits/common';
import { interop } from '@pagopa/go-runbook/toolkits/interop';
import { apigw } from '@pagopa/go-runbook/toolkits/send';

/**
 * Renders the summary of a runbook execution chosen by the product family of the runbook context: what the runbook
 * read, never the SEND summary for an INTEROP API Gateway or K8S runbook. A run that did not complete says why.
 *
 * @param logger - Logger of the script
 * @param runbook - The executed runbook
 * @param result - The execution result
 */
export function renderFinalSummary(logger: GOLogger, runbook: Runbook, result: RunbookExecutionResult): void {
  const context = runbook.runbookContext;
  // A run that did not complete says why; the chains already tell how each error ended.
  if (result.status !== 'completed') {
    logger.warning(`Esecuzione ${result.status}: ${result.trace.execution.failureReason ?? 'motivo non disponibile'}`);
  }

  // The chains of a Lambda runbook already tell how each invocation ended.
  if (lambda.isLambdaRunbookContext(context)) {
    logger.section('Lambda Runbook Summary');
    logger.info(`Lambda: ${context.lambda.name}`);
    return;
  }
  // The chains of a SEND API Gateway runbook already tell how each request ended.
  if (apigw.isSendApiGwRunbookContext(context)) {
    logger.section('SEND API Gateway Runbook Summary');
    logger.info(`API Gateway log group: ${context.apiGwLogGroup}`);
    for (const apiGwService of context.services) logger.info(`Service: ${apiGwService.name}`);
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
