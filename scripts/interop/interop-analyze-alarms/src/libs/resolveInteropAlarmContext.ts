import { trimToUndefined } from '@go-automation/go-common/core';
import type { InteropAlarmContext, InteropEnvironment } from '../types/index.js';

const INTEROP_ENVIRONMENTS: readonly [InteropEnvironment, ...InteropEnvironment[]] = ['prod', 'att', 'test'];
const K8S_INTEROP_ALARM_PATTERN = /^k8s-(?<podApp>.+)-errors-(?<tail>.+)$/u;

export function resolveInteropAlarmContext(alarmName: string): InteropAlarmContext {
  const normalizedAlarmName = alarmName.trim();
  const match = K8S_INTEROP_ALARM_PATTERN.exec(normalizedAlarmName);
  const podApp = trimToUndefined(match?.groups?.['podApp']);
  const tail = trimToUndefined(match?.groups?.['tail']);

  if (podApp === undefined || tail === undefined) {
    throw new Error(
      `Unsupported INTEROP k8s alarm name "${alarmName}". Expected pattern: k8s-<pod-app>-errors-<environment>[-...]`,
    );
  }

  const environment = resolveEnvironmentFromTail(tail);
  if (environment === undefined) {
    throw new Error(
      `Unsupported INTEROP k8s alarm name "${alarmName}". Expected one environment token after "-errors-": ${INTEROP_ENVIRONMENTS.join(
        ', ',
      )}.`,
    );
  }

  return {
    alarmName: normalizedAlarmName,
    environment,
    podApp,
    logGroup: `/aws/eks/interop-eks-cluster-${environment}/application`,
  };
}

function resolveEnvironmentFromTail(tail: string): InteropEnvironment | undefined {
  return tail.split('-').find(isInteropEnvironment);
}

function isInteropEnvironment(value: string): value is InteropEnvironment {
  return INTEROP_ENVIRONMENTS.includes(value as InteropEnvironment);
}
