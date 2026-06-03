import type { RuntimeDriftAnalysis } from "@/lib/ai/runtime-outcome-analysis";

export type CalibrationSeverityClassification = "low" | "moderate" | "high" | "critical";

export type CalibrationSeverityClassificationLabel =
  | "highly_reliable"
  | "stable_reliability"
  | "mildly_optimistic"
  | "severely_optimistic"
  | "mildly_conservative"
  | "severely_conservative"
  | "rollback_miscalibrated"
  | "transport_misaligned"
  | "heartbeat_sensitive"
  | "recovery_underestimated"
  | "calibration_unstable";

export type CalibrationPressureSignal = {
  readonly source: "optimism_bias" | "conservatism_bias" | "rollback_drift" | "heartbeat_drift" | "transport_drift" | "recovery_drift" | "drift_volatility";
  readonly pressure: number;
  readonly reasoning: string;
};

export type ConfidenceReliabilityWindow = {
  readonly window: "recent" | "medium_term" | "stabilization_sensitive" | "rollback_sensitive";
  readonly sampleCount: number;
  readonly averageCalibrationError: number;
  readonly averageReliability: number;
  readonly optimismBiasRate: number;
  readonly conservatismBiasRate: number;
  readonly rollbackMisalignmentRate: number;
  readonly heartbeatMisalignmentRate: number;
  readonly transportMisalignmentRate: number;
  readonly recoveryUnderestimationRate: number;
};

export type CalibrationReliabilityHistory = {
  readonly entries: readonly CalibrationReliabilityEntry[];
  readonly recentWindow: ConfidenceReliabilityWindow;
  readonly mediumTermWindow: ConfidenceReliabilityWindow;
  readonly stabilizationWindow: ConfidenceReliabilityWindow;
  readonly rollbackWindow: ConfidenceReliabilityWindow;
};

export type CalibrationReliabilityEntry = {
  readonly timestamp: number;
  readonly calibrationError: number;
  readonly confidenceReliability: number;
  readonly calibrationStatus: "overestimated" | "underestimated" | "well_calibrated";
  readonly optimismDelta: number;
  readonly rollbackDrift: number;
  readonly heartbeatDrift: number;
  readonly transportDrift: number;
  readonly recoveryDrift: number;
  readonly normalizedDriftScore: number;
};

export type RuntimeCalibrationProfile = {
  readonly observationCount: number;
  readonly averageCalibrationError: number;
  readonly averageReliability: number;
  readonly optimismBiasScore: number;
  readonly conservatismBiasScore: number;
  readonly calibrationPressure: number;
  readonly reliabilityTrendDirection: "improving" | "stable" | "degrading";
};

export type CalibrationTrendAnalysis = {
  readonly profile: RuntimeCalibrationProfile;
  readonly history: CalibrationReliabilityHistory;
  readonly pressureSignals: readonly CalibrationPressureSignal[];
  readonly persistentOverconfidence: boolean;
  readonly persistentUnderconfidence: boolean;
  readonly rollbackMiscalibration: boolean;
  readonly heartbeatMiscalibration: boolean;
  readonly transportMisalignment: boolean;
  readonly recoveryUnderestimation: boolean;
};

export type ConfidenceAdjustmentRecommendation = {
  readonly boundedConfidenceAdjustment: number;
  readonly adjustmentConfidence: number;
  readonly calibrationReliabilityScore: number;
  readonly optimismBiasScore: number;
  readonly conservatismBiasScore: number;
  readonly calibrationPressure: number;
  readonly calibrationSeverity: CalibrationSeverityClassification;
  readonly calibrationSeverityLabels: readonly CalibrationSeverityClassificationLabel[];
  readonly calibrationReasoning: readonly string[];
  readonly reliabilityTrendDirection: "improving" | "stable" | "degrading";
};

export type ConfidenceCalibrationSnapshot = {
  readonly timestamp: number;
  readonly rawOrchestrationConfidence: number;
  readonly calibratedConfidence: number;
  readonly confidenceAdjustmentDelta: number;
  readonly confidenceReliability: number;
  readonly calibration: ConfidenceAdjustmentRecommendation;
};

const MAX_HISTORY_ENTRIES = 48;
const RECENT_WINDOW_SIZE = 12;
const MEDIUM_WINDOW_SIZE = 24;
const STABILIZATION_WINDOW_SIZE = 12;
const ROLLBACK_WINDOW_SIZE = 12;
const MISALIGNMENT_THRESHOLD = 28;
const OPTIMISM_DELTA_THRESHOLD = 6;
const CONSERVATISM_DELTA_THRESHOLD = -6;

