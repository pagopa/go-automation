import { parseInteger } from '@pagopa/go-common/utils';
import type { Runbook, RunbookExecutionResult } from '../../../engine/index.js';
import { levelSteps } from '../../../engine/internal.js';
import type { RunbookOutputContext } from './RunbookOutputContext.js';
import type { RunbookEvidence } from './RunbookEvidence.js';
import type { ResolvedAwsAccount } from '../accounts/ResolvedAwsAccount.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';
import { addResultField, normalizeOutputValue } from './outputValues.js';
import { buildAlarmOutput } from './buildAlarmOutput.js';
import { buildStepEvidence } from './buildStepEvidence.js';
import { representativeContext } from './resultContexts.js';
import type { ErrorTreeView } from './tree/ErrorTreeView.js';

/** Compose family context and explicitly declared output once, for every executor. */
export function buildDeclaredOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
  context: RunbookOutputContext,
  view: ErrorTreeView,
): RunbookOutputContext {
  const { vars, params } = representativeContext(result, view);
  const { stepResults } = result.finalContext;
  const evidence =
    runbook.tree === undefined ? buildStepEvidence(runbook.steps, stepResults) : treeEvidence(runbook, result, view);
  // Logical accounts read in this execution, resolved from the account directory.
  const awsAccounts = readResolvedAwsAccounts(result.finalContext.services);
  const accountDetails = awsAccounts.length === 0 ? {} : { awsAccounts };
  const definition = runbook.output;
  if (definition === undefined) {
    return {
      ...context,
      evidence: [...context.evidence, ...evidence],
      ...(awsAccounts.length === 0 ? {} : { details: { ...context.details, ...accountDetails } }),
    };
  }

  const fields = [...context.fields];
  const diagnostics: Record<string, string | number> = {};
  for (const field of definition.fields) {
    const source = field.ref.startsWith('vars.') ? vars : params;
    const raw = normalizeOutputValue(source.get(field.ref.slice(field.ref.indexOf('.') + 1)));
    const value = field.valueType === 'integer' ? parseInteger(raw) : raw;
    if (value === undefined) continue;
    addResultField(fields, field.name, field.label, String(value));
    if (field.ref.startsWith('vars.')) diagnostics[field.name] = value;
  }

  return {
    fields,
    evidence: [...context.evidence, ...evidence],
    details: {
      alarm: buildAlarmOutput(params),
      ...context.details,
      ...(definition.metadata === undefined ? {} : { metadata: definition.metadata }),
      ...accountDetails,
      diagnostics,
    },
  };
}

/**
 * The declared evidence of a runbook with an error tree: the steps of the window from the window, every step of a
 * level (the window steps the root level scopes included) from each of its nodes, with the key of the node.
 */
function treeEvidence(
  runbook: Runbook,
  result: RunbookExecutionResult,
  view: ErrorTreeView,
): ReadonlyArray<RunbookEvidence> {
  const tree = runbook.tree;
  if (tree === undefined) return [];
  const scoped = new Set(tree.root.scopedSteps ?? []);
  const window = buildStepEvidence(
    runbook.steps.filter((descriptor) => !scoped.has(descriptor.step.id)),
    result.finalContext.stepResults,
  );
  const rootSteps = runbook.steps.filter((descriptor) => scoped.has(descriptor.step.id));
  const levels = new Map([tree.root, ...tree.levels].map((level) => [level.target, level]));
  const perNode = (result.tree ?? []).flatMap((node) => {
    const level = levels.get(node.target);
    const context = result.nodeContexts?.get(node.id);
    if (level === undefined || context === undefined) return [];
    const descriptors = [...(node.parentId === undefined ? rootSteps : []), ...levelSteps(level)];
    const key = view.keyPath(node.id);
    return buildStepEvidence(descriptors, context.stepResults).map((entry) => ({ ...entry, node: key }));
  });
  return [...window, ...perNode];
}

/** Resolved accounts of the execution's account port, if it has one. */
function readResolvedAwsAccounts(services: unknown): ReadonlyArray<ResolvedAwsAccount> {
  const port = (services as Partial<Pick<ServiceRegistry, 'awsAccounts'>> | undefined)?.awsAccounts;
  return typeof port?.resolvedAccounts === 'function' ? port.resolvedAccounts() : [];
}
