import { RUNBOOK_CATALOG } from '../../inventory/registry/runbookRegistry.js';

RUNBOOK_CATALOG.validateForCloud();
process.stdout.write(JSON.stringify(RUNBOOK_CATALOG.listDescriptors()));
