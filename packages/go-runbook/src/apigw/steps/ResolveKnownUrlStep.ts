import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

import type { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import type { KnownUrlMatch } from '../types/KnownUrlMatch.js';

/**
 * Configuration for {@link resolveKnownUrl}.
 */
export interface ResolveKnownUrlConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label */
  readonly label: string;
  /**
   * Var prefix used to read the next URL (`<varPrefix>NextUrl`) and to
   * write the classification vars (`<varPrefix>UrlKind`, etc.).
   */
  readonly varPrefix: string;
  /** Registry of known URLs */
  readonly registry: KnownUrlsRegistry;
  /**
   * Set of microservice names actually analyzed by the surrounding
   * runbook. Used to compute `<varPrefix>UrlNeedsRoutingFix`.
   */
  readonly servicesInRunbook: ReadonlySet<string>;
}

class ResolveKnownUrlStepImpl implements Step<KnownUrlMatch | undefined> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly varPrefix: string;
  private readonly registry: KnownUrlsRegistry;
  private readonly servicesInRunbook: ReadonlySet<string>;

  constructor(config: ResolveKnownUrlConfig) {
    this.id = config.id;
    this.label = config.label;
    this.varPrefix = config.varPrefix;
    this.registry = config.registry;
    this.servicesInRunbook = config.servicesInRunbook;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<KnownUrlMatch | undefined>> {
    const urlVarName = `${this.varPrefix}NextUrl`;
    const observed = context.vars.get(urlVarName) ?? '';

    if (observed.trim() === '') {
      return {
        success: true,
        output: undefined,
        vars: {
          [`${this.varPrefix}UrlKind`]: 'none',
          [`${this.varPrefix}UrlTarget`]: '',
          [`${this.varPrefix}UrlNeedsRoutingFix`]: 'false',
        },
      };
    }

    const match = this.registry.match(observed);

    if (match === undefined) {
      return {
        success: true,
        output: undefined,
        vars: {
          [`${this.varPrefix}UrlKind`]: 'unknown',
          [`${this.varPrefix}UrlTarget`]: '',
          [`${this.varPrefix}UrlNeedsRoutingFix`]: 'false',
        },
      };
    }

    if (match.known.kind === 'internal') {
      const target = match.known.service;
      const needsRoutingFix = !this.servicesInRunbook.has(target);
      return {
        success: true,
        output: match,
        vars: {
          [`${this.varPrefix}UrlKind`]: 'internal',
          [`${this.varPrefix}UrlTarget`]: target,
          [`${this.varPrefix}UrlNeedsRoutingFix`]: needsRoutingFix ? 'true' : 'false',
        },
      };
    }

    return {
      success: true,
      output: match,
      vars: {
        [`${this.varPrefix}UrlKind`]: 'external',
        [`${this.varPrefix}UrlTarget`]: match.known.downstream,
        [`${this.varPrefix}UrlNeedsRoutingFix`]: 'false',
      },
    };
  }
}

/**
 * Factory: creates a step that classifies the "next URL" var produced by
 * {@link analyzeServiceLogs} against a {@link KnownUrlsRegistry}.
 *
 * The step does not alter the runbook flow; it only enriches the context
 * with the classification vars so downstream known-cases (or the fallback
 * action) can react accordingly.
 *
 * Vars written:
 * - `<varPrefix>UrlKind`: `internal` | `external` | `unknown` | `none`
 * - `<varPrefix>UrlTarget`: service or downstream name (empty otherwise)
 * - `<varPrefix>UrlNeedsRoutingFix`: `true` when an `internal` URL points
 *   to a service that is **not** present in `servicesInRunbook`
 *
 * @param config - Step configuration
 * @returns Step that produces the {@link KnownUrlMatch} (or `undefined`)
 */
export function resolveKnownUrl(config: ResolveKnownUrlConfig): Step<KnownUrlMatch | undefined> {
  return new ResolveKnownUrlStepImpl(config);
}
