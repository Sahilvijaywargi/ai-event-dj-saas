export type RuntimePredictionSnapshot = {
  readonly predictedConfidence: number;
  readonly predictedTransitionQuality: number;
  readonly predictedRecoveryPressure: number;
  readonly predictedExecutionStability: number;
  readonly predictedRollbackRisk: number;
  readonly predictedHeartbeatDegradation: number;
  readonly predictedTransportStability: number;
  readonly predictedEnergyFlow: number;
};

export type RuntimeActualOutcome = {
  readonly actualConfidence: number;
  readonly actualTransitionQuality: number;
  readonly actualRecoveryPressure: number;
  readonly actualExecutionStability: number;
  readonly rollbackTriggered: boolean;
  readonly actualHeartbeatDegradation: number;
  readonly actualTransportStability: number;
  readonly actualEnergyFlow: number;
};

export type TransitionOutcomeAccuracy = {
  readonly predicted: number;
  readonly actual: number;
  readonly drift: number;
  readonly accuracy: number;
};

export type RuntimeRecoveryOutcome = {
  readonly predictedRecoveryPressure: number;
  readonly actualRecoveryPressure: number;
  readonly recoveryPressureDrift: number;
  readonly recoveryClassification: "stable_recovery" | "moderate_stabilization_required" | "high_intervention_probability";
};

export type ExecutionPredictionDelta = {
  readonly predictedExecutionStability: number;
  readonly actualExecutionStability: number;
  readonly executionStabilityDrift: number;
  readonly executionAccuracy: number;
};

export type NarrativeEnergyAccuracy = {
  readonly predictedEnergyFlow: number;
  readonly actualEnergyFlow: number;
  readonly narrativeEnergyDrift: number;
  readonly narrativeEnergyAccuracy: number;
};

export type ConfidenceCalibrationResult = {
  readonly calibrationError: number;
  readonly confidenceReliability: number;
  readonly recommendedConfidenceAdjustment: number;
  readonly calibrationStatus: "overestimated" | "underestimated" | "well_calibrated";
  readonly calibrationReasoning: readonly string[];
};

export type RuntimeDriftClassification =
  | "highly_accurate"
  | "calibrated"
  | "slightly_optimistic"
  | "severely_optimistic"
  | "slightly_conservative"
  | "unstable_prediction"
  | "transport_misaligned"
  | "rollback_sensitive"
  | "recovery_underestimated";

