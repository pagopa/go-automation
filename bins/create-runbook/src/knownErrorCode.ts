/**
 * Proposes the code of a new known error, which its author then writes in the source:
 * `pnpm known-error:code <runbook-key> <name> [--common] [--product <PRODUCT> --kind <KIND>]`. The product and the
 * family come from the runbook registered with that key, or from `--product` and `--kind` for a runbook not registered
 * yet, or documented only in go-runbooks; `--common` gives the code of a known error its family adds to several
 * runbooks. A code that a known error of the catalog already has is refused, with its runbook, unless it is the COMMON
 * code asked with `--common`.
 */
import { parseArgs } from 'node:util';

import { knownErrorCodeOf } from '../../../packages/go-runbook/src/toolkits/common/registration/knownErrorCodeOf.js';
import { isRunbookKind } from '../../../packages/go-runbook/src/toolkits/common/registration/isRunbookKind.js';
import { isRunbookProduct } from '../../../packages/go-runbook/src/toolkits/common/registration/isRunbookProduct.js';
import { RunbookKinds } from '../../../packages/go-runbook/src/toolkits/common/registration/RunbookKind.js';
import { RunbookProducts } from '../../../packages/go-runbook/src/toolkits/common/registration/RunbookProduct.js';

const USAGE =
  'Uso: pnpm known-error:code <chiave del runbook> <nome-in-kebab-case> [--common] ' +
  `[--product ${Object.values(RunbookProducts).join('|')} --kind ${Object.values(RunbookKinds).join('|')}]`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { common: { type: 'boolean' }, product: { type: 'string' }, kind: { type: 'string' } },
});
const [runbookKey, name] = positionals;
if (runbookKey === undefined || name === undefined || positionals.length > 2) {
  console.error(USAGE);
  process.exit(2);
}
const { INVENTORY_MANIFEST } = await import('../../../packages/go-runbook/src/inventory/manifest.js');
const registration = INVENTORY_MANIFEST.find((entry) => entry.key === runbookKey);
const product = registration?.product ?? (isRunbookProduct(values.product) ? values.product : undefined);
const kind = registration?.kind ?? (isRunbookKind(values.kind) ? values.kind : undefined);
if (product === undefined || kind === undefined) {
  console.error(`Nessun runbook registrato con la chiave ${runbookKey}: indica --product e --kind.\n${USAGE}`);
  process.exit(1);
}
const common = values.common === true;
const code = knownErrorCodeOf(product, kind, common ? undefined : runbookKey, name);
if (!common) {
  const catalog = (await import('../../../packages/go-runbook/src/inventory/registry/runbookRegistry.js'))
    .RUNBOOK_CATALOG;
  const owner = catalog.listDescriptors().find(({ knownErrors }) => knownErrors.some((entry) => entry.code === code));
  if (owner !== undefined) {
    console.error(`Il codice ${code} è già di un errore noto di ${owner.key}: scegli un altro nome.`);
    process.exit(1);
  }
}
console.log(code);
