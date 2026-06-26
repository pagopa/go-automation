export type RemoveProcessSignalHandlersFn = () => void;

export function installProcessSignalForwarding(controller: AbortController): RemoveProcessSignalHandlersFn {
  const onSignal = (): void => controller.abort();
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return () => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  };
}
