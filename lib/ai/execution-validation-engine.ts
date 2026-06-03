import "server-only";

import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { AdaptiveOrchestrationCandidate } from "@/lib/ai/adaptive-orchestration";
import type { OrchestrationConvergenceMetrics } from "@/lib/ai/orchestration-refinement-types";
import {
  extractRuntimeLearningSignals,
  type RuntimeLearningSignal,
} from "@/lib/ai/runtime-learning-signals";
import {
  recordExecutionValidation,
  computeHistoricalExecutionTrust,
} from "@/lib/ai/execution-trust-history";
import { calibrateRuntimeTrust } from "@/lib/ai/runtime-trust-calibration";
import { evaluateAutonomyReadiness } from "@/lib/ai/autonomy-readiness-engine";
import {
  recordStrategyOutcome,
  computeStrategyReliability,
} from "@/lib/ai/strategy-reliability-history";
import type { RuntimeTrustCalibration } from "@/lib/ai/runtime-trust-calibration";
import type { AutonomyReadinessResult } from "@/lib/ai/autonomy-readiness-engine";
import type {
  ExecutionDriftBreakdown,
  ExecutionValidationContext,
  ExecutionValidationResult,
} from "@/lib/ai/execution-validation-types";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import { evaluateTelemetryFreshness } from "@/lib/runtime/telemetry-heartbeat";
import { coordinateTelemetryFreshness } from "@/lib/spotify/telemetry-freshness-coordinator";
import type { TransportRuntimeState } from "@/lib/transition-orchestration/layer-state";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type ActualExecutionTelemetry = {
  executionStability: number;
  recoveryPressure: number;
  narrativeContinuity: number;
  cadenceStability: number;
  phraseRisk: number;
  transportStability: number;
  queueMutationSuccess: boolean;
  playbackContinuity: number;
  heartbeatContinuity: number;
  rollbackSurvivability: number;
};

export function computeExecutionDrift(params: {
  predicted: ExecutionValidationContext["predicted"];
  actual: ActualExecutionTelemetry;
  convergenceScore?: number;
}): ExecutionDriftBreakdown {
  const cadenceDrift = Math.abs(params.predicted.cadenceStability - params.actual.cadenceStability);
  const phraseDrift = Math.abs(params.predicted.phraseRisk - params.actual.phraseRisk);
  const recoveryDrift = Math.abs(params.predicted.recoveryPressure - params.actual.recoveryPressure);
  const transportDrift = Math.abs(params.predicted.transportStability - params.actual.transportStability);
  const stabilityDrift = Math.abs(params.predicted.executionStability - params.actual.executionStability);
  const convergenceDrift = Math.abs(
    (params.convergenceScore ?? params.predicted.convergenceScore ?? 0) -
      params.actual.executionStability * 0.85,
  );

  const orchestrationDrift = Number(
    clamp(
      stabilityDrift * 0.35 +
        cadenceDrift * 0.2 +
        phraseDrift * 0.15 +
        recoveryDrift * 0.15 +
        transportDrift * 0.1 +
        convergenceDrift * 0.05,
      0,
      100,
    ).toFixed(2),
  );

  const driftReasons: string[] = [];
  if (cadenceDrift >= 16) driftReasons.push("cadence_prediction_mismatch");
  if (phraseDrift >= 18) driftReasons.push("phrase_risk_prediction_mismatch");
  if (recoveryDrift >= 20) driftReasons.push("recovery_pressure_prediction_mismatch");
  if (transportDrift >= 22) driftReasons.push("transport_continuity_prediction_mismatch");
  if (stabilityDrift >= 24) driftReasons.push("execution_stability_prediction_mismatch");
  if (convergenceDrift >= 18) driftReasons.push("convergence_execution_mismatch");

  let driftSeverity: ExecutionDriftBreakdown["driftSeverity"] = "low";
  if (orchestrationDrift >= 42) driftSeverity = "severe";
  else if (orchestrationDrift >= 22) driftSeverity = "moderate";

  if (driftSeverity !== "low") {
    console.log("[EXECUTION] drift detected", { orchestrationDrift, driftSeverity, driftReasons });
  }

  return {
    cadenceDrift: Number(cadenceDrift.toFixed(2)),
    phraseDrift: Number(phraseDrift.toFixed(2)),
    recoveryDrift: Number(recoveryDrift.toFixed(2)),
    transportDrift: Number(transportDrift.toFixed(2)),
    convergenceDrift: Number(convergenceDrift.toFixed(2)),
    orchestrationDrift,
    driftSeverity,
    driftReasons,
  };
}

