import type { CaseAction } from '../../actions/CaseAction.js';
import type { ServiceDescriptor } from '../types/ServiceDescriptor.js';

export function defaultServiceUnknownCaseFallback(service: ServiceDescriptor): CaseAction {
  return {
    type: 'log',
    level: 'warn',
    renderAs: 'unknown-case',
    message:
      '[CASO NON RICONOSCIUTO]\n' +
      "Esito: Impossibile identificare univocamente la causa dell'errore.\n" +
      'Dettaglio: nessun caso noto ha soddisfatto le condizioni del runbook.\n' +
      `Servizio: ${service.name}\n` +
      `Log group: ${service.logGroup}\n` +
      `Log errore: {{vars.${service.varPrefix}LogCount}}\n` +
      `Trace ID: {{vars.${service.varPrefix}TraceId}}\n` +
      `Log trace: {{vars.${service.varPrefix}TraceLogCount}}\n` +
      `Errore: {{vars.${service.varPrefix}ErrorMsg}}\n`,
  };
}
