import "server-only";

import type { RuntimeTrustCalibration } from "@/lib/ai/runtime-trust-calibration";
import { getExecutionTrustRecords } from "@/lib/ai/execution-trust-history";
import type { RuntimeLearningSignal } from "@/lib/ai/runtime-learning-signals";
import { computeStrategyReliability } from "@/lib/ai/strategy-reliability-history";

export interface AutonomyReadinessResult {
  readiness: "not_ready" | "supervised_only" | "bounded_autonomy" | "trusted_runtime";
  readinessScore: number;
  executionTrustScore: number;
  convergenceReliability: number;
  rollbackReliability: number;
  transportReliability: number;
  phraseRecoveryReliability: number;
  orchestrationConsistency: number;
  blockers: string[];
  recommendations: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function evaluateAutonomyReadiness(params: {
  userId: string;
  calibration: RuntimeTrustCalibration;
  learningSignals?: RuntimeLearningSignal[];
  convergenceScore?: number;
  transportStability?: number;
}): AutonomyReadinessResult {
  console.log("[TRUST] autonomy readiness evaluated", { userId: params.userId });

  const records = getExecutionTrustRecords(params.userId);
  const strategyReliability = computeStrategyReliability(params.userId);
  const blockers: string[] = [];
  const recommendations: string[] = [];

  const rollbackFailures = records.filter(
    (r) => r.rollbackSurvivability < 45 || r.executionOutcome === "failed",
  ).length;
  const severeDrift = records.filter(
    (r) => r.orchestrationDrift >= 42 || r.driftSeverity === "severe",
  ).length;
  const phraseInstability = records.filter((r) => r.phraseDrift >= 18).length;
  const staleTelemetryHits =
    params.learningSignals?.filter((s) => s.category === "transport" && s.severity === "high")
      .length ?? 0;

  if (rollbackFailures >= 2) blockers.push("repeated_rollback_failures");
  if (severeDrift >= 2) blockers.push("severe_execution_drift_repeated");
  if (phraseInstability >= 3) blockers.push("phrase_timing_instability_repeated");
  if (staleTelemetryHits >= 2) blockers.push("stale_telemetry_frequency_high");
  if (params.calibration.falsePositiveRate >= 28) {
    blockers.push("execution_false_positive_rate_high");
  }
  if (params.calibration.trustScore < 50) blockers.push("calibrated_trust_below_minimum");

  const unstableFastCut = strategyReliability.byStrategy.fast_cut;
  if (unstableFastCut && unstableFastCut.sampleCount >= 2 && unstableFastCut.reliabilityScore < 48) {
    blockers.push("fast_cut_strategy_historically_unstable");
    recommendations.push("Penalize fast_cut until strategy reliability recovers above 58.");
  }

  const recoveryBlend = strategyReliability.byStrategy.recovery_blend;
  const phraseRecoveryReliability = recoveryBlend?.recoverySuccessRate ?? params.calibration.recoveryReliability;

  if (params.calibration.autonomyReadiness === "bounded_autonomy") {
    recommendations.push("Bounded autonomy allowed only with mandatory supervised rollback and operator override.");
  } else if (params.calibration.autonomyReadiness === "supervised_only") {
    recommendations.push("Continue supervised executions to mature execution reliability telemetry.");
  } else if (params.calibration.autonomyReadiness === "not_ready") {
    recommendations.push("Hold autonomous authority expansion until drift and rollback failures subside.");
  }

  if (params.calibration.trustTrend === "degrading") {
    recommendations.push("Increase rollback weighting and reduce orchestration aggressiveness.");
  }
  if (params.calibration.falseNegativeRate >= 20) {
    recommendations.push("Widen acceptable convergence tolerance to reduce unnecessary holds.");
  }

  let readiness = params.calibration.autonomyReadiness;
  if (blockers.length > 0) {
    readiness = readiness === "trusted_runtime" ? "bounded_autonomy" : "not_ready";
  }

  const boundedAllowed =
    params.calibration.trustScore > 75 &&
    params.calibration.executionReliability > 70 &&
    (params.convergenceScore ?? 0) > 70 &&
    params.calibration.recoveryReliability > 68 &&
    params.calibration.falsePositiveRate < 20 &&
    params.calibration.falseNegativeRate < 25 &&
    blockers.length === 0;

  if (readiness === "bounded_autonomy" && !boundedAllowed) {
    readiness = "supervised_only";
    blockers.push("bounded_autonomy_thresholds_not_met");
  }

  const readinessScore = Number(
    clamp(
      params.calibration.trustScore * 0.3 +
        params.calibration.executionReliability * 0.25 +
        (params.convergenceScore ?? params.calibration.orchestrationConsistency) * 0.2 +
        params.calibration.recoveryReliability * 0.15 +
        (100 - params.calibration.falsePositiveRate) * 0.1 -
        blockers.length * 8,
      0,
      100,
    ).toFixed(2),
  );

  return {
    readiness,
    readinessScore,
    executionTrustScore: params.calibration.trustScore,
    convergenceReliability: Number(
      clamp(params.convergenceScore ?? params.calibration.orchestrationConsistency, 0, 100).toFixed(2),
    ),
    rollbackReliability: strategyReliability.byStrategy.recovery_blend?.rollbackSuccessRate ??
      params.calibration.recoveryReliability,
    transportReliability: Number(
      clamp((params.transportStability ?? 70) - staleTelemetryHits * 6, 0, 100).toFixed(2),
    ),
    phraseRecoveryReliability: Number(clamp(phraseRecoveryReliability, 0, 100).toFixed(2)),
    orchestrationConsistency: params.calibration.orchestrationConsistency,
    blockers,
    recommendations,
  };
}