export function computeExecutionTrustAdjustment(params: {
  predictedStability: number;
  actualStability: number;
  drift: ExecutionDriftBreakdown;
  executionOutcome: ExecutionValidationResult["executionOutcome"];
}): number {
  let delta = 0;

  if (params.predictedStability >= 68 && params.actualStability < 52) {
    delta -= clamp((params.predictedStability - params.actualStability) * 0.12, 4, 14);
  } else if (params.predictedStability < 55 && params.actualStability >= 65) {
    delta += clamp((params.actualStability - params.predictedStability) * 0.06, 2, 8);
  }

  if (params.drift.driftSeverity === "severe") delta -= 10;
  else if (params.drift.driftSeverity === "moderate") delta -= 4;

  if (params.executionOutcome === "stable") delta += 3;
  if (params.executionOutcome === "failed") delta -= 12;
  if (params.executionOutcome === "recovered") delta += 1;

  return Number(clamp(delta, -18, 10).toFixed(2));
}

export type PlaybackExecutionSnapshot = {
  executionStabilityScore?: number;
  transportIntegrityScore?: number;
  transportFreshnessScore?: number;
  mutationHealthScore?: number;
  mutationContinuity?: number;
  rollbackIntegrity?: number;
  rollbackIntegrityScore?: number;
  verificationFinalized?: boolean;
  stabilizationCompleted?: boolean;
  telemetryUpdatedAt?: number;
  mutationHeartbeatAt?: number;
};

export async function observeActualExecutionTelemetry(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  queueMutationSuccess: boolean;
  executionState?: PlaybackExecutionSnapshot | null;
}): Promise<ActualExecutionTelemetry> {
  const playback = await getPlaybackOrchestrationState(params.userId);
  const executionState = params.executionState ?? {};
  const heartbeat = evaluateTelemetryFreshness(params.userId);
  const freshness = coordinateTelemetryFreshness(
    {
      verificationFinalized: executionState.verificationFinalized,
      stabilizationCompleted: executionState.stabilizationCompleted,
      rollbackIntegrity: executionState.rollbackIntegrity,
      rollbackIntegrityScore: executionState.rollbackIntegrityScore,
      telemetryUpdatedAt: executionState.telemetryUpdatedAt,
      mutationHeartbeatAt: executionState.mutationHeartbeatAt,
    },
    {
    playbackAgeMs: heartbeat.playbackAgeMs,
    deviceAgeMs: heartbeat.deviceAgeMs,
    queueAgeMs: heartbeat.queueAgeMs,
  });

  const playbackContinuity = clamp(
    (playback.playbackState?.isPlaying ? 72 : 38) +
      (playback.activeDevice ? 18 : 0) +
      heartbeat.heartbeatContinuityScore * 0.1,
    0,
    100,
  );

  const transportStability = clamp(
    executionState.transportIntegrityScore ??
      executionState.transportFreshnessScore ??
      params.evaluation.transportStability,
    0,
    100,
  );

  const executionStability = clamp(
    (executionState.executionStabilityScore ?? 0) * 0.4 +
      playbackContinuity * 0.25 +
      (executionState.mutationHealthScore ?? 0) * 0.2 +
      (freshness.freshness === "healthy" ? 12 : freshness.freshness === "grace_window" ? 6 : 0),
    0,
    100,
  );

  const recoveryPressure = clamp(
    100 -
      (executionState.rollbackIntegrity ?? executionState.rollbackIntegrityScore ?? 50) * 0.45 -
      executionStability * 0.35,
    0,
    100,
  );

  return {
    executionStability: Number(executionStability.toFixed(2)),
    recoveryPressure: Number(recoveryPressure.toFixed(2)),
    narrativeContinuity: Number(
      clamp(params.evaluation.narrativeContinuity * 0.6 + playbackContinuity * 0.25 + executionStability * 0.15, 0, 100).toFixed(2),
    ),
    cadenceStability: Number(
      clamp(
        params.evaluation.cadenceStability * 0.5 +
          (executionState.mutationContinuity ?? params.evaluation.cadenceStability) * 0.35 +
          heartbeat.heartbeatContinuityScore * 0.15,
        0,
        100,
      ).toFixed(2),
    ),
    phraseRisk: Number(
      clamp(
        params.evaluation.phraseTimingRisk +
          (params.queueMutationSuccess ? -8 : 14) +
          (playbackContinuity < 55 ? 10 : 0),
        0,
        100,
      ).toFixed(2),
    ),
    transportStability: Number(transportStability.toFixed(2)),
    queueMutationSuccess: params.queueMutationSuccess,
    playbackContinuity: Number(playbackContinuity.toFixed(2)),
    heartbeatContinuity: heartbeat.heartbeatContinuityScore,
    rollbackSurvivability: Number(
      clamp(
        executionState.rollbackIntegrity ?? executionState.rollbackIntegrityScore ?? params.evaluation.rollbackReadiness,
        0,
        100,
      ).toFixed(2),
    ),
  };
}

