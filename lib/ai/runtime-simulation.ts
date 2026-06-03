import "server-only";

export type RuntimeSimulationRecommendation =
  | "proceed_supervised"
  | "stabilize_first"
  | "reduce_energy"
  | "require_operator_review"
  | "reject_transition";

export type RuntimeSimulationScenario = {
  timestamp?: number;
  transitionState: "candidate_ready" | "preparing" | "guarded" | "degraded" | "blocked";
  orchestrationConfidence: number;
  transitionCompatibility: {
    compatibilityScore: number;
    phraseAlignmentScore: number;
    harmonicScore: number;
    vocalClashScore: number;
    energyFlowScore: number;
    tensionContinuityScore: number;
    riskLevel: "safe" | "moderate" | "risky" | "dangerous";
  };
  crowdState: {
    momentum: number;
    fatiguePressure: number;
    recoveryConfidence: number;
    volatility: number;
    hypeSaturation: number;
  };
  transport: {
    stability: number;
    synchronizationConfidence: number;
    freshnessScore: number;
    propagationDelayMs: number;
  };
  execution: {
    readiness: "ready" | "prepare" | "guarded" | "blocked";
    readinessScore: number;
    rollbackReadiness: number;
    rollbackSafetyMargin: number;
    heartbeatContinuity: number;
    heartbeatDrift: number;
  };
  learningProfile: {
    transitionTrustScore: number;
    harmonicTrust: number;
    phraseTimingTrust: number;
    crowdRecoveryTrust: number;
    operatorInterventionPenalty: number;
    executionRecoveryBias: number;
    emotionalContinuityTrust: number;
  };
  emotionalContinuity: number;
  energyState: {
    currentEnergy: number;
    targetEnergy: number;
    narrativeContinuity: number;
  };
};

