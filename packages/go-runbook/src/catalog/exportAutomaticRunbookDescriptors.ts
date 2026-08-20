import { AUTOMATIC_RUNBOOK_REGISTRY } from './runbookRegistry.js';

AUTOMATIC_RUNBOOK_REGISTRY.validateForCloud();
process.stdout.write(JSON.stringify(AUTOMATIC_RUNBOOK_REGISTRY.listDescriptors()));
