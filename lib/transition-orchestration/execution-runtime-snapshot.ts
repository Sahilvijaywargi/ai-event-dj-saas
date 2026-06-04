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
  rollbackReadiness?: number;
  rollbackSurvivability?: {
    rollbackReadiness?: number;
    survivabilityScore?: number;
    snapshotIntegrity?: number;
    replayConfidence?: number;
    transportRecoveryConfidence?: number;
    queueRecoveryConfidence?: number;
    mutationCheckpointCoverage?: number;
    survivable?: boolean;
  };
  transportRecovery?: {
    recoveryStrategy?: string;
    confidence?: number;
    recoveryScore?: number;
    deviceContinuity?: number;
    playbackContinuity?: number;
    queueRecoverability?: number;
    rollbackRecoverability?: number;
  };
  mutationReliability?: number;
  latestCheckpointId?: string;
  mutationJournalSize?: number;
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
    rollbackReadiness:
      state.rollbackReadiness ?? state.rollbackSurvivability?.rollbackReadiness,
    survivabilityScore: state.rollbackSurvivability?.survivabilityScore,
    mutationReliability: state.mutationReliability,
    latestCheckpointId: state.latestCheckpointId,
    mutationJournalSize: state.mutationJournalSize,
    transportRecoveryStrategy: state.transportRecovery?.recoveryStrategy,
    transportRecoveryConfidence:
      state.transportRecovery?.confidence ??
      state.rollbackSurvivability?.transportRecoveryConfidence,
    mutationHealthScore: state.mutationHeartbeat?.mutationHealthScore,
    degradationSeverity: state.degradationSeverity,
    graceState: state.graceState,
  };
}
