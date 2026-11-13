/**
 * GO Automation - New Runbook Scaffolder
 *
 * Creates a new runbook in the go-runbook inventory
 * (`packages/go-runbook/src/inventory/<product>/<family>/<id>/`) from a template,
 * and (by default) registers it in the manifest of its product.
 *
 * Usage:
 *   pnpm create:runbook
 *   pnpm create:runbook --type api-gateway --id pn-foo-BAR-ApiGwAlarm
 *   pnpm create:runbook --type lambda --id pn-fooLambda-LogInvocationErrors-Alarm
 *   pnpm create:runbook --type service --id workday-pn-foo-alarm
 *   pnpm create:runbook --dry-run
 *
 * Flags:
 *   --type <id>              Template id (api-gateway | lambda | service | base); prompted if omitted
 *   --id <runbook-id>        Runbook id and directory name
 *   --description <text>     Runbook metadata description
 *   --version <semver>       Runbook metadata version (default: 1.0.0)
 *   --team <team>            Runbook metadata team (default: GO)
 *   --tags <csv>             Comma-separated metadata tags
 *   --product <name>         Watchtower product: SEND | INTEROP; prompted if omitted (always resolved:
 *                            it chooses the inventory folder). The SEND templates reject INTEROP
 *   --family <name>          Inventory family, required by the base template (SEND: apigw, lambda,
 *                            downstream, service; INTEROP: apigw, k8s); fixed by the other templates
 *   --categories <csv>       Comma-separated automatic catalog categories
 *   --api-gw-log-group, --entry-service, --var-prefix, --log-group,
 *   --execution-log-group, --authorizer   (api-gateway template inputs)
 *   --entry-lambda, --var-prefix, --event-source   (lambda template inputs)
 *   --service-name, --var-prefix, --log-group   (service template inputs)
 *   --no-wire                Do not modify the product manifest
 *   --dry-run                Render and print without writing or wiring
 *   --yes                    Skip the confirmation prompt
 */

import * as path from 'node:path';

import { parseCliArgs } from './cli/parseArgs.js';
import { resolveTemplate, collectAnswers, confirmGeneration } from './cli/prompts.js';
import { renderRunbookFiles, writeGeneratedFiles } from './generate/scaffoldRunbook.js';
import { formatTypeScript } from './generate/formatTypeScript.js';
import type { GeneratedFile } from './generate/scaffoldRunbook.js';
import { RunbookKinds } from '../../../packages/go-runbook/src/toolkits/common/registration/RunbookKind.js';
import type { RunbookKind } from '../../../packages/go-runbook/src/toolkits/common/registration/RunbookKind.js';

import { registerRunbookInCatalog, renderRegistrationFile } from './wiring/registerInCatalog.js';
import type { RunbookRegistration } from './wiring/registerInCatalog.js';
import { deriveRegistrationName } from './naming/deriveRegistrationName.js';
import { runbookIdError } from './validation/runbookIdError.js';
import { registeredRunbookIdError } from './validation/registeredRunbookIdError.js';
import { REPO_ROOT, TEMPLATES_ROOT } from './constants.js';
import { findExistingRunbookDir, manifestConstName, manifestFile, runbookDir } from './inventoryLayout.js';
import type { RunbookAnswers } from './templates/RunbookAnswers.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function relativeToRepo(target: string): string {
  return path.relative(REPO_ROOT, target);
}

function printPlan(answers: RunbookAnswers, files: ReadonlyArray<GeneratedFile>, wire: boolean): void {
  console.log(`\n${BOLD}Runbook${RESET}   ${answers.id}`);
  console.log(`${BOLD}Template${RESET}  ${answers.templateId}`);
  console.log(`${BOLD}File (${String(files.length)})${RESET}`);
  for (const file of files) {
    console.log(`  ${CYAN}${relativeToRepo(file.path)}${RESET}`);
  }
  const wiringLabel = wire
    ? `import + ${manifestConstName(answers.product)} in ${relativeToRepo(manifestFile(answers.product))}`
    : `${DIM}disabilitato${RESET}`;
  console.log(`${BOLD}Wiring${RESET}    ${wiringLabel}`);
}

function printGeneratedFileContents(files: ReadonlyArray<GeneratedFile>): void {
  for (const file of files) {
    console.log(`\n${DIM}── ${relativeToRepo(file.path)} ──${RESET}`);
    console.log(file.content);
  }
}

function printNextSteps(answers: RunbookAnswers): void {
  console.log(`\n  ${BOLD}Prossimi passi${RESET}`);
  if (answers.templateId === 'api-gateway') {
    console.log(`    1. Popola ${CYAN}knownUrls.ts${RESET} e ${CYAN}knownCases.ts${RESET}`);
    console.log(`    2. Aggiungi i servizi raggiungibili in ${CYAN}knownServices.ts${RESET}`);
    console.log(`    3. Verifica i tipi: ${DIM}pnpm --filter=@pagopa/go-runbook build${RESET}`);
  } else if (answers.templateId === 'lambda') {
    console.log(`    1. Popola ${CYAN}knownCases.ts${RESET} (timeout/OOM già pronti; aggiungi i casi specifici)`);
    console.log(
      `    2. Per i downstream: ${CYAN}knownServices.ts${RESET} (DOWNSTREAMS) + ${CYAN}knownErrors.ts${RESET} (DOWNSTREAM_ERROR_PATTERNS)`,
    );
    console.log(`    3. Verifica i tipi: ${DIM}pnpm --filter=@pagopa/go-runbook build${RESET}`);
  } else if (answers.templateId === 'service') {
    console.log(`    1. Popola ${CYAN}knownCases.ts${RESET} con i pattern ricorrenti nei log applicativi`);
    console.log(`    2. Se serve, personalizza query errori / trace in ${CYAN}knownServices.ts${RESET}`);
    console.log(`    3. Verifica i tipi: ${DIM}pnpm --filter=@pagopa/go-runbook build${RESET}`);
  } else {
    console.log(`    1. Aggiungi step e known case in ${CYAN}runbook.ts${RESET}`);
    console.log(`    2. Verifica i tipi: ${DIM}pnpm --filter=@pagopa/go-runbook build${RESET}`);
  }
  console.log('');
}

