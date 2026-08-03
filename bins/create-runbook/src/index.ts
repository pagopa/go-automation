/**
 * GO Automation - New Runbook Scaffolder
 *
 * Creates a new runbook in the go-runbook catalog from a template, and (by
 * default) registers it in the automatic registry.
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
 *   --builder <name>         Builder function name (default: derived from id)
 *   --description <text>     Runbook metadata description
 *   --version <semver>       Runbook metadata version (default: 1.0.0)
 *   --team <team>            Runbook metadata team (default: GO)
 *   --tags <csv>             Comma-separated metadata tags
 *   --categories <csv>       Comma-separated automatic catalog categories
 *   --api-gw-log-group, --entry-service, --var-prefix, --log-group,
 *   --execution-log-group, --authorizer   (api-gateway template inputs)
 *   --entry-lambda, --var-prefix, --event-source   (lambda template inputs)
 *   --service-name, --var-prefix, --log-group   (service template inputs)
 *   --no-wire                Do not modify the automatic runbook registry
 *   --dry-run                Render and print without writing or wiring
 *   --yes                    Skip the confirmation prompt
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { parseCliArgs } from './cli/parseArgs.js';
import { resolveTemplate, collectAnswers, confirmGeneration } from './cli/prompts.js';
import { renderRunbookFiles, writeGeneratedFiles } from './generate/scaffoldRunbook.js';
import type { GeneratedFile } from './generate/scaffoldRunbook.js';
import { registerRunbookInCatalog } from './wiring/registerInCatalog.js';
import { runbookIdError } from './validation/runbookIdError.js';
import { REPO_ROOT, RUNBOOK_REGISTRY_FILE, RUNBOOKS_DIR, TEMPLATES_ROOT } from './constants.js';
import type { RunbookAnswers } from './templates/RunbookAnswers.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

type AutomaticRunbookKind = 'APIGW' | 'LAMBDA' | 'SERVICE';

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function relativeToRepo(target: string): string {
  return path.relative(REPO_ROOT, target);
}

function printPlan(answers: RunbookAnswers, files: ReadonlyArray<GeneratedFile>, wire: boolean): void {
  console.log(`\n${BOLD}Runbook${RESET}   ${answers.id}`);
  console.log(`${BOLD}Template${RESET}  ${answers.templateId}`);
  console.log(`${BOLD}Builder${RESET}   ${answers.builderName}()`);
  console.log(`${BOLD}File (${String(files.length)})${RESET}`);
  for (const file of files) {
    console.log(`  ${CYAN}${relativeToRepo(file.path)}${RESET}`);
  }
  const wiringLabel = wire
    ? `import + REGISTRATIONS in ${relativeToRepo(RUNBOOK_REGISTRY_FILE)}`
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
    console.log(`    3. Verifica i tipi: ${DIM}pnpm --filter=@go-automation/go-runbook build${RESET}`);
  } else if (answers.templateId === 'lambda') {
    console.log(`    1. Popola ${CYAN}knownCases.ts${RESET} (timeout/OOM già pronti; aggiungi i casi specifici)`);
    console.log(
      `    2. Per i downstream: ${CYAN}knownServices.ts${RESET} (DOWNSTREAMS) + ${CYAN}knownErrors.ts${RESET} (DOWNSTREAM_ERROR_PATTERNS)`,
    );
    console.log(`    3. Verifica i tipi: ${DIM}pnpm --filter=@go-automation/go-runbook build${RESET}`);
  } else if (answers.templateId === 'service') {
    console.log(`    1. Popola ${CYAN}knownCases.ts${RESET} con i pattern ricorrenti nei log applicativi`);
    console.log(`    2. Se serve, personalizza query errori / trace in ${CYAN}knownServices.ts${RESET}`);
    console.log(`    3. Verifica i tipi: ${DIM}pnpm --filter=@go-automation/go-runbook build${RESET}`);
  } else {
    console.log(`    1. Aggiungi step e known case in ${CYAN}runbook.ts${RESET}`);
    console.log(`    2. Verifica i tipi: ${DIM}pnpm --filter=@go-automation/go-runbook build${RESET}`);
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

  if (wireRequested && wired) {
    console.log(`  ${GREEN}~${RESET} ${relativeToRepo(RUNBOOK_REGISTRY_FILE)} (import + REGISTRATIONS)`);
  } else if (wireRequested) {
    console.log(`  ${YELLOW}!${RESET} ${relativeToRepo(RUNBOOK_REGISTRY_FILE)}: builder già registrato`);
  } else {
    console.log(`\n  ${YELLOW}Wiring saltato.${RESET} Registra a mano in ${relativeToRepo(RUNBOOK_REGISTRY_FILE)}.`);
  }

  printNextSteps(answers);
}

function catalogKindForTemplate(templateId: string): AutomaticRunbookKind | undefined {
  switch (templateId) {
    case 'api-gateway':
      return 'APIGW';
    case 'lambda':
      return 'LAMBDA';
    case 'service':
      return 'SERVICE';
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

  const targetDir = path.join(RUNBOOKS_DIR, answers.id);
  if (await pathExists(targetDir)) {
    throw new Error(`La cartella runbook esiste già: ${relativeToRepo(targetDir)}`);
  }

  const files = await renderRunbookFiles(template, answers, TEMPLATES_ROOT, targetDir);

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

  let wired = false;
  if (wire) {
    if (catalogKind === undefined) {
      throw new Error(`Il template "${answers.templateId}" non supporta il wiring automatico.`);
    }
    wired = await registerRunbookInCatalog(RUNBOOK_REGISTRY_FILE, {
      id: answers.id,
      builderName: answers.builderName,
      importPath: `./runbooks/${answers.id}/runbook.js`,
      kind: catalogKind,
      categories: nonEmptyCategories(answers.categories),
    });
  }

  printSuccess(answers, files, wired, wire);
}

run().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
