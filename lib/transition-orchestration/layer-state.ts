import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { TransportMutationResult } from "@/lib/spotify/transport-orchestrator";

export type StateOrigin =
  | "transport_runtime"
  | "orchestration_evaluation"
  | "execution_runtime";

export type TransportFreshness = "healthy" | "aging" | "stale" | "expired";

export type TransportRuntimeState = {
  stateOrigin: "transport_runtime";
  updatedAt: string;
  transportFreshness: TransportFreshness;
  freshnessScore: number;
  heartbeatContinuity: number;
  deviceSyncHealth: "healthy" | "degraded" | "critical";
  deviceSynchronizationConfidence: number;
  rollbackContinuityScore: number;
  queueContinuityScore: number;
  runtimeReconciliationStatus: "synced" | "degraded" | "failed";
  transportStability: number;
  mutationType: string | null;
  blockers: string[];
  warnings: string[];
  explainability: string[];
  recoverySuggested: boolean;
  lastMutation?: Pick<
    TransportMutationResult,
    "success" | "mutationType" | "executionSafety" | "synchronizationHealth"
  >;
};

export type OrchestrationEvaluationState = {
  stateOrigin: "orchestration_evaluation";
  updatedAt: string;
  evaluation: TransitionEvaluationResult;
};

export type ExecutionRuntimeState = {
  stateOrigin: "execution_runtime";
  updatedAt: string;
  lifecycleState?: string;
  executionHealthClassification?: string;
  executionStabilityScore?: number;
  transportIntegrityScore?: number;
  verificationScore?: number;
  verificationConfidence?: number;
  rollbackAllowed?: boolean;
  rollbackIntegrityScore?: number;
  rollbackConfidence?: number;
  mutationHealthScore?: number;
  degradationSeverity?: string;
  graceState?: string;
};

export function createOrchestrationEvaluationState(
  evaluation: TransitionEvaluationResult,
): OrchestrationEvaluationState {
  return {
    stateOrigin: "orchestration_evaluation",
    updatedAt: new Date().toISOString(),
    evaluation,
  };
}