function printSuccess(
  answers: RunbookAnswers,
  files: ReadonlyArray<GeneratedFile>,
  wired: boolean,
  wireRequested: boolean,
): void {
  console.log(`\n${GREEN}${BOLD}✔ Runbook creato${RESET}`);
  for (const file of files) {
    console.log(`  ${GREEN}+${RESET} ${relativeToRepo(file.path)}`);
  }

  const manifest = relativeToRepo(manifestFile(answers.product));
  if (wireRequested && wired) {
    console.log(`  ${GREEN}~${RESET} ${manifest} (import + ${manifestConstName(answers.product)})`);
  } else if (wireRequested) {
    console.log(`  ${YELLOW}!${RESET} ${manifest}: runbook già registrato`);
  } else {
    console.log(`\n  ${YELLOW}Wiring saltato.${RESET} Registra a mano in ${manifest}.`);
  }

  printNextSteps(answers);
}

function catalogKindForTemplate(templateId: string): RunbookKind | undefined {
  switch (templateId) {
    case 'api-gateway':
      return RunbookKinds.APIGW;
    case 'lambda':
      return RunbookKinds.LAMBDA;
    case 'service':
      return RunbookKinds.SERVICE;
    default:
      return undefined;
  }
}

function nonEmptyCategories(categories: ReadonlyArray<string>): readonly [string, ...string[]] {
  const [first, ...rest] = categories;
  if (first === undefined) {
    throw new Error('È necessaria almeno una categoria per registrare il runbook.');
  }
  return [first, ...rest];
}

/**
 * Builds the catalog registration for a runbook and renders its
 * `registration.ts`, so the file shows up in the plan like any other.
 */
async function renderRegistration(
  answers: RunbookAnswers,
  catalogKind: RunbookKind | undefined,
  targetDir: string,
): Promise<{ readonly file: GeneratedFile; readonly registration: RunbookRegistration }> {
  if (catalogKind === undefined) {
    throw new Error(`Il template "${answers.templateId}" non supporta il wiring automatico.`);
  }
  const registration: RunbookRegistration = {
    id: answers.id,
    constName: deriveRegistrationName(answers.id),
    product: answers.product,
    family: answers.family,
    kind: catalogKind,
    categories: nonEmptyCategories(answers.categories),
  };
  const outputPath = path.join(targetDir, 'registration.ts');
  const content = await formatTypeScript(renderRegistrationFile(registration), outputPath);
  return { file: { path: outputPath, content }, registration };
}

async function run(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));

  console.log(`\n${BOLD}${CYAN}GO Automation — New Runbook${RESET}`);

  const template = await resolveTemplate(cli.type);
  const wire = cli.wire && template.id !== 'base';
  const answers = await collectAnswers(template, { ...cli, wire });

  const idError = runbookIdError(answers.id);
  if (idError !== undefined) {
    throw new Error(idError);
  }
  const catalogKind = catalogKindForTemplate(answers.templateId);

  // Runbook keys are global: the id must be free in every product and family, not only in the target folder.
  const existing = await findExistingRunbookDir(answers.id);
  if (existing !== undefined) {
    throw new Error(`Esiste già un runbook con questo id: ${relativeToRepo(existing)}`);
  }
  // ...and among the registered keys and alarm names (aliases included), before anything is written.
  const inventory = await import('../../../packages/go-runbook/src/inventory/manifest.js');
  const registeredError = registeredRunbookIdError(answers.id, inventory.INVENTORY_MANIFEST);
  if (registeredError !== undefined) {
    throw new Error(registeredError);
  }
  const targetDir = runbookDir(answers.product, answers.family, answers.id);

  const templateFiles = await renderRunbookFiles(template, answers, TEMPLATES_ROOT, targetDir);
  const wiring = wire ? await renderRegistration(answers, catalogKind, targetDir) : undefined;
  const files = wiring === undefined ? templateFiles : [...templateFiles, wiring.file];

  printPlan(answers, files, wire);

  if (cli.dryRun) {
    printGeneratedFileContents(files);
    console.log(`\n${YELLOW}Dry run: nessun file scritto.${RESET}\n`);
    return;
  }

  if (!cli.yes) {
    const confirmed = await confirmGeneration();
    if (!confirmed) {
      console.log('Annullato.');
      return;
    }
  }

  await writeGeneratedFiles(files);

  const wired =
    wiring !== undefined && (await registerRunbookInCatalog(manifestFile(answers.product), wiring.registration));

  printSuccess(answers, files, wired, wire);
}

run().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
