import { RunbookBuilder } from '../../builders/RunbookBuilder.js';
import { queryCloudWatchLogs } from '../../steps/data/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../types/Runbook.js';
import type { CaseAction, LogAction } from '../../actions/CaseAction.js';

import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwService } from '../types/ApiGwService.js';

import { parseApiGwErrors } from '../steps/ParseApiGwErrorsStep.js';
import { queryServiceLogs } from '../steps/QueryServiceLogsStep.js';
import { analyzeServiceLogs } from '../steps/AnalyzeServiceLogsStep.js';
import { resolveKnownUrl } from '../steps/ResolveKnownUrlStep.js';
import { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import { DEFAULT_API_GW_QUERY } from '../queries/DEFAULT_API_GW_QUERY.js';
import { DEFAULT_SERVICE_QUERY_TEMPLATE } from '../queries/DEFAULT_SERVICE_QUERY_TEMPLATE.js';

const MIN_STATUS_CODE_PLACEHOLDER = '{{minStatusCode}}';
const DEFAULT_MIN_STATUS_CODE = 500;

/**
 * Assembles a complete API Gateway alarm runbook from declarative inputs.
 *
 * Pipeline produced (in order):
 *
 * 1. `query-api-gw-logs`: queries the API Gateway AccessLog using the
 *    canonical template (parameterised by `minStatusCode`).
 * 2. `parse-api-gw-errors`: extracts `xRayTraceId`, `apiGwStatusCode` and
 *    `apiGwErrorCount`; short-circuits the runbook when no errors.
 * 3. Any custom `preSteps` (e.g. Lambda authorizer probe).
 * 4. For every service in `services`, in order:
 *    - `query-<service>`: dynamic-clause query on the service log group
 *    - `analyze-<service>`: extracts the longest error message
 *    - `resolve-url-<service>`: classifies the next URL (only when
 *      `detectNextService` is `true`)
 *
 * After the pipeline, `knownCases` are evaluated (in priority order) and
 * a fallback action runs when no case matches.
 *
 * @param config - Declarative configuration of the alarm runbook
 * @returns A validated {@link Runbook} ready for the engine
 */
export function createApiGwAlarmRunbook(config: ApiGwAlarmConfig): Runbook {
  const minStatus = config.minStatusCode ?? DEFAULT_MIN_STATUS_CODE;
  const apiGwQuery = (config.queryTemplates?.apiGwQuery ?? DEFAULT_API_GW_QUERY)
    .split(MIN_STATUS_CODE_PLACEHOLDER)
    .join(String(minStatus));
  const serviceTemplate = config.queryTemplates?.serviceQueryTemplate ?? DEFAULT_SERVICE_QUERY_TEMPLATE;

  const registry = new KnownUrlsRegistry(config.knownUrls);
  const servicesInRunbook = new Set(config.services.map((s) => s.name));

  const builder = RunbookBuilder.create(config.id).metadata(config.metadata);

  // 1. Query API GW AccessLog.
  builder.step(
    queryCloudWatchLogs({
      id: 'query-api-gw-logs',
      label: 'Query API Gateway AccessLog per errori HTTP',
      logGroups: [config.apiGwLogGroup],
      query: apiGwQuery,
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    }),
  );

  // 2. Parse API GW result.
  builder.step(
    parseApiGwErrors({
      id: 'parse-api-gw-errors',
      label: 'Estrazione xRayTraceId e metadati API Gateway',
      fromStep: 'query-api-gw-logs',
      minStatusCode: minStatus,
    }),
  );

  // 3. Custom pre-steps.
  for (const descriptor of config.preSteps ?? []) {
    const opts = descriptor.continueOnFailure === true ? { continueOnFailure: true } : undefined;
    builder.step(descriptor.step, opts);
  }

  // 4. Per-service pipeline.
  let isFirst = true;
  for (const service of config.services) {
    const continueOnFailure = service.continueOnFailure ?? !isFirst;
    const opts = continueOnFailure ? { continueOnFailure: true } : undefined;
    const detectNextService = service.detectNextService ?? false;

    builder.step(
      queryServiceLogs({
        id: `query-${service.name}`,
        label: `Query log ${service.name}`,
        logGroups: [service.logGroup],
        queryTemplate: service.queryOverride ?? serviceTemplate,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      }),
      opts,
    );

    builder.step(
      analyzeServiceLogs({
        id: `analyze-${service.name}`,
        label: `Analisi log ${service.name}`,
        fromStep: `query-${service.name}`,
        varPrefix: service.varPrefix,
        detectNextService,
      }),
      opts,
    );

    if (detectNextService) {
      builder.step(
        resolveKnownUrl({
          id: `resolve-url-${service.name}`,
          label: `Risoluzione URL noti per ${service.name}`,
          varPrefix: service.varPrefix,
          registry,
          servicesInRunbook,
        }),
        opts,
      );
    }

    isFirst = false;
  }

  // 5. Known cases.
  for (const knownCase of config.knownCases) {
    builder.knownCase(knownCase);
  }

  // 6. Fallback.
  builder.fallback(config.fallbackAction ?? defaultUnknownCaseFallback(config.services));

  if (config.maxIterations !== undefined) {
    builder.maxIterations(config.maxIterations);
  }

  return builder.build();
}

/**
 * Default fallback action used when the runbook author does not supply
 * a custom one. Produces a single `warn` log entry summarising the
 * collected vars, with one line per analysed service.
 */
function defaultUnknownCaseFallback(services: ReadonlyArray<ApiGwService>): CaseAction {
  const lines: string[] = [
    "[CASO NON RICONOSCIUTO] Impossibile identificare univocamente la causa dell'errore.",
    'API GW: errori={{vars.apiGwErrorCount}} status={{vars.apiGwStatusCode}} xRayTraceId={{vars.xRayTraceId}} fallbackUuid={{vars.fallbackUuid}}',
  ];
  for (const s of services) {
    lines.push(
      `${s.name}: msg={{vars.${s.varPrefix}ErrorMsg}} url={{vars.${s.varPrefix}NextUrl}} kind={{vars.${s.varPrefix}UrlKind}} needsRoutingFix={{vars.${s.varPrefix}UrlNeedsRoutingFix}}`,
    );
  }
  const action: LogAction = { type: 'log', level: 'warn', message: lines.join('\n') };
  return action;
}
