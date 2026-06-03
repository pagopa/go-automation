import type { TemplateInputKind } from './TemplateInputKind.js';
import type { TemplateInputChoice } from './TemplateInputChoice.js';
import type { TemplateInputContext } from './TemplateInputContext.js';

type DefaultValueFn = (context: TemplateInputContext) => string;

/**
 * Declarative description of a template-specific input. The CLI collects
 * these (from flags or interactive prompts) in addition to the common
 * fields shared by every runbook.
 */
export interface TemplateInput {
  /** Key in `RunbookAnswers.extras` and matching CLI flag name (kebab-case). */
  readonly name: string;
  /** Prompt message shown to the user. */
  readonly message: string;
  /** Prompt kind. */
  readonly kind: TemplateInputKind;
  /** Whether a non-empty value is required. */
  readonly required: boolean;
  /** Choices for `select` inputs. */
  readonly choices?: ReadonlyArray<TemplateInputChoice>;
  /** Computes a default value from the runbook id and earlier inputs. */
  readonly defaultValue?: DefaultValueFn;
}