export type RuntimeSimulationOutcome = {
  predictedTransitionSuccess: number;
  predictedCrowdRecovery: number;
  predictedExecutionStability: number;
  predictedRiskShift: number;
  predictedEnergyFlow: number;
  predictedRecoveryPressure: number;
  orchestrationConfidenceDelta: number;
  recommendedAction: RuntimeSimulationRecommendation;
  reasoning: string[];
  stabilizationRationale: string[];
  riskRationale: string[];
  confidenceRationale: string[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function normalized(value: number) {
  return clamp(value) / 100;
}

export function computeRecoveryPressure(scenario: RuntimeSimulationScenario) {
  const pressure = clamp(
    scenario.crowdState.fatiguePressure * 0.3 +
      scenario.crowdState.volatility * 0.2 +
      (100 - scenario.crowdState.recoveryConfidence) * 0.2 +
      (100 - scenario.execution.rollbackReadiness) * 0.15 +
      (100 - scenario.execution.rollbackSafetyMargin) * 0.15,
  );
  return round(pressure);
}

export function computeExecutionFailureRisk(scenario: RuntimeSimulationScenario) {
  const readinessPenalty =
    scenario.execution.readiness === "blocked"
      ? 26
      : scenario.execution.readiness === "guarded"
        ? 14
        : scenario.execution.readiness === "prepare"
          ? 7
          : 0;
  const risk = clamp(
    (100 - scenario.execution.readinessScore) * 0.32 +
      (100 - scenario.transport.stability) * 0.2 +
      (100 - scenario.transport.synchronizationConfidence) * 0.18 +
      (100 - scenario.execution.heartbeatContinuity) * 0.15 +
      scenario.execution.heartbeatDrift * 0.15 +
      readinessPenalty,
  );
  return round(risk);
}

export function computeCrowdDestabilizationRisk(scenario: RuntimeSimulationScenario) {
  const destabilization = clamp(
    scenario.crowdState.volatility * 0.3 +
      scenario.crowdState.hypeSaturation * 0.2 +
      scenario.crowdState.fatiguePressure * 0.2 +
      (100 - scenario.crowdState.recoveryConfidence) * 0.2 +
      Math.max(0, 60 - scenario.transitionCompatibility.vocalClashScore) * 0.1,
  );
  return round(destabilization);
}

export function computeEnergyShockRisk(scenario: RuntimeSimulationScenario) {
  const delta = Math.abs(scenario.energyState.targetEnergy - scenario.energyState.currentEnergy);
  const shock = clamp(
    delta * 11 +
      Math.max(0, scenario.crowdState.hypeSaturation - 70) * 0.45 +
      Math.max(0, scenario.crowdState.fatiguePressure - 65) * 0.45 +
      Math.max(0, 55 - scenario.energyState.narrativeContinuity) * 0.6,
  );
  return round(shock);
}

function recommendRuntimeAction(input: {
  success: number;
  executionFailureRisk: number;
  crowdDestabilizationRisk: number;
  recoveryPressure: number;
  energyShockRisk: number;
  scenario: RuntimeSimulationScenario;
}) {
  if (
    input.scenario.transitionCompatibility.riskLevel === "dangerous" ||
    input.scenario.execution.readiness === "blocked" ||
    input.executionFailureRisk >= 78
  ) {
    return "reject_transition" as const;
  }
  if (
    input.executionFailureRisk >= 65 ||
    input.crowdDestabilizationRisk >= 68 ||
    input.recoveryPressure >= 72
  ) {
    return "require_operator_review" as const;
  }
  if (input.energyShockRisk >= 62 || input.scenario.crowdState.hypeSaturation >= 78) {
    return "reduce_energy" as const;
  }
  if (input.success < 62 || input.recoveryPressure >= 55) {
    return "stabilize_first" as const;
  }
  return "proceed_supervised" as const;
}

export function simulateTransitionOutcome(scenario: RuntimeSimulationScenario): RuntimeSimulationOutcome {
  const recoveryPressure = computeRecoveryPressure(scenario);
  const executionFailureRisk = computeExecutionFailureRisk(scenario);
  const crowdDestabilizationRisk = computeCrowdDestabilizationRisk(scenario);
  const energyShockRisk = computeEnergyShockRisk(scenario);

  const compatibilityComposite = round(
    clamp(
      scenario.transitionCompatibility.compatibilityScore * 0.24 +
        scenario.transitionCompatibility.phraseAlignmentScore * 0.16 +
        scenario.transitionCompatibility.harmonicScore * 0.15 +
        scenario.transitionCompatibility.vocalClashScore * 0.15 +
        scenario.transitionCompatibility.energyFlowScore * 0.15 +
        scenario.transitionCompatibility.tensionContinuityScore * 0.15,
    ),
  );

  const learningSupport = round(
    clamp(
      scenario.learningProfile.transitionTrustScore * 0.2 +
        scenario.learningProfile.harmonicTrust * 0.13 +
        scenario.learningProfile.phraseTimingTrust * 0.13 +
        scenario.learningProfile.crowdRecoveryTrust * 0.14 +
        scenario.learningProfile.executionRecoveryBias * 0.2 +
        scenario.learningProfile.emotionalContinuityTrust * 0.2 -
        scenario.learningProfile.operatorInterventionPenalty * 0.24,
    ),
  );

  const predictedExecutionStability = round(
    clamp(
      scenario.execution.readinessScore * 0.34 +
        scenario.transport.stability * 0.2 +
        scenario.transport.synchronizationConfidence * 0.14 +
        scenario.execution.heartbeatContinuity * 0.12 +
        (100 - scenario.execution.heartbeatDrift) * 0.1 +
        scenario.execution.rollbackReadiness * 0.1 -
        executionFailureRisk * 0.22,
    ),
  );

  const predictedCrowdRecovery = round(
    clamp(
      scenario.crowdState.recoveryConfidence * 0.36 +
        scenario.energyState.narrativeContinuity * 0.18 +
        scenario.transitionCompatibility.energyFlowScore * 0.14 +
        scenario.emotionalContinuity * 0.16 +
        scenario.learningProfile.crowdRecoveryTrust * 0.16 -
        crowdDestabilizationRisk * 0.24,
    ),
  );

  const predictedEnergyFlow = round(
    clamp(
      scenario.transitionCompatibility.energyFlowScore * 0.42 +
        scenario.energyState.narrativeContinuity * 0.22 +
        scenario.transitionCompatibility.tensionContinuityScore * 0.2 +
        scenario.emotionalContinuity * 0.16 -
        energyShockRisk * 0.2,
    ),
  );

  const predictedTransitionSuccess = round(
    clamp(
      compatibilityComposite * 0.33 +
        predictedExecutionStability * 0.24 +
        predictedCrowdRecovery * 0.18 +
        predictedEnergyFlow * 0.15 +
        learningSupport * 0.1 -
        recoveryPressure * 0.18,
    ),
  );

  const predictedRiskShift = round(
    clamp(
      executionFailureRisk * 0.36 +
        crowdDestabilizationRisk * 0.28 +
        energyShockRisk * 0.2 +
        recoveryPressure * 0.16 -
        scenario.orchestrationConfidence * 0.12,
      -100,
      100,
    ),
  );

  const orchestrationConfidenceDelta = round(
    clamp(
      (predictedTransitionSuccess - 60) * 0.12 -
        normalized(scenario.learningProfile.operatorInterventionPenalty) * 2.5 -
        (predictedRiskShift > 0 ? predictedRiskShift * 0.045 : predictedRiskShift * 0.02),
      -12,
      12,
    ),
  );

  const recommendedAction = recommendRuntimeAction({
    success: predictedTransitionSuccess,
    executionFailureRisk,
    crowdDestabilizationRisk,
    recoveryPressure,
    energyShockRisk,
    scenario,
  });

  const stabilizationRationale: string[] = [];
  if (predictedExecutionStability >= 70) {
    stabilizationRationale.push("Execution stability model indicates supervised continuity is likely.");
  } else if (predictedExecutionStability <= 52) {
    stabilizationRationale.push("Execution stability model indicates elevated failure probability.");
  }
  if (recoveryPressure >= 66) {
    stabilizationRationale.push("Recovery pressure is elevated; stabilization runway is reduced.");
  } else {
    stabilizationRationale.push("Recovery pressure remains bounded under current rollback readiness.");
  }

  const riskRationale: string[] = [];
  if (executionFailureRisk >= 65) {
    riskRationale.push("Execution failure risk is elevated by readiness and transport fragility.");
  }
  if (crowdDestabilizationRisk >= 62) {
    riskRationale.push("Crowd destabilization risk is elevated by volatility/fatigue pressure.");
  }
  if (energyShockRisk >= 60) {
    riskRationale.push("Energy shock probability suggests potential narrative discontinuity.");
  }
  if (riskRationale.length === 0) {
    riskRationale.push("Risk model remains bounded across execution, crowd, and energy lanes.");
  }

  const confidenceRationale: string[] = [];
  if (orchestrationConfidenceDelta > 1.2) {
    confidenceRationale.push("Learning trust cautiously supports orchestration confidence.");
  } else if (orchestrationConfidenceDelta < -1.2) {
    confidenceRationale.push("Operator intervention pressure reduces projected confidence.");
  } else {
    confidenceRationale.push("Learning influence remains intentionally bounded.");
  }
  if (predictedTransitionSuccess >= 68) {
    confidenceRationale.push("Phrase/harmonic continuity supports supervised execution confidence.");
  } else if (predictedTransitionSuccess <= 54) {
    confidenceRationale.push("Projected transition success is weak under current compatibility/stability conditions.");
  }

  const reasoning = [
    ...stabilizationRationale,
    ...riskRationale,
    ...confidenceRationale,
    `Recommended action: ${recommendedAction.replace(/_/g, " ")}.`,
  ];

  return {
    predictedTransitionSuccess,
    predictedCrowdRecovery,
    predictedExecutionStability,
    predictedRiskShift,
    predictedEnergyFlow,
    predictedRecoveryPressure: recoveryPressure,
    orchestrationConfidenceDelta,
    recommendedAction,
    reasoning,
    stabilizationRationale,
    riskRationale,
    confidenceRationale,
  };
}

