import { logAction } from '../../../actions/ActionFactories.js';
import type { CaseAction } from '../../../actions/CaseAction.js';
import type { InteropK8sServiceDescriptor } from '../types/InteropK8sServiceDescriptor.js';

export function defaultInteropK8sUnknownCaseFallback(service: InteropK8sServiceDescriptor): CaseAction {
  return logAction({
    level: 'warn',
    renderAs: 'unknown-case',
    message:
      '[CASO NON NOTO] Nessun caso noto INTEROP k8s ha matchato le evidenze raccolte.\n' +
      'Ambiente: {{vars.interopEnvironment}}\n' +
      'Log group: {{vars.interopLogGroup}}\n' +
      'Servizio: {{vars.interopPodApp}}\n' +
      `Log applicativi: {{vars.${service.varPrefix}LogCount}}\n` +
      `CID estratti: {{vars.${service.varPrefix}CidCount}}\n` +
      'Log CID tracker: {{vars.interopCidTrackerLogCount}}\n',
  });
}
