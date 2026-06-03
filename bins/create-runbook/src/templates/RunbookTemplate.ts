import type { TemplateFile } from './TemplateFile.js';
import type { TemplateInput } from './TemplateInput.js';
import type { RunbookAnswers } from './RunbookAnswers.js';

/**
 * A runbook scaffolding template: the set of files it emits, the inputs it
 * needs, and a pure mapping from answers to template placeholder values.
 *
 * Adding a new runbook type means creating a template directory under
 * `bins/runbook-templates/<id>/` and adding a descriptor to the registry
 * in `runbookTemplates.ts` — no changes to the generator engine.
 */
export interface RunbookTemplate {
  /** Stable template id used as CLI value and registry key. */
  readonly id: string;
  /** Short label shown in the interactive selector. */
  readonly label: string;
  /** One-line description shown in the interactive selector. */
  readonly description: string;
  /** Directory name under `bins/runbook-templates/`. */
  readonly templateDir: string;
  /** Files emitted by this template. */
  readonly files: ReadonlyArray<TemplateFile>;
  /** Template-specific inputs collected in addition to the common ones. */
  readonly inputs: ReadonlyArray<TemplateInput>;
  /** Pure mapping from collected answers to `{{TOKEN}}` → value. */
  readonly buildPlaceholders: (answers: RunbookAnswers) => ReadonlyMap<string, string>;
}
