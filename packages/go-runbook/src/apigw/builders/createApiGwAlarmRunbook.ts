import { RunbookBuilder } from '../../builders/RunbookBuilder.js';
import { queryCloudWatchLogs } from '../../steps/data/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../types/Runbook.js';
import type { CaseAction, LogAction } from '../../actions/CaseAction.js';
import type { KnownCase } from '../../types/KnownCase.js';

import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwService } from '../types/ApiGwService.js';
import type { ApiGwRunbookContext } from '../output/ApiGwRunbookContext.js';

import { parseApiGwErrors } from '../steps/ParseApiGwErrorsStep.js';
import { prepareApiGwSection } from '../steps/PrepareApiGwSectionStep.js';
import { queryServiceLogs } from '../steps/QueryServiceLogsStep.js';
import { analyzeServiceLogs } from '../steps/AnalyzeServiceLogsStep.js';
import { decideNext } from '../steps/DecideNextStep.js';
import { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import { queryApiGwExecutionLogs } from '../steps/QueryApiGwExecutionLogsStep.js';
import { stopApiGwExecutionLogAnalysis } from '../steps/StopApiGwExecutionLogAnalysisStep.js';
import { evaluateApiGwAuthorizerFailure } from '../steps/EvaluateApiGwAuthorizerFailureStep.js';
import { resolveApiGwQueryProfile } from '../profiles/resolveApiGwQueryProfile.js';
import { renderQueryTemplate } from '../profiles/render/renderQueryTemplate.js';
import { isExecutionLogEnabled, getEffectiveExecutionLogGroup } from './executionLogEnablement.js';
import {
  validatePlaceholders,
  validateCapabilityParity,
  validateNoStepIdCollisions,
  validateKnownCaseStepRefs,
} from './validations.js';

const DEFAULT_MIN_STATUS_CODE = 500;

/**
 * Assembla un runbook API Gateway completo a partire da input dichiarativi.
 *
 * Pipeline prodotta (V04):
 *
 * 1. `prepare-api-gw-section`: banner del reporter.
 * 2. `query-api-gw-logs`: query AccessLog con `{{minStatusCode}}` risolto
 *    a build time. Trace metadata: `queryProfileId`, `queryKind: 'access-log'`.
 * 3. `parse-api-gw-errors`: estrae trace id, statusCode e i campi
 *    diagnostici dichiarati dallo schema del profilo. Il relativo output
 *    console resta sotto la sezione "Preparazione".
 * 4. **Gate opzionale authorizer**: `evaluate-api-gw-authorizer-failure`
 *    cablato solo quando `authorizerFailureCheck` e' configurato. Se
 *    trova un errore authorizer, risolve il runbook prima del trace-id flow.
 * 5. **Branch opzionale**: `query-api-gw-execution-logs` +
 *    `stop-api-gw-execution-log-unresolved` cablati solo quando
 *    `isExecutionLogEnabled(config, profile)`. Pattern SEND con
 *    OR-clause su requestId in UNA sola chiamata AWS.
 * 6. PreSteps custom.
 * 7. Triplet per ogni servizio: `query-<name>` (con predicate del profilo),
 *    `analyze-<name>` (legge dallo schema), `decide-<name>`.
 *
 * V04: il profilo è risolto via {@link resolveApiGwQueryProfile} con
 * default SEND implicito (compatibilità v1.x). Tutte le validazioni
 * lavorano sul profilo risolto.
 *
 * @param config - Configurazione del runbook
 * @returns Un {@link Runbook} validato pronto per l'engine
 */
export function createApiGwAlarmRunbook(config: ApiGwAlarmConfig): Runbook {
  // —— Risoluzione profilo (D1, D2) ——
  const profile = resolveApiGwQueryProfile(config);
  const preSteps = config.preSteps ?? [];

  // —— Validazioni build-time (fail-fast) ——
  validatePlaceholders(profile);
  validateCapabilityParity(config, profile);
  validateNoStepIdCollisions(config, profile);
  validateKnownCaseStepRefs(config, profile);

  const minStatus = config.minStatusCode ?? DEFAULT_MIN_STATUS_CODE;
  const apiGwQuery = renderQueryTemplate(profile.accessLog.query, {
    values: { '{{minStatusCode}}': String(minStatus) },
    queryId: `${profile.id}.accessLog`,
  });

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

  const executionLogEnabled = isExecutionLogEnabled(config, profile);
  const effectiveExecutionLogGroup = getEffectiveExecutionLogGroup(config);

  const builder = RunbookBuilder.create(config.id).metadata(config.metadata);

  // 1. Banner.
  builder.step(
    prepareApiGwSection({
      id: 'prepare-api-gw-section',
      label: 'Preparazione API Gateway',
      apiGwLogGroup: config.apiGwLogGroup,
    }),
    { silent: true },
  );

  // 2. AccessLog query (con traceMetadata cross-prodotto).
  builder.step(
    queryCloudWatchLogs({
      id: 'query-api-gw-logs',
      label: 'Query API Gateway AccessLog per errori HTTP',
      logGroups: [config.apiGwLogGroup],
      query: apiGwQuery,
      timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      logGroupResolutionMode: 'search-configured-profiles',
      traceMetadata: {
        queryProfileId: profile.id,
        queryKind: 'access-log',
        identifierMode: 'none',
      },
    }),
    { silent: true },
  );

  // 3. Parse AccessLog → trace id, status, vars. Must stay under the
  // preparation section in the console output, before authorizer/execution
  // log sections open their own banners.
  builder.step(
    parseApiGwErrors({
      id: 'parse-api-gw-errors',
      label: `Estrazione ${profile.accessLog.schema.traceIdLabel} e metadati API Gateway`,
      fromStep: 'query-api-gw-logs',
      minStatusCode: minStatus,
      schema: profile.accessLog.schema,
      queryProfileId: profile.id,
    }),
    { silent: true },
  );

  // 4. Authorizer gate (condizionale, prima di ogni trace-id flow).
  if (config.authorizerFailureCheck !== undefined) {
    builder.step(
      evaluateApiGwAuthorizerFailure({
        id: 'evaluate-api-gw-authorizer-failure',
        label: 'Valutazione Lambda authorizer API Gateway',
        fromStep: 'query-api-gw-logs',
        schema: profile.accessLog.schema,
        check: config.authorizerFailureCheck,
        queryProfileId: profile.id,
      }),
      { silent: true },
    );
  }

  // 5. ExecutionLog branch (condizionale).
  if (executionLogEnabled && profile.executionLog !== undefined && effectiveExecutionLogGroup !== undefined) {
    builder.step(
      queryApiGwExecutionLogs({
        id: 'query-api-gw-execution-logs',
        label: 'Query API Gateway ExecutionLog per requestId',
        fromStep: 'query-api-gw-logs',
        minStatusCode: minStatus,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        spec: profile.executionLog,
        accessLogSchema: profile.accessLog.schema,
        queryProfileId: profile.id,
        executionLogGroup: effectiveExecutionLogGroup,
        ...(config.executionLogMaxRequestIds !== undefined
          ? { maxRequestIdsOverride: config.executionLogMaxRequestIds }
          : {}),
      }),
      { silent: true },
    );

    builder.step(
      stopApiGwExecutionLogAnalysis({
        id: 'stop-api-gw-execution-log-unresolved',
        label: 'Stop se execution log API Gateway non determinante',
      }),
      { silent: true },
    );
  }

  // 6. Custom pre-steps.
  for (const descriptor of preSteps) {
    const opts: { continueOnFailure?: boolean; silent?: boolean } = {};
    if (descriptor.continueOnFailure === true) opts.continueOnFailure = true;
    if (descriptor.silent === true) opts.silent = true;
    builder.step(descriptor.step, opts);
  }

  // 7. Per-service triplets.
  for (const service of allServices) {
    builder.step(
      queryServiceLogs({
        id: `query-${service.name}`,
        label: `Query log ${service.name}`,
        serviceName: service.name,
        entryService: service.name === config.entryService.name,
        logGroups: [service.logGroup],
        spec: profile.serviceLog,
        queryProfileId: profile.id,
        accessLogSchemaTraceIdContextVar: profile.accessLog.schema.traceIdContextVar,
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
        ...(service.queryOverride !== undefined ? { queryTemplateOverride: service.queryOverride } : {}),
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
        schema: profile.serviceLog.schema,
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
        traceIdContextVar: profile.accessLog.schema.traceIdContextVar,
      }),
      { silent: true },
    );
  }

  // 8. Known cases.
  for (const knownCase of builtinApiGwAuthorizerKnownCases(config)) {
    builder.knownCase(knownCase);
  }
  for (const knownCase of config.knownCases) {
    builder.knownCase(knownCase);
  }

  // 9. Fallback.
  builder.fallback(
    config.fallbackAction ??
      defaultUnknownCaseFallback(
        allServices,
        profile.accessLog.schema.traceIdContextVar,
        profile.accessLog.schema.traceIdLabel,
      ),
  );
  builder.runbookContext({
    kind: 'apigw',
    services: allServices,
    apiGwLogGroup: config.apiGwLogGroup,
    queryProfileId: profile.id,
  } satisfies ApiGwRunbookContext);

  if (config.maxIterations !== undefined) {
    builder.maxIterations(config.maxIterations);
  }

  return builder.build();
}

function builtinApiGwAuthorizerKnownCases(config: ApiGwAlarmConfig): ReadonlyArray<KnownCase> {
  if (config.authorizerFailureCheck === undefined) return [];
  return [
    {
      id: 'api-gw-authorizer-timeout',
      description: 'Timeout Lambda authorizer API Gateway',
      priority: 10_000,
      condition: { type: 'compare', ref: 'vars.apiGwAuthorizerOutcome', operator: '==', value: 'timeout' },
      action: {
        type: 'log',
        level: 'info',
        message:
          '[CASO NOTO] Timeout Lambda authorizer API Gateway\n' +
          'Lambda: {{vars.apiGwAuthorizerLambdaName}}\n' +
          'Dettaglio: {{vars.lastErrorMsg}}\n' +
          'authorizerRequestId: {{vars.apiGwAuthorizerRequestId}}\n' +
          'Endpoint: {{vars.apiGwAuthorizerHttpMethod}} {{vars.apiGwAuthorizerPath}}',
      },
    },
    {
      id: 'api-gw-authorizer-error',
      description: 'Errore Lambda authorizer API Gateway',
      priority: 9_999,
      condition: { type: 'compare', ref: 'vars.apiGwAuthorizerOutcome', operator: '==', value: 'error' },
      action: {
        type: 'log',
        level: 'info',
        message:
          '[CASO NOTO] Errore Lambda authorizer API Gateway\n' +
          'Lambda: {{vars.apiGwAuthorizerLambdaName}}\n' +
          'Dettaglio: {{vars.lastErrorMsg}}\n' +
          'authorizerRequestId: {{vars.apiGwAuthorizerRequestId}}\n' +
          'Endpoint: {{vars.apiGwAuthorizerHttpMethod}} {{vars.apiGwAuthorizerPath}}',
      },
    },
  ];
}

/**
 * Default fallback action used when the runbook author does not supply a
 * custom one. Produces a single `warn` log entry summarising the
 * collected vars, with one line per analysed service.
 */
function defaultUnknownCaseFallback(
  services: ReadonlyArray<ApiGwService>,
  traceIdContextVar: string,
  traceIdLabel: string,
): CaseAction {
  const lines: string[] = [
    "[CASO NON RICONOSCIUTO] Impossibile identificare univocamente la causa dell'errore.",
    'Dettaglio: nessun caso noto ha soddisfatto le condizioni del runbook.',
    'Errori API Gateway: {{vars.apiGwErrorCount}}',
    'Status API Gateway: {{vars.apiGwStatusCode}}',
    `${traceIdLabel}: {{vars.${traceIdContextVar}}}`,
    'Fallback UUID: {{vars.fallbackUuid}}',
    'Esito tecnico: {{vars.terminationReason}}',
    'Downstream: {{vars.downstreamTarget}}',
  ];
  for (const s of services) {
    lines.push(
      `${s.name}: msg={{vars.${s.varPrefix}ErrorMsg}}; url={{vars.${s.varPrefix}NextUrl}}; target={{vars.${s.varPrefix}NextUrlTarget}}`,
    );
  }
  const action: LogAction = { type: 'log', level: 'warn', message: lines.join('\n') };
  return action;
}
