export type ExecutionTelemetryFields = {
  telemetryVersion?: number;
  telemetryUpdatedAt?: number;
  verificationSequence?: number;
  verificationFinalized?: boolean;
  stabilizationCompleted?: boolean;
  mutationHeartbeatAt?: number;
};

export function shouldApplyExecutionTelemetry(
  current: ExecutionTelemetryFields | null | undefined,
  incoming: ExecutionTelemetryFields | null | undefined,
): boolean {
  if (!incoming) return false;
  if (!current) return true;

  if (current.verificationFinalized && !incoming.verificationFinalized) {
    return false;
  }

  const currentVersion = current.telemetryVersion ?? 0;
  const incomingVersion = incoming.telemetryVersion ?? 0;
  if (incomingVersion > currentVersion) return true;
  if (incomingVersion < currentVersion) return false;

  const currentUpdatedAt = current.telemetryUpdatedAt ?? 0;
  const incomingUpdatedAt = incoming.telemetryUpdatedAt ?? 0;
  if (incomingUpdatedAt > currentUpdatedAt) return true;
  if (incomingUpdatedAt < currentUpdatedAt) return false;

  const currentHeartbeat = current.mutationHeartbeatAt ?? 0;
  const incomingHeartbeat = incoming.mutationHeartbeatAt ?? 0;
  if (incomingHeartbeat > currentHeartbeat) return true;
  if (incomingHeartbeat < currentHeartbeat) return false;

  const currentSequence = current.verificationSequence ?? 0;
  const incomingSequence = incoming.verificationSequence ?? 0;
  return incomingSequence >= currentSequence;
}

export function mergeExecutionState<T extends ExecutionTelemetryFields>(
  current: T | null,
  incoming: T | null,
): T | null {
  if (!incoming) return current;
  if (!current) return incoming;
  if (shouldApplyExecutionTelemetry(current, incoming)) {
    return incoming;
  }
  return current;
}
