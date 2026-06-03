import type { ExecutionRuntimeState } from "@/lib/transition-orchestration/layer-state";

type TransportExecutionStatePayload = {
  mutationLifecycle?: { state?: string };
  executionHealthClassification?: string;
  executionStabilityScore?: number;
  transportIntegrityScore?: number;
  mutationVerification?: {
    verificationScore?: number;
    verificationConfidence?: number;
  };
  rollbackAllowed?: boolean;
  rollbackIntegrityScore?: number;
  rollbackConfidence?: number;
  mutationHeartbeat?: {
    mutationHealthScore?: number;
  };
  degradationSeverity?: string;
  graceState?: string;
};

export function buildExecutionRuntimeState(
  state?: TransportExecutionStatePayload | null,
): ExecutionRuntimeState | null {
  if (!state) return null;
  return {
    stateOrigin: "execution_runtime",
    updatedAt: new Date().toISOString(),
    lifecycleState: state.mutationLifecycle?.state,
    executionHealthClassification: state.executionHealthClassification,
    executionStabilityScore: state.executionStabilityScore,
    transportIntegrityScore: state.transportIntegrityScore,
    verificationScore: state.mutationVerification?.verificationScore,
    verificationConfidence: state.mutationVerification?.verificationConfidence,
    rollbackAllowed: state.rollbackAllowed,
    rollbackIntegrityScore: state.rollbackIntegrityScore,
    rollbackConfidence: state.rollbackConfidence,
    mutationHealthScore: state.mutationHeartbeat?.mutationHealthScore,
    degradationSeverity: state.degradationSeverity,
    graceState: state.graceState,
  };
}