const calibrationHistoryStore = new Map<string, CalibrationReliabilityEntry[]>();

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function average(values: readonly number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function boundedPush<T>(items: readonly T[], next: T, max: number): T[] {
  const merged = [...items, next];
  return merged.slice(-max);
}

function rate(values: readonly number[], predicate: (value: number) => boolean) {
  if (values.length === 0) return 0;
  return round(clamp((values.filter(predicate).length / values.length) * 100));
}

function buildWindow(
  entries: readonly CalibrationReliabilityEntry[],
  window: ConfidenceReliabilityWindow["window"],
): ConfidenceReliabilityWindow {
  if (entries.length === 0) {
    return {
      window,
      sampleCount: 0,
      averageCalibrationError: 0,
      averageReliability: 0,
      optimismBiasRate: 0,
      conservatismBiasRate: 0,
      rollbackMisalignmentRate: 0,
      heartbeatMisalignmentRate: 0,
      transportMisalignmentRate: 0,
      recoveryUnderestimationRate: 0,
    };
  }
  const optimismDeltas = entries.map((entry) => entry.optimismDelta);
  return {
    window,
    sampleCount: entries.length,
    averageCalibrationError: round(average(entries.map((entry) => entry.calibrationError))),
    averageReliability: round(average(entries.map((entry) => entry.confidenceReliability))),
    optimismBiasRate: rate(optimismDeltas, (delta) => delta >= OPTIMISM_DELTA_THRESHOLD),
    conservatismBiasRate: rate(optimismDeltas, (delta) => delta <= CONSERVATISM_DELTA_THRESHOLD),
    rollbackMisalignmentRate: rate(
      entries.map((entry) => entry.rollbackDrift),
      (value) => value >= MISALIGNMENT_THRESHOLD,
    ),
    heartbeatMisalignmentRate: rate(
      entries.map((entry) => entry.heartbeatDrift),
      (value) => value >= MISALIGNMENT_THRESHOLD,
    ),
    transportMisalignmentRate: rate(
      entries.map((entry) => entry.transportDrift),
      (value) => value >= MISALIGNMENT_THRESHOLD,
    ),
    recoveryUnderestimationRate: rate(
      entries.map((entry) => entry.recoveryDrift),
      (value) => value >= MISALIGNMENT_THRESHOLD,
    ),
  };
}

export function recordCalibrationObservation(params: {
  userId: string;
  drift: RuntimeDriftAnalysis;
  rawOrchestrationConfidence: number;
  actualConfidence?: number;
  timestamp?: number;
}) {
  const actualConfidence =
    params.actualConfidence ??
    round(
      clamp(
        params.rawOrchestrationConfidence - params.drift.confidenceCalibration.recommendedConfidenceAdjustment,
      ),
    );
  const entry: CalibrationReliabilityEntry = {
    timestamp: params.timestamp ?? Date.now(),
    calibrationError: params.drift.confidenceCalibrationError,
    confidenceReliability: params.drift.confidenceCalibration.confidenceReliability,
    calibrationStatus: params.drift.confidenceCalibration.calibrationStatus,
    optimismDelta: round(params.rawOrchestrationConfidence - actualConfidence),
    rollbackDrift: params.drift.rollbackRiskDrift,
    heartbeatDrift: params.drift.heartbeatPredictionDrift,
    transportDrift: params.drift.transportIntegrityDrift,
    recoveryDrift: params.drift.recoveryPressureDrift,
    normalizedDriftScore: params.drift.normalizedDriftScore,
  };
  const existing = calibrationHistoryStore.get(params.userId) ?? [];
  calibrationHistoryStore.set(params.userId, boundedPush(existing, entry, MAX_HISTORY_ENTRIES));
  return entry;
}

export function getCalibrationReliabilityHistory(userId: string): CalibrationReliabilityHistory {
  const entries = calibrationHistoryStore.get(userId) ?? [];
  return {
    entries,
    recentWindow: buildWindow(entries.slice(-RECENT_WINDOW_SIZE), "recent"),
    mediumTermWindow: buildWindow(entries.slice(-MEDIUM_WINDOW_SIZE), "medium_term"),
    stabilizationWindow: buildWindow(entries.slice(-STABILIZATION_WINDOW_SIZE), "stabilization_sensitive"),
    rollbackWindow: buildWindow(entries.slice(-ROLLBACK_WINDOW_SIZE), "rollback_sensitive"),
  };
}

export function evaluateCalibrationTrendAnalysis(params: {
  userId: string;
  latestDrift?: RuntimeDriftAnalysis;
}): CalibrationTrendAnalysis {
  const history = getCalibrationReliabilityHistory(params.userId);
  const recentErrors = history.recentWindow.averageCalibrationError;
  const mediumErrors = history.mediumTermWindow.averageCalibrationError;
  const reliabilityTrendDirection: RuntimeCalibrationProfile["reliabilityTrendDirection"] =
    recentErrors + 4 < mediumErrors ? "improving" : recentErrors > mediumErrors + 4 ? "degrading" : "stable";

  const profile: RuntimeCalibrationProfile = {
    observationCount: history.entries.length,
    averageCalibrationError: round(average(history.entries.map((entry) => entry.calibrationError))),
    averageReliability: round(average(history.entries.map((entry) => entry.confidenceReliability))),
    optimismBiasScore: history.recentWindow.optimismBiasRate,
    conservatismBiasScore: history.recentWindow.conservatismBiasRate,
    calibrationPressure: round(
      clamp(
        history.recentWindow.optimismBiasRate * 0.28 +
          history.recentWindow.conservatismBiasRate * 0.22 +
          history.recentWindow.rollbackMisalignmentRate * 0.18 +
          history.recentWindow.heartbeatMisalignmentRate * 0.14 +
          history.recentWindow.transportMisalignmentRate * 0.1 +
          (params.latestDrift?.normalizedDriftScore ?? 0) * 0.08,
      ),
    ),
    reliabilityTrendDirection,
  };

  const pressureSignals: CalibrationPressureSignal[] = [];
  if (profile.optimismBiasScore >= 45) {
    pressureSignals.push({
      source: "optimism_bias",
      pressure: profile.optimismBiasScore,
      reasoning: "Persistent optimism bias detected in recent calibration windows.",
    });
  }
  if (profile.conservatismBiasScore >= 40) {
    pressureSignals.push({
      source: "conservatism_bias",
      pressure: profile.conservatismBiasScore,
      reasoning: "Persistent conservatism bias detected in recent calibration windows.",
    });
  }
  if (history.rollbackWindow.rollbackMisalignmentRate >= 40) {
    pressureSignals.push({
      source: "rollback_drift",
      pressure: history.rollbackWindow.rollbackMisalignmentRate,
      reasoning: "Rollback-related miscalibration appears in rollback-sensitive window.",
    });
  }
  if (history.stabilizationWindow.heartbeatMisalignmentRate >= 35) {
    pressureSignals.push({
      source: "heartbeat_drift",
      pressure: history.stabilizationWindow.heartbeatMisalignmentRate,
      reasoning: "Heartbeat degradation predictions diverge from observed stabilization behavior.",
    });
  }
  if (history.stabilizationWindow.transportMisalignmentRate >= 35) {
    pressureSignals.push({
      source: "transport_drift",
      pressure: history.stabilizationWindow.transportMisalignmentRate,
      reasoning: "Transport instability predictions are misaligned with observed runtime transport integrity.",
    });
  }
  if (history.stabilizationWindow.recoveryUnderestimationRate >= 35) {
    pressureSignals.push({
      source: "recovery_drift",
      pressure: history.stabilizationWindow.recoveryUnderestimationRate,
      reasoning: "Recovery pressure is frequently underestimated in stabilization windows.",
    });
  }
  if ((params.latestDrift?.normalizedDriftScore ?? 0) >= 45) {
    pressureSignals.push({
      source: "drift_volatility",
      pressure: params.latestDrift?.normalizedDriftScore ?? 0,
      reasoning: "Latest drift cycle indicates elevated prediction volatility.",
    });
  }

  return {
    profile,
    history,
    pressureSignals,
    persistentOverconfidence: profile.optimismBiasScore >= 50 && profile.averageCalibrationError >= 22,
    persistentUnderconfidence: profile.conservatismBiasScore >= 45,
    rollbackMiscalibration: history.rollbackWindow.rollbackMisalignmentRate >= 40,
    heartbeatMiscalibration: history.stabilizationWindow.heartbeatMisalignmentRate >= 35,
    transportMisalignment: history.stabilizationWindow.transportMisalignmentRate >= 35,
    recoveryUnderestimation: history.stabilizationWindow.recoveryUnderestimationRate >= 35,
  };
}

function deriveCalibrationSeverityLabels(input: {
  calibration: Omit<ConfidenceAdjustmentRecommendation, "calibrationSeverityLabels">;
  trend: CalibrationTrendAnalysis;
}): CalibrationSeverityClassificationLabel[] {
  const labels: CalibrationSeverityClassificationLabel[] = [];
  if (input.calibration.calibrationReliabilityScore >= 82 && input.calibration.calibrationPressure <= 28) {
    labels.push("highly_reliable");
  } else if (input.calibration.calibrationReliabilityScore >= 68) {
    labels.push("stable_reliability");
  }
  if (input.calibration.optimismBiasScore >= 55 || input.trend.persistentOverconfidence) {
    labels.push(input.calibration.optimismBiasScore >= 70 ? "severely_optimistic" : "mildly_optimistic");
  }
  if (input.calibration.conservatismBiasScore >= 50 || input.trend.persistentUnderconfidence) {
    labels.push(input.calibration.conservatismBiasScore >= 68 ? "severely_conservative" : "mildly_conservative");
  }
  if (input.trend.rollbackMiscalibration) labels.push("rollback_miscalibrated");
  if (input.trend.transportMisalignment) labels.push("transport_misaligned");
  if (input.trend.heartbeatMiscalibration || input.trend.pressureSignals.some((signal) => signal.source === "heartbeat_drift")) {
    labels.push("heartbeat_sensitive");
  }
  if (input.trend.recoveryUnderestimation) labels.push("recovery_underestimated");
  if (input.trend.profile.reliabilityTrendDirection === "degrading" || input.calibration.calibrationPressure >= 62) {
    labels.push("calibration_unstable");
  }
  return [...new Set(labels)];
}

function deriveCalibrationSeverity(labels: readonly CalibrationSeverityClassificationLabel[]): CalibrationSeverityClassification {
  if (labels.includes("severely_optimistic") || labels.includes("rollback_miscalibrated")) return "critical";
  if (labels.includes("calibration_unstable") || labels.includes("transport_misaligned")) return "high";
  if (labels.includes("mildly_optimistic") || labels.includes("mildly_conservative")) return "moderate";
  return "low";
}

export function evaluateConfidenceCalibration(params: {
  userId: string;
  rawOrchestrationConfidence: number;
  latestDrift?: RuntimeDriftAnalysis;
}): ConfidenceAdjustmentRecommendation {
  const trend = evaluateCalibrationTrendAnalysis({
    userId: params.userId,
    latestDrift: params.latestDrift,
  });
  const recentReliability = trend.history.recentWindow.averageReliability;
  const mediumReliability = trend.history.mediumTermWindow.averageReliability;
  const reliabilityDelta = recentReliability - mediumReliability;

  let boundedConfidenceAdjustment = 0;
  if (trend.persistentOverconfidence) boundedConfidenceAdjustment -= round(clamp(trend.profile.optimismBiasScore * 0.05, 0, 6));
  if (trend.persistentUnderconfidence) boundedConfidenceAdjustment += round(clamp(trend.profile.conservatismBiasScore * 0.04, 0, 5));
  if (trend.rollbackMiscalibration) boundedConfidenceAdjustment -= 2.2;
  if (trend.heartbeatMiscalibration) boundedConfidenceAdjustment -= 1.6;
  if (trend.transportMisalignment) boundedConfidenceAdjustment -= 1.4;
  if (trend.recoveryUnderestimation) boundedConfidenceAdjustment -= 1.2;
  if (reliabilityDelta >= 4) boundedConfidenceAdjustment += round(clamp(reliabilityDelta * 0.08, 0, 3));
  if (reliabilityDelta <= -4) boundedConfidenceAdjustment -= round(clamp(Math.abs(reliabilityDelta) * 0.06, 0, 3));
  if ((params.latestDrift?.confidenceCalibration.calibrationStatus ?? "well_calibrated") === "overestimated") {
    boundedConfidenceAdjustment -= 0.8;
  }
  boundedConfidenceAdjustment = round(clamp(boundedConfidenceAdjustment, -6, 6));

  const calibrationReliabilityScore = round(clamp(recentReliability * 0.7 + mediumReliability * 0.3));
  const optimismBiasScore = trend.profile.optimismBiasScore;
  const conservatismBiasScore = trend.profile.conservatismBiasScore;
  const calibrationPressure = trend.profile.calibrationPressure;
  const adjustmentConfidence = round(
    clamp(params.rawOrchestrationConfidence + boundedConfidenceAdjustment * 0.35, 0, 100),
  );

  const calibrationReasoning: string[] = [];
  if (trend.profile.reliabilityTrendDirection === "improving") {
    calibrationReasoning.push("Historical calibration reliability is improving in recent windows.");
  } else if (trend.profile.reliabilityTrendDirection === "degrading") {
    calibrationReasoning.push("Historical calibration reliability is degrading in recent windows.");
  } else {
    calibrationReasoning.push("Historical calibration reliability remains stable across recent windows.");
  }
  if (trend.persistentOverconfidence) {
    calibrationReasoning.push("Persistent overconfidence detected; bounded downward calibration adjustment applied.");
  }
  if (trend.persistentUnderconfidence) {
    calibrationReasoning.push("Persistent underconfidence detected; bounded upward calibration adjustment applied.");
  }
  if (trend.rollbackMiscalibration) {
    calibrationReasoning.push("Rollback-sensitive miscalibration elevated calibration pressure.");
  }
  if (trend.heartbeatMiscalibration) {
    calibrationReasoning.push("Heartbeat-sensitive prediction drift increased supervised caution weighting.");
  }
  if (trend.transportMisalignment) {
    calibrationReasoning.push("Transport instability misalignment reduced confidence trustworthiness.");
  }
  if (trend.recoveryUnderestimation) {
    calibrationReasoning.push("Recovery-pressure underestimation increased stabilization priority in calibration reasoning.");
  }
  calibrationReasoning.push(`Bounded confidence adjustment: ${boundedConfidenceAdjustment >= 0 ? "+" : ""}${boundedConfidenceAdjustment.toFixed(2)}.`);

  const base: Omit<ConfidenceAdjustmentRecommendation, "calibrationSeverityLabels"> = {
    boundedConfidenceAdjustment,
    adjustmentConfidence,
    calibrationReliabilityScore,
    optimismBiasScore,
    conservatismBiasScore,
    calibrationPressure,
    calibrationSeverity: "low",
    calibrationReasoning,
    reliabilityTrendDirection: trend.profile.reliabilityTrendDirection,
  };
  const calibrationSeverityLabels = deriveCalibrationSeverityLabels({
    calibration: base,
    trend,
  });
  return {
    ...base,
    calibrationSeverity: deriveCalibrationSeverity(calibrationSeverityLabels),
    calibrationSeverityLabels,
  };
}

export function deriveEffectiveCalibratedConfidence(params: {
  rawOrchestrationConfidence: number;
  calibration: ConfidenceAdjustmentRecommendation;
}): {
  rawOrchestrationConfidence: number;
  calibratedConfidence: number;
  confidenceAdjustmentDelta: number;
  confidenceReliability: number;
} {
  const raw = round(clamp(params.rawOrchestrationConfidence));
  const delta = round(clamp(params.calibration.boundedConfidenceAdjustment * 0.35, -4, 4));
  return {
    rawOrchestrationConfidence: raw,
    calibratedConfidence: round(clamp(raw + delta)),
    confidenceAdjustmentDelta: delta,
    confidenceReliability: params.calibration.calibrationReliabilityScore,
  };
}

export function buildConfidenceCalibrationSnapshot(params: {
  userId: string;
  rawOrchestrationConfidence: number;
  latestDrift?: RuntimeDriftAnalysis;
  timestamp?: number;
}): ConfidenceCalibrationSnapshot {
  const calibration = evaluateConfidenceCalibration({
    userId: params.userId,
    rawOrchestrationConfidence: params.rawOrchestrationConfidence,
    latestDrift: params.latestDrift,
  });
  const effective = deriveEffectiveCalibratedConfidence({
    rawOrchestrationConfidence: params.rawOrchestrationConfidence,
    calibration,
  });
  return {
    timestamp: params.timestamp ?? Date.now(),
    rawOrchestrationConfidence: effective.rawOrchestrationConfidence,
    calibratedConfidence: effective.calibratedConfidence,
    confidenceAdjustmentDelta: effective.confidenceAdjustmentDelta,
    confidenceReliability: effective.confidenceReliability,
    calibration,
  };
}

export function recordCalibrationFromDrift(params: {
  userId: string;
  drift: RuntimeDriftAnalysis;
  rawOrchestrationConfidence: number;
  timestamp?: number;
}) {
  recordCalibrationObservation({
    userId: params.userId,
    drift: params.drift,
    rawOrchestrationConfidence: params.rawOrchestrationConfidence,
    timestamp: params.timestamp,
  });
  return buildConfidenceCalibrationSnapshot({
    userId: params.userId,
    rawOrchestrationConfidence: params.rawOrchestrationConfidence,
    latestDrift: params.drift,
    timestamp: params.timestamp,
  });
}