export type RuntimeDriftAnalysis = {
  readonly confidenceCalibrationError: number;
  readonly transitionPredictionDrift: number;
  readonly executionStabilityDrift: number;
  readonly rollbackRiskDrift: number;
  readonly heartbeatPredictionDrift: number;
  readonly transportIntegrityDrift: number;
  readonly narrativeEnergyDrift: number;
  readonly recoveryPressureDrift: number;
  readonly normalizedDriftScore: number;
  readonly driftSeverity: "low" | "moderate" | "high" | "critical";
  readonly classifications: readonly RuntimeDriftClassification[];
  readonly confidenceCalibration: ConfidenceCalibrationResult;
  readonly transitionOutcomeAccuracy: TransitionOutcomeAccuracy;
  readonly runtimeRecoveryOutcome: RuntimeRecoveryOutcome;
  readonly executionPredictionDelta: ExecutionPredictionDelta;
  readonly narrativeEnergyAccuracy: NarrativeEnergyAccuracy;
  readonly reasoning: readonly string[];
  readonly calibrationRecommendations: readonly string[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function absoluteDrift(predicted: number, actual: number) {
  return round(clamp(Math.abs(predicted - actual)));
}

function accuracyFromDrift(drift: number) {
  return round(clamp(100 - drift));
}

function scoreToBinaryRisk(score: number) {
  return score >= 55 ? 100 : 0;
}

function computeConfidenceCalibration(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome): ConfidenceCalibrationResult {
  const calibrationError = absoluteDrift(prediction.predictedConfidence, actual.actualConfidence);
  const confidenceReliability = accuracyFromDrift(calibrationError);
  const delta = actual.actualConfidence - prediction.predictedConfidence;
  const recommendedConfidenceAdjustment = round(clamp(delta * 0.35, -12, 12));
  const calibrationStatus =
    calibrationError <= 10 ? "well_calibrated" : prediction.predictedConfidence > actual.actualConfidence ? "overestimated" : "underestimated";
  const calibrationReasoning: string[] = [];
  if (calibrationStatus === "well_calibrated") {
    calibrationReasoning.push("Predicted confidence aligns with observed runtime confidence.");
  } else if (calibrationStatus === "overestimated") {
    calibrationReasoning.push("Predicted confidence exceeded observed execution confidence.");
  } else {
    calibrationReasoning.push("Predicted confidence was conservative against observed confidence.");
  }
  calibrationReasoning.push(`Recommended bounded confidence adjustment: ${recommendedConfidenceAdjustment >= 0 ? "+" : ""}${recommendedConfidenceAdjustment.toFixed(2)}.`);
  return {
    calibrationError,
    confidenceReliability,
    recommendedConfidenceAdjustment,
    calibrationStatus,
    calibrationReasoning,
  };
}

export function evaluateConfidencePredictionAccuracy(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome) {
  return accuracyFromDrift(absoluteDrift(prediction.predictedConfidence, actual.actualConfidence));
}

export function evaluateTransitionQualityPredictionAccuracy(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome) {
  return accuracyFromDrift(absoluteDrift(prediction.predictedTransitionQuality, actual.actualTransitionQuality));
}

export function evaluateRecoveryPredictionAccuracy(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome) {
  return accuracyFromDrift(absoluteDrift(prediction.predictedRecoveryPressure, actual.actualRecoveryPressure));
}

export function evaluateHeartbeatPredictionAccuracy(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome) {
  return accuracyFromDrift(absoluteDrift(prediction.predictedHeartbeatDegradation, actual.actualHeartbeatDegradation));
}

export function evaluateRollbackRiskPredictionAccuracy(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome) {
  const predicted = scoreToBinaryRisk(prediction.predictedRollbackRisk);
  const observed = actual.rollbackTriggered ? 100 : 0;
  return accuracyFromDrift(absoluteDrift(predicted, observed));
}

export function evaluateTransportStabilityPredictionAccuracy(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome) {
  return accuracyFromDrift(absoluteDrift(prediction.predictedTransportStability, actual.actualTransportStability));
}

export function evaluateEnergyFlowPredictionAccuracy(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome) {
  return accuracyFromDrift(absoluteDrift(prediction.predictedEnergyFlow, actual.actualEnergyFlow));
}

export function evaluateExecutionStabilityPredictionAccuracy(prediction: RuntimePredictionSnapshot, actual: RuntimeActualOutcome) {
  return accuracyFromDrift(absoluteDrift(prediction.predictedExecutionStability, actual.actualExecutionStability));
}

export function analyzeRuntimeDrift(input: {
  prediction: RuntimePredictionSnapshot;
  actual: RuntimeActualOutcome;
}): RuntimeDriftAnalysis {
  const confidenceCalibration = computeConfidenceCalibration(input.prediction, input.actual);
  const transitionPredictionDrift = absoluteDrift(input.prediction.predictedTransitionQuality, input.actual.actualTransitionQuality);
  const executionStabilityDrift = absoluteDrift(input.prediction.predictedExecutionStability, input.actual.actualExecutionStability);
  const rollbackRiskDrift = absoluteDrift(scoreToBinaryRisk(input.prediction.predictedRollbackRisk), input.actual.rollbackTriggered ? 100 : 0);
  const heartbeatPredictionDrift = absoluteDrift(input.prediction.predictedHeartbeatDegradation, input.actual.actualHeartbeatDegradation);
  const transportIntegrityDrift = absoluteDrift(input.prediction.predictedTransportStability, input.actual.actualTransportStability);
  const narrativeEnergyDrift = absoluteDrift(input.prediction.predictedEnergyFlow, input.actual.actualEnergyFlow);
  const recoveryPressureDrift = absoluteDrift(input.prediction.predictedRecoveryPressure, input.actual.actualRecoveryPressure);
  const normalizedDriftScore = round(
    clamp(
      confidenceCalibration.calibrationError * 0.18 +
        transitionPredictionDrift * 0.12 +
        executionStabilityDrift * 0.16 +
        rollbackRiskDrift * 0.12 +
        heartbeatPredictionDrift * 0.1 +
        transportIntegrityDrift * 0.1 +
        narrativeEnergyDrift * 0.1 +
        recoveryPressureDrift * 0.12,
    ),
  );
  const driftSeverity =
    normalizedDriftScore < 20 ? "low" : normalizedDriftScore < 40 ? "moderate" : normalizedDriftScore < 65 ? "high" : "critical";

  const classifications: RuntimeDriftClassification[] = [];
  if (normalizedDriftScore <= 12) classifications.push("highly_accurate");
  if (normalizedDriftScore <= 25) classifications.push("calibrated");
  if (confidenceCalibration.calibrationStatus === "overestimated" && confidenceCalibration.calibrationError >= 25) classifications.push("severely_optimistic");
  else if (confidenceCalibration.calibrationStatus === "overestimated") classifications.push("slightly_optimistic");
  if (confidenceCalibration.calibrationStatus === "underestimated") classifications.push("slightly_conservative");
  if (executionStabilityDrift >= 35 || heartbeatPredictionDrift >= 35) classifications.push("unstable_prediction");
  if (transportIntegrityDrift >= 30) classifications.push("transport_misaligned");
  if (input.actual.rollbackTriggered || rollbackRiskDrift >= 45) classifications.push("rollback_sensitive");
  if (input.prediction.predictedRecoveryPressure + 15 < input.actual.actualRecoveryPressure) classifications.push("recovery_underestimated");

  const transitionOutcomeAccuracy: TransitionOutcomeAccuracy = {
    predicted: round(clamp(input.prediction.predictedTransitionQuality)),
    actual: round(clamp(input.actual.actualTransitionQuality)),
    drift: transitionPredictionDrift,
    accuracy: evaluateTransitionQualityPredictionAccuracy(input.prediction, input.actual),
  };
  const runtimeRecoveryOutcome: RuntimeRecoveryOutcome = {
    predictedRecoveryPressure: round(clamp(input.prediction.predictedRecoveryPressure)),
    actualRecoveryPressure: round(clamp(input.actual.actualRecoveryPressure)),
    recoveryPressureDrift,
    recoveryClassification:
      input.actual.actualRecoveryPressure >= 70
        ? "high_intervention_probability"
        : input.actual.actualRecoveryPressure >= 45
          ? "moderate_stabilization_required"
          : "stable_recovery",
  };
  const executionPredictionDelta: ExecutionPredictionDelta = {
    predictedExecutionStability: round(clamp(input.prediction.predictedExecutionStability)),
    actualExecutionStability: round(clamp(input.actual.actualExecutionStability)),
    executionStabilityDrift,
    executionAccuracy: evaluateExecutionStabilityPredictionAccuracy(input.prediction, input.actual),
  };
  const narrativeEnergyAccuracy: NarrativeEnergyAccuracy = {
    predictedEnergyFlow: round(clamp(input.prediction.predictedEnergyFlow)),
    actualEnergyFlow: round(clamp(input.actual.actualEnergyFlow)),
    narrativeEnergyDrift,
    narrativeEnergyAccuracy: evaluateEnergyFlowPredictionAccuracy(input.prediction, input.actual),
  };

  const reasoning: string[] = [];
  if (driftSeverity === "low") reasoning.push("Prediction and observed runtime behavior are closely aligned.");
  else if (driftSeverity === "moderate") reasoning.push("Moderate drift detected; calibration remains serviceable with caution.");
  else if (driftSeverity === "high") reasoning.push("High drift detected; supervised calibration tightening recommended.");
  else reasoning.push("Critical drift detected; confidence and execution assumptions require strong recalibration.");
  if (rollbackRiskDrift >= 35) reasoning.push("Rollback risk prediction diverged from observed rollback behavior.");
  if (transportIntegrityDrift >= 30) reasoning.push("Transport stability prediction diverged from observed transport integrity.");
  if (recoveryPressureDrift >= 30) reasoning.push("Recovery pressure prediction underestimated or overestimated stabilization burden.");
  reasoning.push(...confidenceCalibration.calibrationReasoning);

  const calibrationRecommendations: string[] = [];
  calibrationRecommendations.push(
    confidenceCalibration.calibrationStatus === "overestimated"
      ? "Reduce confidence weighting for comparable orchestration patterns."
      : confidenceCalibration.calibrationStatus === "underestimated"
        ? "Allow mild confidence uplift for similar stable supervised outcomes."
        : "Maintain current confidence calibration bands.",
  );
  if (runtimeRecoveryOutcome.recoveryClassification === "high_intervention_probability") {
    calibrationRecommendations.push("Increase recovery-pressure penalty in supervised planning lanes.");
  }
  if (transportIntegrityDrift >= 30) {
    calibrationRecommendations.push("Tighten transport-integrity contribution before supervised action recommendations.");
  }
  if (heartbeatPredictionDrift >= 30) {
    calibrationRecommendations.push("Increase heartbeat degradation sensitivity in prediction calibration.");
  }

  return {
    confidenceCalibrationError: confidenceCalibration.calibrationError,
    transitionPredictionDrift,
    executionStabilityDrift,
    rollbackRiskDrift,
    heartbeatPredictionDrift,
    transportIntegrityDrift,
    narrativeEnergyDrift,
    recoveryPressureDrift,
    normalizedDriftScore,
    driftSeverity,
    classifications: [...new Set(classifications)],
    confidenceCalibration,
    transitionOutcomeAccuracy,
    runtimeRecoveryOutcome,
    executionPredictionDelta,
    narrativeEnergyAccuracy,
    reasoning: [...new Set(reasoning)],
    calibrationRecommendations: [...new Set(calibrationRecommendations)],
  };
}