function resolveExecutionOutcome(params: {
  actual: ActualExecutionTelemetry;
  drift: ExecutionDriftBreakdown;
  queueSuccess: boolean;
}): ExecutionValidationResult["executionOutcome"] {
  if (!params.queueSuccess) return "failed";
  if (params.drift.driftSeverity === "severe" || params.actual.executionStability < 42) return "failed";
  if (params.actual.executionStability >= 68 && params.drift.driftSeverity === "low") return "stable";
  if (params.actual.executionStability >= 52) return "recovered";
  return "degraded";
}

function resolveValidationSeverity(
  drift: ExecutionDriftBreakdown,
  outcome: ExecutionValidationResult["executionOutcome"],
): ExecutionValidationResult["validationSeverity"] {
  if (outcome === "failed" || drift.driftSeverity === "severe") return "critical";
  if (outcome === "degraded" || drift.driftSeverity === "moderate") return "warning";
  return "healthy";
}

export function buildPredictedExecutionProfile(params: {
  evaluation: TransitionEvaluationResult;
  selectedCandidate?: AdaptiveOrchestrationCandidate | null;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
}) {
  const candidate = params.selectedCandidate;
  return {
    executionStability: candidate?.executionStability ?? params.evaluation.orchestrationStability,
    recoveryPressure: candidate?.recoveryPressure ?? params.evaluation.narrativeRecoveryPressure,
    narrativeContinuity:
      params.convergenceMetrics?.narrativeContinuity ?? params.evaluation.narrativeContinuity,
    cadenceStability: params.convergenceMetrics?.cadenceStability ?? params.evaluation.cadenceStability,
    phraseRisk: clamp(
      100 - (params.convergenceMetrics?.phraseTimingSurvivability ?? 100 - params.evaluation.phraseTimingRisk),
      0,
      100,
    ),
    transportStability: params.evaluation.transportStability,
    convergenceScore: params.convergenceMetrics?.convergenceScore,
  };
}

