import { RunbookBuilder } from '../../builders/RunbookBuilder.js';
import { queryCloudWatchLogs } from '../../steps/data/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../types/Runbook.js';
import type { CaseAction, LogAction } from '../../actions/CaseAction.js';

import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwService } from '../types/ApiGwService.js';

import { parseApiGwErrors } from '../steps/ParseApiGwErrorsStep.js';
import { prepareApiGwSection } from '../steps/PrepareApiGwSectionStep.js';
import { queryServiceLogs } from '../steps/QueryServiceLogsStep.js';
import { analyzeServiceLogs } from '../steps/AnalyzeServiceLogsStep.js';
import { decideNext } from '../steps/DecideNextStep.js';
import { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import { DEFAULT_API_GW_QUERY } from '../queries/DEFAULT_API_GW_QUERY.js';
import { DEFAULT_SERVICE_QUERY_TEMPLATE } from '../queries/DEFAULT_SERVICE_QUERY_TEMPLATE.js';

const MIN_STATUS_CODE_PLACEHOLDER = '{{minStatusCode}}';
const DEFAULT_MIN_STATUS_CODE = 500;

/**
 * Assembles a complete API Gateway alarm runbook from declarative inputs.
 *
 * Pipeline produced:
 *
 * 1. `prepare-api-gw-section`: emits the "Preparazione" reporter banner.
 * 2. `query-api-gw-logs`: queries the API Gateway AccessLog using the
 *    canonical template (parameterised by `minStatusCode`).
 * 3. `parse-api-gw-errors`: extracts `xRayTraceId`, `apiGwStatusCode` and
 *    `apiGwErrorCount`; short-circuits the runbook when no errors.
 * 4. Any custom `preSteps` (e.g. Lambda authorizer probe).
 * 5. For the entry service **and** every additional service, a triplet:
 *    - `query-<service>`: CloudWatch query filtered by fallbackUuid when
 *      present, otherwise by xRayTraceId
 *    - `analyze-<service>`: extracts error msg, scans for known URLs,
 *      promotes a new FALLBACK-UUID only when a known downstream URL is
 *      present, detects trace_id, then always signals `next: 'resolve'`
 *      so known cases are evaluated before traversal
 *    - `decide-<service>`: decides the next flow directive (jump to
 *      another service, retry the same service with a fresh trace_id,
 *      or terminate)
 *
 * The pipeline is dynamic: only the entry-service triplet is reached
 * sequentially; every other triplet is entered via `goTo` emitted by a
 * decision step. The engine's anti-loop protection complements the
 * application-level loop guard built into `decideNext`.
 *
 * After the pipeline, `knownCases` are evaluated (in priority order) and
 * a fallback action runs when no case matches.
 *
 * @param config - Declarative configuration of the alarm runbook
 * @returns A validated {@link Runbook} ready for the engine
 */
export function createApiGwAlarmRunbook(config: ApiGwAlarmConfig): Runbook {
  const minStatus = config.minStatusCode ?? DEFAULT_MIN_STATUS_CODE;

  // Fail fast on a custom apiGwQuery override that lacks the
  // `{{minStatusCode}}` placeholder: without it the `.split().join()`
  // is a no-op and the resulting CW Logs Insights query would carry
  // the literal token forward, almost certainly failing at runtime.
  const apiGwQueryTemplate = config.queryTemplates?.apiGwQuery ?? DEFAULT_API_GW_QUERY;
  if (!apiGwQueryTemplate.includes(MIN_STATUS_CODE_PLACEHOLDER)) {
    throw new Error(
      `createApiGwAlarmRunbook "${config.id}": queryTemplates.apiGwQuery must contain the ` +
        `${MIN_STATUS_CODE_PLACEHOLDER} placeholder; without it minStatusCode cannot be ` +
        `injected and the query would carry the literal token (or be unfilterable).`,
    );
  }
  const apiGwQuery = apiGwQueryTemplate.split(MIN_STATUS_CODE_PLACEHOLDER).join(String(minStatus));

  const serviceTemplate = config.queryTemplates?.serviceQueryTemplate ?? DEFAULT_SERVICE_QUERY_TEMPLATE;

  const registry = new KnownUrlsRegistry(config.knownUrls);

  const allServices: ReadonlyArray<ApiGwService> = [config.entryService, ...(config.services ?? [])];
  const seenNames = new Set<string>();
  for (const s of allServices) {
    if (seenNames.has(s.name)) {
      throw new Error(`Duplicate service name in API Gateway runbook config: '${s.name}'`);
    }
    seenNames.add(s.name);
  }
  const servicesInRunbook = new Set(allServices.map((s) => s.name));

  const builder = RunbookBuilder.create(config.id).metadata(config.metadata);

  // 1. Reporter banner.
  builder.step(
    prepareApiGwSection({
      id: 'prepare-api-gw-section',
      label: 'Preparazione API Gateway',
      apiGwLogGroup: config.apiGwLogGroup,
    }),
    { silent: true },
  );

  // 2. Query API GW AccessLog.
  builder.step(
    queryCloudWatchLogs({
      id: 'query-api-gw-logs',
      label: 'Query API Gateway AccessLog per errori HTTP',
      logGroups: [config.apiGwLogGroup],
      query: apiGwQuery,
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    }),
    { silent: true },
  );

  // 3. Parse API GW result.
  builder.step(
    parseApiGwErrors({
      id: 'parse-api-gw-errors',
      label: 'Estrazione xRayTraceId e metadati API Gateway',
      fromStep: 'query-api-gw-logs',
      minStatusCode: minStatus,
    }),
    { silent: true },
  );

  // 4. Custom pre-steps (forwarded with both continueOnFailure AND
  //    silent so authors can keep their probes out of the structured
  //    output stream when needed).
  for (const descriptor of config.preSteps ?? []) {
    const opts: { continueOnFailure?: boolean; silent?: boolean } = {};
    if (descriptor.continueOnFailure === true) opts.continueOnFailure = true;
    if (descriptor.silent === true) opts.silent = true;
    builder.step(descriptor.step, opts);
  }

  // 5. Per-service triplets (entry first, then reachable services).
  for (const service of allServices) {
    builder.step(
      queryServiceLogs({
        id: `query-${service.name}`,
        label: `Query log ${service.name}`,
        serviceName: service.name,
        entryService: service.name === config.entryService.name,
        logGroups: [service.logGroup],
        queryTemplate: service.queryOverride ?? serviceTemplate,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      }),
      { silent: true },
    );

    builder.step(
      analyzeServiceLogs({
        id: `analyze-${service.name}`,
        label: `Analisi log ${service.name}`,
        fromStep: `query-${service.name}`,
        varPrefix: service.varPrefix,
        registry,
        serviceName: service.name,
        servicesInRunbook,
      }),
      { silent: true },
    );

    builder.step(
      decideNext({
        id: `decide-${service.name}`,
        label: `Decisione flusso per ${service.name}`,
        serviceName: service.name,
        varPrefix: service.varPrefix,
        servicesInRunbook,
      }),
      { silent: true },
    );
  }

  // 6. Known cases.
  for (const knownCase of config.knownCases) {
    builder.knownCase(knownCase);
  }

  // 7. Fallback.
  builder.fallback(config.fallbackAction ?? defaultUnknownCaseFallback(allServices));

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
    'Esito: {{vars.terminationReason}} downstream={{vars.downstreamTarget}}',
  ];
  for (const s of services) {
    lines.push(
      `${s.name}: msg={{vars.${s.varPrefix}ErrorMsg}} url={{vars.${s.varPrefix}NextUrl}} target={{vars.${s.varPrefix}NextUrlTarget}}`,
    );
  }
  const action: LogAction = { type: 'log', level: 'warn', message: lines.join('\n') };
  return action;
}
