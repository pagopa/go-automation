import { parseInteger } from '@pagopa/go-common/utils';
import type { Runbook } from '../../../engine/types/Runbook.js';
import type { RunbookExecutionResult } from '../../../engine/types/RunbookExecutionResult.js';
import type { RunbookEvidence, RunbookOutputContext } from './RunbookOutputContext.js';
import type { ErrorTreeNode } from '../../../engine/types/ErrorTreeNode.js';
import type { ResolvedAwsAccount } from '../accounts/ResolvedAwsAccount.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';
import { addResultField, normalizeOutputValue } from './outputValues.js';
import { buildAlarmOutput } from './buildAlarmOutput.js';
import { buildStepEvidence } from './buildStepEvidence.js';
import { representativeContext } from './resultContexts.js';

/** Compose family context and explicitly declared output once, for every executor. */
export function buildDeclaredOutputContext(
  runbook: Runbook,
  result: RunbookExecutionResult,
  context: RunbookOutputContext,
): RunbookOutputContext {
  const { vars, params } = representativeContext(result);
  const { stepResults } = result.finalContext;
  const evidence =
    runbook.tree === undefined ? buildStepEvidence(runbook.steps, stepResults) : treeEvidence(runbook, result);
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

/** Resolved accounts of the execution's account port, if it has one. */
/**
 * The declared evidence of a runbook with an error tree: the steps of the window from the window, every step of a
 * level (the window steps the root level scopes included) from each of its nodes, with the key of the node.
 */
function treeEvidence(runbook: Runbook, result: RunbookExecutionResult): ReadonlyArray<RunbookEvidence> {
  const tree = runbook.tree;
  if (tree === undefined) return [];
  const scoped = new Set(tree.root.scopedSteps ?? []);
  const window = buildStepEvidence(
    runbook.steps.filter((descriptor) => !scoped.has(descriptor.step.id)),
    result.finalContext.stepResults,
  );
  const rootSteps = runbook.steps.filter((descriptor) => scoped.has(descriptor.step.id));
  const levels = new Map([tree.root, ...tree.levels].map((level) => [level.target, level]));
  const nodes = new Map((result.tree ?? []).map((node) => [node.id, node]));
  const perNode = (result.tree ?? []).flatMap((node) => {
    const level = levels.get(node.target);
    const context = result.nodeContexts?.get(node.id);
    if (level === undefined || context === undefined) return [];
    const descriptors = [
      ...(node.parentId === undefined ? rootSteps : []),
      ...(level.perNode ?? []),
      ...(level.afterDescend ?? []),
    ];
    const key = nodeKeyPath(node.id, nodes);
    return buildStepEvidence(descriptors, context.stepResults).map((entry) => ({ ...entry, node: key }));
  });
  return [...window, ...perNode];
}

/** The keys of a node and of its ancestors, root first: `request-id > e1`. */
function nodeKeyPath(nodeId: string, nodes: ReadonlyMap<string, ErrorTreeNode>): string {
  const keys: string[] = [];
  for (
    let node = nodes.get(nodeId);
    node !== undefined;
    node = node.parentId === undefined ? undefined : nodes.get(node.parentId)
  ) {
    keys.unshift(node.key);
  }
  return keys.join(' > ');
}

function readResolvedAwsAccounts(services: unknown): ReadonlyArray<ResolvedAwsAccount> {
  const port = (services as Partial<Pick<ServiceRegistry, 'awsAccounts'>> | undefined)?.awsAccounts;
  return typeof port?.resolvedAccounts === 'function' ? port.resolvedAccounts() : [];
}
