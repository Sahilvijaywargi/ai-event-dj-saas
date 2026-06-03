import "server-only";

import {
  computeHistoricalExecutionTrust,
  getExecutionTrustRecords,
} from "@/lib/ai/execution-trust-history";
import type { RuntimeLearningSignal } from "@/lib/ai/runtime-learning-signals";
import { computeStrategyReliability } from "@/lib/ai/strategy-reliability-history";

export interface RuntimeTrustCalibration {
  trustScore: number;
  trustTrend: "improving" | "stable" | "degrading";
  confidenceAccuracy: number;
  executionReliability: number;
  recoveryReliability: number;
  orchestrationConsistency: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  autonomyReadiness: "not_ready" | "supervised_only" | "bounded_autonomy" | "trusted_runtime";
  calibrationSeverity: "healthy" | "warning" | "critical";
  calibrationReasons: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveTrustTrend(recentDelta: number): RuntimeTrustCalibration["trustTrend"] {
  if (recentDelta >= 2.5) return "improving";
  if (recentDelta <= -2.5) return "degrading";
  return "stable";
}

function resolveAutonomyReadiness(params: {
  trustScore: number;
  executionReliability: number;
  recoveryReliability: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  orchestrationConsistency: number;
  severeDriftCount: number;
}): RuntimeTrustCalibration["autonomyReadiness"] {
  if (
    params.severeDriftCount >= 2 ||
    params.trustScore < 50 ||
    params.executionReliability < 55 ||
    params.falsePositiveRate >= 35
  ) {
    return "not_ready";
  }
  if (
    params.trustScore >= 82 &&
    params.executionReliability >= 78 &&
    params.recoveryReliability >= 75 &&
    params.falsePositiveRate < 12 &&
    params.falseNegativeRate < 18 &&
    params.orchestrationConsistency >= 72
  ) {
    return "trusted_runtime";
  }
  if (
    params.trustScore >= 75 &&
    params.executionReliability >= 70 &&
    params.recoveryReliability >= 68 &&
    params.falsePositiveRate < 20 &&
    params.falseNegativeRate < 25
  ) {
    return "bounded_autonomy";
  }
  return "supervised_only";
}

export function calibrateRuntimeTrust(params: {
  userId: string;
  learningSignals?: RuntimeLearningSignal[];
}): RuntimeTrustCalibration {
  console.log("[TRUST] calibration started", { userId: params.userId });

  const historical = computeHistoricalExecutionTrust(params.userId);
  const records = getExecutionTrustRecords(params.userId);
  const strategyReliability = computeStrategyReliability(params.userId);

  const calibrationReasons: string[] = [];
  let trustScore = historical.trustScore;

  if (!records.length) {
    return {
      trustScore: Number(trustScore.toFixed(2)),
      trustTrend: "stable",
      confidenceAccuracy: 58,
      executionReliability: 60,
      recoveryReliability: 58,
      orchestrationConsistency: 62,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      autonomyReadiness: "supervised_only",
      calibrationSeverity: "healthy",
      calibrationReasons: ["Insufficient execution history — default supervised-only readiness."],
    };
  }

  let overconfidenceCount = 0;
  let underconfidenceCount = 0;
  let stableCount = 0;
  let recoverySuccessCount = 0;
  let severeDriftCount = 0;
  let confidenceErrorSum = 0;

  for (const record of records) {
    confidenceErrorSum += Math.abs(record.predictedStability - record.actualStability);
    if (record.predictedStability >= 68 && record.actualStability < 52) {
      overconfidenceCount += 1;
    }
    if (record.predictedStability < 55 && record.actualStability >= 65) {
      underconfidenceCount += 1;
    }
    if (record.executionOutcome === "stable") stableCount += 1;
    if (record.executionOutcome === "recovered" || record.recoveryDrift < 14) {
      recoverySuccessCount += 1;
    }
    if (record.orchestrationDrift >= 42 || record.driftSeverity === "severe") {
      severeDriftCount += 1;
    }
  }

  const sampleCount = records.length;
  const falsePositiveRate = Number(((overconfidenceCount / sampleCount) * 100).toFixed(2));
  const falseNegativeRate = Number(((underconfidenceCount / sampleCount) * 100).toFixed(2));
  const executionReliability = Number(((stableCount / sampleCount) * 100).toFixed(2));
  const recoveryReliability = Number(((recoverySuccessCount / sampleCount) * 100).toFixed(2));
  const avgDrift =
    records.reduce((sum, r) => sum + r.orchestrationDrift, 0) / Math.max(sampleCount, 1);
  const orchestrationConsistency = Number(clamp(100 - avgDrift * 0.85, 0, 100).toFixed(2));
  const confidenceAccuracy = Number(
    clamp(100 - confidenceErrorSum / sampleCount * 0.9, 0, 100).toFixed(2),
  );

  const recent = records.slice(0, Math.min(5, records.length));
  const older = records.slice(Math.min(5, records.length), Math.min(10, records.length));
  const recentDelta =
    recent.reduce((sum, r) => sum + r.trustDelta, 0) / Math.max(recent.length, 1) -
    (older.length ? older.reduce((sum, r) => sum + r.trustDelta, 0) / older.length : 0);

  if (overconfidenceCount >= 2) {
    trustScore -= clamp(overconfidenceCount * 3.5, 6, 18);
    calibrationReasons.push("Repeated overconfidence detected (predicted stable, actual degraded).");
    console.log("[TRUST] overconfidence detected", { count: overconfidenceCount });
  }

  if (underconfidenceCount >= 2) {
    trustScore += clamp(underconfidenceCount * 1.5, 2, 8);
    calibrationReasons.push("Underconfidence pattern detected — relaxing false-positive penalties.");
    console.log("[TRUST] underconfidence detected", { count: underconfidenceCount });
  }

  trustScore += (strategyReliability.globalReliability - 60) * 0.08;
  trustScore = Number(clamp(trustScore, 0, 100).toFixed(2));

  const highSeveritySignals =
    params.learningSignals?.filter((s) => s.severity === "high").length ?? 0;
  if (highSeveritySignals >= 2) {
    trustScore = Number(clamp(trustScore - 4, 0, 100).toFixed(2));
    calibrationReasons.push("High-severity runtime learning signals require conservative governance.");
  }

  const trustTrend = resolveTrustTrend(recentDelta);
  const autonomyReadiness = resolveAutonomyReadiness({
    trustScore,
    executionReliability,
    recoveryReliability,
    falsePositiveRate,
    falseNegativeRate,
    orchestrationConsistency,
    severeDriftCount,
  });

  let calibrationSeverity: RuntimeTrustCalibration["calibrationSeverity"] = "healthy";
  if (trustScore < 48 || falsePositiveRate >= 30 || severeDriftCount >= 3) {
    calibrationSeverity = "critical";
  } else if (trustScore < 58 || falsePositiveRate >= 18 || executionReliability < 62) {
    calibrationSeverity = "warning";
  }

  if (autonomyReadiness === "not_ready") {
    calibrationReasons.push("Autonomy readiness blocked — runtime not yet trustworthy.");
  } else if (autonomyReadiness === "bounded_autonomy") {
    calibrationReasons.push("Bounded autonomy readiness achieved under supervised rollback mandate.");
  }

  console.log("[TRUST] runtime governance adjusted", {
    trustScore,
    autonomyReadiness,
    calibrationSeverity,
  });

  return {
    trustScore,
    trustTrend,
    confidenceAccuracy,
    executionReliability,
    recoveryReliability,
    orchestrationConsistency,
    falsePositiveRate,
    falseNegativeRate,
    autonomyReadiness,
    calibrationSeverity,
    calibrationReasons,
  };
}
