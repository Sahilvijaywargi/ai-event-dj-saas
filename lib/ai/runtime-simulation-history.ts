import {
  analyzeRuntimeDrift,
  type RuntimeActualOutcome,
  type RuntimeDriftAnalysis,
  type RuntimePredictionSnapshot,
} from "@/lib/ai/runtime-outcome-analysis";
import {
  buildConfidenceCalibrationSnapshot,
  recordCalibrationFromDrift,
  type ConfidenceCalibrationSnapshot,
} from "@/lib/ai/runtime-confidence-calibration";
import {
  buildRuntimeRecoverySnapshot,
  type RuntimeRecoverySignalContext,
  type RuntimeRecoverySnapshot,
} from "@/lib/ai/runtime-recovery-intelligence";
import type { RuntimeRecoveryExecutionContext } from "@/lib/ai/runtime-recovery-intelligence";
import {
  buildRuntimeNarrativeSnapshot,
  type NarrativeDriftPoint,
  type RuntimeNarrativeSignalContext,
  type RuntimeNarrativeSnapshot,
} from "@/lib/ai/runtime-narrative-orchestration";

export type RuntimeSimulationReplayEntry = {
  simulatedAt: number;
  orchestrationConfidenceSnapshot: number;
  compatibilitySnapshot: {
    compatibilityScore: number;
    phraseAlignmentScore: number;
    harmonicScore: number;
    vocalClashScore: number;
    energyFlowScore: number;
    riskLevel: "safe" | "moderate" | "risky" | "dangerous";
  };
  learningSnapshot: {
    learningConfidenceBias: number;
    learningRiskBias: number;
    stabilizationPriority: number;
    escalationClamp: number;
  };
  simulationOutcome: {
    predictedTransitionSuccess: number;
    predictedCrowdRecovery: number;
    predictedExecutionStability: number;
    predictedRiskShift: number;
    predictedEnergyFlow: number;
    predictedRecoveryPressure: number;
  };
  recommendedAction:
    | "proceed_supervised"
    | "stabilize_first"
    | "reduce_energy"
    | "require_operator_review"
    | "reject_transition";
  predictedRiskState: "low" | "medium" | "high";
  predictedRecoveryPressure: number;
  reasoning: readonly string[];
  driftAnalysis?: RuntimeDriftAnalysis;
  calibrationSnapshot?: ConfidenceCalibrationSnapshot;
  recoverySnapshot?: RuntimeRecoverySnapshot;
  narrativeSnapshot?: RuntimeNarrativeSnapshot;
};

export type RuntimeSimulationReplaySummary = {
  averagePredictedSuccess: number;
  averagePredictedStability: number;
  averageRecoveryPressure: number;
  elevatedRiskFrequency: number;
  stabilizationRecommendationFrequency: number;
  averageCalibrationReliability: number;
  averageCalibrationPressure: number;
  averageConfidenceAdjustmentDelta: number;
  averageRecoveryFeasibility: number;
  averageRecoveryEscalationPressure: number;
  averageNarrativeStability: number;
  averageNarrativePacingContinuity: number;
  averageTransitionArcSafety: number;
};

export type RuntimeSimulationDriftAnalysis = RuntimeDriftAnalysis;

