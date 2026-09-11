import { RUNBOOK_CATALOG } from './RunbookCatalog.js';

RUNBOOK_CATALOG.validateForCloud();
process.stdout.write(JSON.stringify(RUNBOOK_CATALOG.listDescriptors()));
