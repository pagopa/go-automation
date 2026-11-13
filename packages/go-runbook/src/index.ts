/**
 * Runbook engine: entrypoint `@pagopa/go-runbook` (EVO-RBREORG-OPUS-01 §8.1).
 *
 * The language and the execution of a workflow: types, context, conditions,
 * control/check/transform steps, actions, traces, reporters, builder, graph
 * validation and errors. No AWS, product, alarm or Watchtower knowledge: the
 * operational toolkits are in `./toolkits/*`, the Watchtower contract in
 * `./output`, the runbooks in `./inventory` and the composition in `./runtime`.
 *
 * @example
 * ```typescript
 * import { RunbookBuilder, RunbookEngine, logAction } from '@pagopa/go-runbook';
 *
 * const runbook = RunbookBuilder.create('example')
 *   .metadata({ name: 'Example', ... })
 *   .knownCase({ ... })
 *   .fallback(logAction({ ... }))
 *   .build();
 *
 * const result = await new RunbookEngine(logger).execute(runbook, params, services);
 * ```
 */

export * from './engine/index.js';