type RuntimeActualSnapshot = {
  actualConfidence: number;
  actualRecoveryPressure: number;
  actualExecutionStability: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toPredictedRiskState(input: {
  predictedRiskShift: number;
  compatibilityRiskLevel: "safe" | "moderate" | "risky" | "dangerous";
  predictedExecutionStability: number;
}) {
  if (
    input.compatibilityRiskLevel === "dangerous" ||
    input.predictedRiskShift >= 45 ||
    input.predictedExecutionStability <= 50
  ) {
    return "high" as const;
  }
  if (
    input.compatibilityRiskLevel === "risky" ||
    input.compatibilityRiskLevel === "moderate" ||
    input.predictedRiskShift >= 20
  ) {
    return "medium" as const;
  }
  return "low" as const;
}

export function createRuntimeSimulationReplayEntry(input: {
  simulatedAt?: number;
  orchestrationConfidenceSnapshot: number;
  compatibilitySnapshot: RuntimeSimulationReplayEntry["compatibilitySnapshot"];
  learningSnapshot: RuntimeSimulationReplayEntry["learningSnapshot"];
  simulationOutcome: RuntimeSimulationReplayEntry["simulationOutcome"];
  recommendedAction: RuntimeSimulationReplayEntry["recommendedAction"];
  reasoning: readonly string[];
}): RuntimeSimulationReplayEntry {
  const predictedRiskState = toPredictedRiskState({
    predictedRiskShift: input.simulationOutcome.predictedRiskShift,
    compatibilityRiskLevel: input.compatibilitySnapshot.riskLevel,
    predictedExecutionStability: input.simulationOutcome.predictedExecutionStability,
  });
  return {
    simulatedAt: input.simulatedAt ?? Date.now(),
    orchestrationConfidenceSnapshot: round(clamp(input.orchestrationConfidenceSnapshot)),
    compatibilitySnapshot: {
      compatibilityScore: round(clamp(input.compatibilitySnapshot.compatibilityScore)),
      phraseAlignmentScore: round(clamp(input.compatibilitySnapshot.phraseAlignmentScore)),
      harmonicScore: round(clamp(input.compatibilitySnapshot.harmonicScore)),
      vocalClashScore: round(clamp(input.compatibilitySnapshot.vocalClashScore)),
      energyFlowScore: round(clamp(input.compatibilitySnapshot.energyFlowScore)),
      riskLevel: input.compatibilitySnapshot.riskLevel,
    },
    learningSnapshot: {
      learningConfidenceBias: round(Math.max(-100, Math.min(100, input.learningSnapshot.learningConfidenceBias))),
      learningRiskBias: round(Math.max(-100, Math.min(100, input.learningSnapshot.learningRiskBias))),
      stabilizationPriority: round(clamp(input.learningSnapshot.stabilizationPriority)),
      escalationClamp: round(clamp(input.learningSnapshot.escalationClamp, 0, 1)),
    },
    simulationOutcome: {
      predictedTransitionSuccess: round(clamp(input.simulationOutcome.predictedTransitionSuccess)),
      predictedCrowdRecovery: round(clamp(input.simulationOutcome.predictedCrowdRecovery)),
      predictedExecutionStability: round(clamp(input.simulationOutcome.predictedExecutionStability)),
      predictedRiskShift: round(Math.max(-100, Math.min(100, input.simulationOutcome.predictedRiskShift))),
      predictedEnergyFlow: round(clamp(input.simulationOutcome.predictedEnergyFlow)),
      predictedRecoveryPressure: round(clamp(input.simulationOutcome.predictedRecoveryPressure)),
    },
    recommendedAction: input.recommendedAction,
    predictedRiskState,
    predictedRecoveryPressure: round(clamp(input.simulationOutcome.predictedRecoveryPressure)),
    reasoning: [...new Set(input.reasoning.filter((line) => typeof line === "string" && line.trim().length > 0))],
  };
}

export function summarizeSimulationReplay(entries: readonly RuntimeSimulationReplayEntry[]): RuntimeSimulationReplaySummary {
  const elevatedRiskCount = entries.filter((entry) => entry.predictedRiskState !== "low").length;
  const stabilizationCount = entries.filter((entry) =>
    ["stabilize_first", "reduce_energy", "require_operator_review", "reject_transition"].includes(entry.recommendedAction),
  ).length;
  const total = Math.max(entries.length, 1);
  const calibrationEntries = entries.filter((entry) => entry.calibrationSnapshot);
  return {
    averagePredictedSuccess: round(clamp(average(entries.map((entry) => entry.simulationOutcome.predictedTransitionSuccess)))),
    averagePredictedStability: round(clamp(average(entries.map((entry) => entry.simulationOutcome.predictedExecutionStability)))),
    averageRecoveryPressure: round(clamp(average(entries.map((entry) => entry.simulationOutcome.predictedRecoveryPressure)))),
    elevatedRiskFrequency: round(clamp((elevatedRiskCount / total) * 100)),
    stabilizationRecommendationFrequency: round(clamp((stabilizationCount / total) * 100)),
    averageCalibrationReliability: round(
      clamp(average(calibrationEntries.map((entry) => entry.calibrationSnapshot?.confidenceReliability ?? 0))),
    ),
    averageCalibrationPressure: round(
      clamp(average(calibrationEntries.map((entry) => entry.calibrationSnapshot?.calibration.calibrationPressure ?? 0))),
    ),
    averageConfidenceAdjustmentDelta: round(
      clamp(average(calibrationEntries.map((entry) => entry.calibrationSnapshot?.confidenceAdjustmentDelta ?? 0))),
    ),
    averageRecoveryFeasibility: round(
      clamp(average(entries.map((entry) => entry.recoverySnapshot?.recommendation.confidence.recoveryFeasibility ?? 0))),
    ),
    averageRecoveryEscalationPressure: round(
      clamp(average(entries.map((entry) => entry.recoverySnapshot?.recommendation.escalation.rollbackEscalationPressure ?? 0))),
    ),
    averageNarrativeStability: round(
      clamp(average(entries.map((entry) => entry.narrativeSnapshot?.recommendation.narrativeStability ?? 0))),
    ),
    averageNarrativePacingContinuity: round(
      clamp(average(entries.map((entry) => entry.narrativeSnapshot?.recommendation.energyWave.pacingContinuity ?? 0))),
    ),
    averageTransitionArcSafety: round(
      clamp(average(entries.map((entry) => entry.narrativeSnapshot?.recommendation.continuity.transitionArcSafety ?? 0))),
    ),
  };
}

export function analyzeSimulationPredictionDrift(input: {
  predicted: RuntimeSimulationReplayEntry;
  actual: RuntimeActualSnapshot;
}): RuntimeSimulationDriftAnalysis {
  const prediction: RuntimePredictionSnapshot = {
    predictedConfidence: input.predicted.orchestrationConfidenceSnapshot,
    predictedTransitionQuality: input.predicted.simulationOutcome.predictedTransitionSuccess,
    predictedRecoveryPressure: input.predicted.simulationOutcome.predictedRecoveryPressure,
    predictedExecutionStability: input.predicted.simulationOutcome.predictedExecutionStability,
    predictedRollbackRisk: input.predicted.predictedRiskState === "high" ? 88 : input.predicted.predictedRiskState === "medium" ? 54 : 22,
    predictedHeartbeatDegradation: round(clamp(100 - input.predicted.simulationOutcome.predictedExecutionStability)),
    predictedTransportStability: round(
      clamp(input.predicted.compatibilitySnapshot.compatibilityScore * 0.42 + input.predicted.simulationOutcome.predictedExecutionStability * 0.58),
    ),
    predictedEnergyFlow: input.predicted.simulationOutcome.predictedEnergyFlow,
  };
  const actualOutcome: RuntimeActualOutcome = {
    actualConfidence: input.actual.actualConfidence,
    actualTransitionQuality: round(clamp(input.actual.actualExecutionStability * 0.45 + (100 - input.actual.actualRecoveryPressure) * 0.55)),
    actualRecoveryPressure: input.actual.actualRecoveryPressure,
    actualExecutionStability: input.actual.actualExecutionStability,
    rollbackTriggered: input.actual.actualRecoveryPressure >= 75 || input.actual.actualExecutionStability <= 45,
    actualHeartbeatDegradation: round(clamp(100 - input.actual.actualExecutionStability)),
    actualTransportStability: round(clamp(input.actual.actualExecutionStability * 0.52 + (100 - input.actual.actualRecoveryPressure) * 0.48)),
    actualEnergyFlow: round(
      clamp(
        input.predicted.compatibilitySnapshot.energyFlowScore * 0.38 +
          input.actual.actualExecutionStability * 0.32 +
          (100 - input.actual.actualRecoveryPressure) * 0.3,
      ),
    ),
  };
  return analyzeRuntimeDrift({
    prediction,
    actual: actualOutcome,
  });
}

export function withRuntimeDriftAnalysis(input: {
  predicted: RuntimeSimulationReplayEntry;
  actual: RuntimeActualSnapshot;
}): RuntimeSimulationReplayEntry {
  const driftAnalysis = analyzeSimulationPredictionDrift({
    predicted: input.predicted,
    actual: input.actual,
  });
  return {
    ...input.predicted,
    driftAnalysis,
  };
}

export function withRuntimeCalibrationSnapshot(input: {
  userId: string;
  predicted: RuntimeSimulationReplayEntry;
}): RuntimeSimulationReplayEntry {
  if (!input.predicted.driftAnalysis) return input.predicted;
  recordCalibrationFromDrift({
    userId: input.userId,
    drift: input.predicted.driftAnalysis,
    rawOrchestrationConfidence: input.predicted.orchestrationConfidenceSnapshot,
    timestamp: input.predicted.simulatedAt,
  });
  const calibrationSnapshot = buildConfidenceCalibrationSnapshot({
    userId: input.userId,
    rawOrchestrationConfidence: input.predicted.orchestrationConfidenceSnapshot,
    latestDrift: input.predicted.driftAnalysis,
    timestamp: input.predicted.simulatedAt,
  });
  return {
    ...input.predicted,
    calibrationSnapshot,
  };
}

export function withRuntimeRecoverySnapshot(input: {
  predicted: RuntimeSimulationReplayEntry;
  signalSummary: RuntimeRecoverySignalContext;
  playbackExecution: RuntimeRecoveryExecutionContext;
}): RuntimeSimulationReplayEntry {
  const recoverySnapshot = buildRuntimeRecoverySnapshot({
    signalSummary: input.signalSummary,
    playbackExecution: input.playbackExecution,
    calibrationSnapshot: input.predicted.calibrationSnapshot,
    timestamp: input.predicted.simulatedAt,
  });
  return {
    ...input.predicted,
    recoverySnapshot,
  };
}

export function withRuntimeNarrativeSnapshot(input: {
  predicted: RuntimeSimulationReplayEntry;
  signalSummary: RuntimeNarrativeSignalContext;
  actualDrift?: NarrativeDriftPoint;
}): RuntimeSimulationReplayEntry {
  const recommendation = input.predicted.narrativeSnapshot?.recommendation;
  const predictedDrift = recommendation
    ? {
        narrativeStability: recommendation.narrativeStability,
        pacingContinuity: recommendation.energyWave.pacingContinuity,
        fatiguePressure: recommendation.fatigue.fatiguePressure,
        recoveryContinuity: recommendation.recovery.continuityPreservingRecoveryQuality,
      }
    : undefined;
  const narrativeSnapshot = buildRuntimeNarrativeSnapshot({
    signals: input.signalSummary,
    recoverySnapshot: input.predicted.recoverySnapshot,
    calibrationSnapshot: input.predicted.calibrationSnapshot,
    timestamp: input.predicted.simulatedAt,
    predictedDrift,
    actualDrift: input.actualDrift,
  });
  return {
    ...input.predicted,
    narrativeSnapshot,
  };
}

