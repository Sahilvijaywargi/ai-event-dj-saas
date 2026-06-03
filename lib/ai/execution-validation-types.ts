import type { OrchestrationConvergenceMetrics } from "@/lib/ai/orchestration-refinement-types";

export interface ExecutionValidationResult {
  executionId: string;
  predictedExecutionStability: number;
  actualExecutionStability: number;
  predictedRecoveryPressure: number;
  actualRecoveryPressure: number;
  predictedNarrativeContinuity: number;
  actualNarrativeContinuity: number;
  predictedCadenceStability: number;
  actualCadenceStability: number;
  predictedPhraseRisk: number;
  actualPhraseRisk: number;
  predictedTransportStability: number;
  actualTransportStability: number;
  orchestrationDrift: number;
  survivabilityDelta: number;
  executionTrustDelta: number;
  executionOutcome: "stable" | "degraded" | "recovered" | "failed";
  validationSeverity: "healthy" | "warning" | "critical";
  driftReasons: string[];
  learningSignals: string[];
  driftSeverity: "low" | "moderate" | "severe";
  cadenceDrift: number;
  phraseDrift: number;
  recoveryDrift: number;
  transportDrift: number;
  convergenceDrift: number;
}

export type ExecutionDriftBreakdown = {
  cadenceDrift: number;
  phraseDrift: number;
  recoveryDrift: number;
  transportDrift: number;
  convergenceDrift: number;
  orchestrationDrift: number;
  driftSeverity: "low" | "moderate" | "severe";
  driftReasons: string[];
};

export type ExecutionValidationContext = {
  userId: string;
  executionId: string;
  evaluation: {
    orchestrationStability: number;
    narrativeContinuity: number;
    cadenceStability: number;
    phraseTimingRisk: number;
    transportStability: number;
    rollbackReadiness: number;
    crowdRecoveryConfidence?: number;
  };
  predicted: {
    executionStability: number;
    recoveryPressure: number;
    narrativeContinuity: number;
    cadenceStability: number;
    phraseRisk: number;
    transportStability: number;
    convergenceScore?: number;
  };
  candidateStrategy?: string;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
};