export async function validateExecutionOutcome(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  queueMutationSuccess: boolean;
  selectedCandidate?: AdaptiveOrchestrationCandidate | null;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
  transportRuntime?: TransportRuntimeState | null;
  executionId?: string;
  executionState?: PlaybackExecutionSnapshot | null;
}): Promise<{
  validation: ExecutionValidationResult;
  learningSignals: RuntimeLearningSignal[];
  historicalTrust: ReturnType<typeof computeHistoricalExecutionTrust>;
  runtimeTrustCalibration: RuntimeTrustCalibration;
  autonomyReadiness: AutonomyReadinessResult;
  strategyReliability: ReturnType<typeof computeStrategyReliability>;
}> {
  console.log("[EXECUTION] validation started", { userId: params.userId });
  const executionId = params.executionId ?? `exec_val_${Date.now()}`;
  const predicted = buildPredictedExecutionProfile({
    evaluation: params.evaluation,
    selectedCandidate: params.selectedCandidate,
    convergenceMetrics: params.convergenceMetrics,
  });

  const actual = await observeActualExecutionTelemetry({
    userId: params.userId,
    evaluation: params.evaluation,
    queueMutationSuccess: params.queueMutationSuccess,
    executionState: params.executionState,
  });

  console.log("[EXECUTION] predicted vs actual compared", {
    predictedStability: predicted.executionStability,
    actualStability: actual.executionStability,
  });

  const drift = computeExecutionDrift({
    predicted,
    actual,
    convergenceScore: predicted.convergenceScore,
  });

  const executionOutcome = resolveExecutionOutcome({
    actual,
    drift,
    queueSuccess: params.queueMutationSuccess,
  });

  const survivabilityDelta = Number(
    (actual.rollbackSurvivability - params.evaluation.rollbackReadiness).toFixed(2),
  );

  const executionTrustDelta = computeExecutionTrustAdjustment({
    predictedStability: predicted.executionStability,
    actualStability: actual.executionStability,
    drift,
    executionOutcome,
  });

  const learningSignalObjects = extractRuntimeLearningSignals({
    validation: {
      executionId,
      predictedExecutionStability: predicted.executionStability,
      actualExecutionStability: actual.executionStability,
      predictedRecoveryPressure: predicted.recoveryPressure,
      actualRecoveryPressure: actual.recoveryPressure,
      predictedNarrativeContinuity: predicted.narrativeContinuity,
      actualNarrativeContinuity: actual.narrativeContinuity,
      predictedCadenceStability: predicted.cadenceStability,
      actualCadenceStability: actual.cadenceStability,
      predictedPhraseRisk: predicted.phraseRisk,
      actualPhraseRisk: actual.phraseRisk,
      predictedTransportStability: predicted.transportStability,
      actualTransportStability: actual.transportStability,
      orchestrationDrift: drift.orchestrationDrift,
      survivabilityDelta,
      executionTrustDelta,
      executionOutcome,
      validationSeverity: resolveValidationSeverity(drift, executionOutcome),
      driftReasons: drift.driftReasons,
      learningSignals: [],
      driftSeverity: drift.driftSeverity,
      cadenceDrift: drift.cadenceDrift,
      phraseDrift: drift.phraseDrift,
      recoveryDrift: drift.recoveryDrift,
      transportDrift: drift.transportDrift,
      convergenceDrift: drift.convergenceDrift,
    },
    drift,
    candidateStrategy: params.selectedCandidate?.strategy,
  });

  const validation: ExecutionValidationResult = {
    executionId,
    predictedExecutionStability: predicted.executionStability,
    actualExecutionStability: actual.executionStability,
    predictedRecoveryPressure: predicted.recoveryPressure,
    actualRecoveryPressure: actual.recoveryPressure,
    predictedNarrativeContinuity: predicted.narrativeContinuity,
    actualNarrativeContinuity: actual.narrativeContinuity,
    predictedCadenceStability: predicted.cadenceStability,
    actualCadenceStability: actual.cadenceStability,
    predictedPhraseRisk: predicted.phraseRisk,
    actualPhraseRisk: actual.phraseRisk,
    predictedTransportStability: predicted.transportStability,
    actualTransportStability: actual.transportStability,
    orchestrationDrift: drift.orchestrationDrift,
    survivabilityDelta,
    executionTrustDelta,
    executionOutcome,
    validationSeverity: resolveValidationSeverity(drift, executionOutcome),
    driftReasons: drift.driftReasons,
    learningSignals: learningSignalObjects.map((s) => s.description),
    driftSeverity: drift.driftSeverity,
    cadenceDrift: drift.cadenceDrift,
    phraseDrift: drift.phraseDrift,
    recoveryDrift: drift.recoveryDrift,
    transportDrift: drift.transportDrift,
    convergenceDrift: drift.convergenceDrift,
  };

  recordExecutionValidation({
    userId: params.userId,
    validation,
    candidateStrategy: params.selectedCandidate?.strategy,
    convergenceScore: params.convergenceMetrics?.convergenceScore,
    rollbackSurvivability: actual.rollbackSurvivability,
  });

  recordStrategyOutcome({
    userId: params.userId,
    strategy: params.selectedCandidate?.strategy,
    validation,
    rollbackSurvivability: actual.rollbackSurvivability,
  });

  if (executionOutcome === "stable") {
    console.log("[EXECUTION] survivability validated", { survivabilityDelta });
  }

  const historicalTrust = computeHistoricalExecutionTrust(params.userId);
  const runtimeTrustCalibration = calibrateRuntimeTrust({
    userId: params.userId,
    learningSignals: learningSignalObjects,
  });
  const autonomyReadiness = evaluateAutonomyReadiness({
    userId: params.userId,
    calibration: runtimeTrustCalibration,
    learningSignals: learningSignalObjects,
    convergenceScore: params.convergenceMetrics?.convergenceScore,
    transportStability: params.evaluation.transportStability,
  });

  const strategyReliability = computeStrategyReliability(params.userId);

  return {
    validation,
    learningSignals: learningSignalObjects,
    historicalTrust,
    runtimeTrustCalibration,
    autonomyReadiness,
    strategyReliability,
  };
}

export function applyExecutionValidationToPlaybackState(params: {
  userId: string;
  validation: ExecutionValidationResult;
  historicalTrustScore: number;
  runtimeTrustCalibration?: RuntimeTrustCalibration;
  autonomyReadiness?: AutonomyReadinessResult;
  strategyReliability?: ReturnType<typeof computeStrategyReliability>;
}) {
  return {
    executionValidationResult: params.validation,
    executionTrustScore: Number(
      clamp(
        (params.runtimeTrustCalibration?.trustScore ?? params.historicalTrustScore) +
          params.validation.executionTrustDelta * 0.25,
        0,
        100,
      ).toFixed(2),
    ),
    executionDriftSeverity: params.validation.driftSeverity,
    runtimeTrustCalibration: params.runtimeTrustCalibration,
    autonomyReadiness: params.autonomyReadiness,
    strategyReliability: params.strategyReliability,
    globalConvergenceState:
      params.validation.validationSeverity === "healthy"
        ? ("stable" as const)
        : params.validation.validationSeverity === "warning"
          ? ("degraded" as const)
          : ("divergent" as const),
  };
}
