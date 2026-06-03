import type { ConfidenceCalibrationSnapshot } from "@/lib/ai/runtime-confidence-calibration";
import type { RuntimeRecoverySnapshot } from "@/lib/ai/runtime-recovery-intelligence";

export type NarrativeFlowState = "build" | "rise" | "peak" | "sustain" | "release" | "recovery" | "unstable";

export type NarrativeClassification =
  | "stable_arc"
  | "escalating_hype"
  | "fatigue_risk"
  | "pacing_unstable"
  | "cooldown_needed"
  | "recovery_sensitive"
  | "momentum_fragile"
  | "tension_overload"
  | "continuity_preserved"
  | "narrative_fractured"
  | "emotionally_stable";

export type RuntimeNarrativeSignalContext = {
  readonly narrativeFlowState: NarrativeFlowState;
  readonly narrativeMomentum: number;
  readonly narrativeTension: number;
  readonly narrativeRecoveryPressure: number;
  readonly narrativeContinuity: number;
  readonly narrativeEnergyArc: number;
  readonly narrativeFatigueRisk: number;
  readonly narrativeProgressionConfidence: number;
  readonly narrativeJourneyAlignment: number;
  readonly narrativeResolutionConfidence: number;
  readonly crowdMomentumScore: number;
  readonly crowdFatiguePressure: number;
  readonly crowdHypeSaturation: number;
  readonly crowdEnergyVolatility: number;
  readonly cadenceState: "restrained" | "balanced" | "escalating" | "aggressive" | "saturated" | "recovering" | "unstable";
  readonly cadenceDensity: number;
  readonly cadenceAggression: number;
  readonly cadenceRecoverySpacing: number;
  readonly cadenceEscalationPressure: number;
  readonly cadenceBreathingRoom: number;
  readonly cadenceStability: number;
  readonly cadenceFatigueLoad: number;
  readonly cadenceNarrativeBalance: number;
  readonly orchestrationAlignment: number;
  readonly orchestrationStability: number;
  readonly orchestrationConflictPressure: number;
  readonly transitionEnergyFlowScore?: number;
  readonly transitionCompatibilityScore?: number;
};

export type NarrativeArcState = {
  readonly flowState: NarrativeFlowState;
  readonly arcStability: number;
  readonly riseFallPacing: number;
  readonly sustainedHypePressure: number;
  readonly recoveryValleyDepth: number;
  readonly transitionPacingStability: number;
  readonly arcReasoning: readonly string[];
};

export type NarrativeEnergyWave = {
  readonly waveStability: number;
  readonly pacingContinuity: number;
  readonly fatiguePressure: number;
  readonly energySustainability: number;
  readonly currentEnergyTrajectory: number;
  readonly futureEnergyPressure: number;
  readonly hypeAccumulation: number;
  readonly recoveryOpportunity: number;
  readonly narrativeSmoothness: number;
  readonly abruptPacingRisk: number;
  readonly narrativeReasoning: readonly string[];
};

export type NarrativeTensionCurve = {
  readonly currentTension: number;
  readonly releasePotential: number;
  readonly tensionSlope: number;
  readonly peakClusterPressure: number;
  readonly sequencingStability: number;
};

export type NarrativeCadenceProfile = {
  readonly cadenceState: RuntimeNarrativeSignalContext["cadenceState"];
  readonly cadenceConsistency: number;
  readonly cooldownOpportunity: number;
  readonly escalationPressure: number;
  readonly breathingRoomQuality: number;
};

export type NarrativeFatigueModel = {
  readonly fatiguePressure: number;
  readonly sustainedHighEnergyDensity: number;
  readonly cooldownScarcity: number;
  readonly repeatedTensionPeaks: number;
  readonly pacingImbalance: number;
  readonly overAggressiveTransitionPressure: number;
  readonly recoveryInsufficiency: number;
};

export type NarrativeMomentumState = {
  readonly momentumStability: number;
  readonly pacingBalanceScore: number;
  readonly narrativeRecoveryNeed: number;
  readonly crowdMomentumAlignment: number;
};

export type NarrativeRecoveryProfile = {
  readonly narrativeDamageScore: number;
  readonly continuityPreservingRecoveryQuality: number;
  readonly emotionalResetOpportunity: number;
  readonly fallbackTransitionNarrativeQuality: number;
  readonly postRecoveryPacingStability: number;
  readonly recoveryReasoning: readonly string[];
};

export type NarrativeContinuityAssessment = {
  readonly emotionalContinuity: number;
  readonly multiTransitionContinuity: number;
  readonly arcPreservationScore: number;
  readonly transitionArcSafety: number;
  readonly continuityReasoning: readonly string[];
};

export type NarrativeRiskProfile = {
  readonly narrativeRiskScore: number;
  readonly riskClassification: "low" | "moderate" | "high" | "critical";
  readonly pacingRisk: number;
  readonly fatigueRisk: number;
  readonly momentumRisk: number;
  readonly riskReasoning: readonly string[];
};

export type NarrativeOrchestrationRecommendation = {
  readonly arc: NarrativeArcState;
  readonly energyWave: NarrativeEnergyWave;
  readonly tensionCurve: NarrativeTensionCurve;
  readonly cadence: NarrativeCadenceProfile;
  readonly fatigue: NarrativeFatigueModel;
  readonly momentum: NarrativeMomentumState;
  readonly recovery: NarrativeRecoveryProfile;
  readonly continuity: NarrativeContinuityAssessment;
  readonly risk: NarrativeRiskProfile;
  readonly narrativeStability: number;
  readonly cooldownPressure: number;
  readonly classifications: readonly NarrativeClassification[];
  readonly orchestrationReasoning: readonly string[];
};

export type NarrativeDriftDiagnostics = {
  readonly narrativeStabilityDrift: number;
  readonly pacingPredictionAccuracy: number;
  readonly fatigueMisprediction: number;
  readonly recoveryContinuityPreservation: number;
  readonly driftReasoning: readonly string[];
};

export type RuntimeNarrativeSnapshot = {
  readonly timestamp: number;
  readonly recommendation: NarrativeOrchestrationRecommendation;
  readonly driftDiagnostics?: NarrativeDriftDiagnostics;
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

function flowStatePressure(state: NarrativeFlowState) {
  if (state === "peak" || state === "sustain") return 78;
  if (state === "rise" || state === "build") return 58;
  if (state === "release" || state === "recovery") return 34;
  return 62;
}

export function evaluateNarrativeEnergyWave(input: {
  signals: RuntimeNarrativeSignalContext;
  tensionCurve: NarrativeTensionCurve;
}): NarrativeEnergyWave {
  const currentEnergyTrajectory = round(
    clamp(
      input.signals.narrativeEnergyArc * 0.42 +
        input.signals.narrativeMomentum * 0.28 +
        input.signals.crowdMomentumScore * 0.2 +
        (100 - input.signals.narrativeFatigueRisk) * 0.1,
    ),
  );
  const futureEnergyPressure = round(
    clamp(
      input.signals.cadenceEscalationPressure * 0.34 +
        input.signals.crowdHypeSaturation * 0.28 +
        input.tensionCurve.tensionSlope * 0.22 +
        input.signals.cadenceAggression * 0.16,
    ),
  );
  const hypeAccumulation = round(
    clamp(
      input.signals.crowdHypeSaturation * 0.45 +
        input.tensionCurve.peakClusterPressure * 0.3 +
        (input.signals.narrativeFlowState === "peak" || input.signals.narrativeFlowState === "sustain" ? 18 : 0),
    ),
  );
  const fatiguePressure = round(
    clamp(
      input.signals.narrativeFatigueRisk * 0.35 +
        input.signals.cadenceFatigueLoad * 0.3 +
        input.signals.crowdFatiguePressure * 0.25 +
        hypeAccumulation * 0.1,
    ),
  );
  const recoveryOpportunity = round(
    clamp(
      input.signals.cadenceRecoverySpacing * 0.32 +
        input.signals.cadenceBreathingRoom * 0.28 +
        input.tensionCurve.releasePotential * 0.25 +
        (100 - input.signals.narrativeRecoveryPressure) * 0.15,
    ),
  );
  const narrativeSmoothness = round(
    clamp(
      input.signals.narrativeJourneyAlignment * 0.35 +
        (100 - input.tensionCurve.peakClusterPressure) * 0.25 +
        input.signals.orchestrationAlignment * 0.2 +
        (input.signals.transitionEnergyFlowScore ?? input.signals.narrativeEnergyArc) * 0.2,
    ),
  );
  const abruptPacingRisk = round(
    clamp(
      input.tensionCurve.tensionSlope * 0.35 +
        input.signals.crowdEnergyVolatility * 0.3 +
        (100 - narrativeSmoothness) * 0.2 +
        (input.signals.cadenceState === "aggressive" || input.signals.cadenceState === "saturated" ? 14 : 0),
    ),
  );
  const waveStability = round(
    clamp(
      currentEnergyTrajectory * 0.28 +
        (100 - abruptPacingRisk) * 0.24 +
        narrativeSmoothness * 0.22 +
        (100 - fatiguePressure) * 0.16 +
        recoveryOpportunity * 0.1,
    ),
  );
  const pacingContinuity = round(
    clamp(
      waveStability * 0.42 +
        input.signals.narrativeContinuity * 0.28 +
        input.signals.cadenceStability * 0.2 +
        (input.signals.transitionCompatibilityScore ?? input.signals.orchestrationStability) * 0.1,
    ),
  );
  const energySustainability = round(
    clamp(
      (100 - fatiguePressure) * 0.4 +
        (100 - futureEnergyPressure) * 0.3 +
        recoveryOpportunity * 0.2 +
        waveStability * 0.1,
    ),
  );
  const narrativeReasoning: string[] = [
    `Energy trajectory ${currentEnergyTrajectory.toFixed(2)} with future pressure ${futureEnergyPressure.toFixed(2)}.`,
    abruptPacingRisk >= 55
      ? "Abrupt pacing risk elevated; narrative wave smoothing recommended before escalation."
      : "Pacing remains within deterministic narrative smoothness bounds.",
    fatiguePressure >= 60
      ? "Fatigue pressure is accumulating across cadence and crowd-density proxies."
      : "Fatigue pressure remains manageable for current arc state.",
  ];
  return {
    waveStability,
    pacingContinuity,
    fatiguePressure,
    energySustainability,
    currentEnergyTrajectory,
    futureEnergyPressure,
    hypeAccumulation,
    recoveryOpportunity,
    narrativeSmoothness,
    abruptPacingRisk,
    narrativeReasoning: Object.freeze(narrativeReasoning),
  };
}

function buildNarrativeTensionCurve(signals: RuntimeNarrativeSignalContext): NarrativeTensionCurve {
  const releasePotential = round(
    clamp(
      signals.narrativeResolutionConfidence * 0.4 +
        (100 - signals.narrativeTension) * 0.35 +
        signals.cadenceBreathingRoom * 0.25,
    ),
  );
  const tensionSlope = round(
    clamp(
      signals.narrativeTension * 0.5 +
        signals.cadenceEscalationPressure * 0.25 +
        signals.crowdEnergyVolatility * 0.25,
    ),
  );
  const peakClusterPressure =
    signals.narrativeFlowState === "peak" || signals.narrativeFlowState === "sustain"
      ? round(clamp(signals.narrativeTension * 0.6 + signals.crowdHypeSaturation * 0.4))
      : round(clamp(signals.narrativeTension * 0.35));
  const sequencingStability = round(
    clamp(
      (100 - tensionSlope) * 0.4 +
        releasePotential * 0.3 +
        signals.narrativeContinuity * 0.3,
    ),
  );
  return {
    currentTension: signals.narrativeTension,
    releasePotential,
    tensionSlope,
    peakClusterPressure,
    sequencingStability,
  };
}

function buildNarrativeCadenceProfile(signals: RuntimeNarrativeSignalContext): NarrativeCadenceProfile {
  const cadenceConsistency = round(
    clamp(
      signals.cadenceStability * 0.45 +
        signals.cadenceNarrativeBalance * 0.3 +
        (100 - signals.cadenceFatigueLoad) * 0.25,
    ),
  );
  const cooldownOpportunity = round(
    clamp(
      signals.cadenceBreathingRoom * 0.4 +
        signals.cadenceRecoverySpacing * 0.35 +
        (100 - signals.cadenceEscalationPressure) * 0.25,
    ),
  );
  return {
    cadenceState: signals.cadenceState,
    cadenceConsistency,
    cooldownOpportunity,
    escalationPressure: signals.cadenceEscalationPressure,
    breathingRoomQuality: signals.cadenceBreathingRoom,
  };
}

function buildNarrativeFatigueModel(signals: RuntimeNarrativeSignalContext, tensionCurve: NarrativeTensionCurve): NarrativeFatigueModel {
  const sustainedHighEnergyDensity = round(
    clamp(
      signals.cadenceDensity * 0.35 +
        signals.crowdHypeSaturation * 0.35 +
        flowStatePressure(signals.narrativeFlowState) * 0.3,
    ),
  );
  const cooldownScarcity = round(clamp(100 - signals.cadenceBreathingRoom + signals.cadenceEscalationPressure * 0.25));
  const repeatedTensionPeaks = tensionCurve.peakClusterPressure;
  const pacingImbalance = round(
    clamp(
      Math.abs(signals.narrativeMomentum - signals.narrativeResolutionConfidence) * 0.45 +
        signals.cadenceEscalationPressure * 0.3 +
        signals.orchestrationConflictPressure * 0.25,
    ),
  );
  const overAggressiveTransitionPressure = round(
    clamp(
      signals.cadenceAggression * 0.4 +
        (signals.cadenceState === "aggressive" || signals.cadenceState === "saturated" ? 28 : 8) +
        (100 - (signals.transitionCompatibilityScore ?? 70)) * 0.2,
    ),
  );
  const recoveryInsufficiency = round(
    clamp(
      signals.narrativeRecoveryPressure * 0.45 +
        (100 - signals.cadenceRecoverySpacing) * 0.3 +
        signals.crowdFatiguePressure * 0.25,
    ),
  );
  const fatiguePressure = round(
    clamp(
      signals.narrativeFatigueRisk * 0.28 +
        sustainedHighEnergyDensity * 0.22 +
        cooldownScarcity * 0.18 +
        repeatedTensionPeaks * 0.14 +
        pacingImbalance * 0.1 +
        overAggressiveTransitionPressure * 0.08,
    ),
  );
  return {
    fatiguePressure,
    sustainedHighEnergyDensity,
    cooldownScarcity,
    repeatedTensionPeaks,
    pacingImbalance,
    overAggressiveTransitionPressure,
    recoveryInsufficiency,
  };
}

function buildNarrativeMomentumState(signals: RuntimeNarrativeSignalContext, fatigue: NarrativeFatigueModel): NarrativeMomentumState {
  const momentumStability = round(
    clamp(
      signals.narrativeMomentum * 0.35 +
        signals.crowdMomentumScore * 0.3 +
        signals.narrativeProgressionConfidence * 0.2 +
        (100 - fatigue.fatiguePressure) * 0.15,
    ),
  );
  const pacingBalanceScore = round(
    clamp(
      (100 - fatigue.pacingImbalance) * 0.4 +
        signals.cadenceNarrativeBalance * 0.35 +
        signals.narrativeJourneyAlignment * 0.25,
    ),
  );
  const narrativeRecoveryNeed = round(
    clamp(
      signals.narrativeRecoveryPressure * 0.45 +
        fatigue.recoveryInsufficiency * 0.35 +
        (signals.narrativeFlowState === "recovery" || signals.narrativeFlowState === "release" ? 20 : 0),
    ),
  );
  const crowdMomentumAlignment = round(
    clamp(
      signals.crowdMomentumScore * 0.5 +
        signals.narrativeMomentum * 0.3 +
        (100 - Math.abs(signals.crowdMomentumScore - signals.narrativeMomentum)) * 0.2,
    ),
  );
  return {
    momentumStability,
    pacingBalanceScore,
    narrativeRecoveryNeed,
    crowdMomentumAlignment,
  };
}

function buildNarrativeArcState(
  signals: RuntimeNarrativeSignalContext,
  energyWave: NarrativeEnergyWave,
  cadence: NarrativeCadenceProfile,
): NarrativeArcState {
  const riseFallPacing = round(
    clamp(
      energyWave.currentEnergyTrajectory * 0.4 +
        (100 - energyWave.abruptPacingRisk) * 0.35 +
        cadence.cadenceConsistency * 0.25,
    ),
  );
  const sustainedHypePressure = energyWave.hypeAccumulation;
  const recoveryValleyDepth = round(clamp(energyWave.recoveryOpportunity * 0.6 + signals.narrativeRecoveryPressure * 0.4));
  const transitionPacingStability = round(
    clamp(
      energyWave.pacingContinuity * 0.45 +
        signals.narrativeContinuity * 0.35 +
        signals.orchestrationStability * 0.2,
    ),
  );
  const arcStability = round(
    clamp(
      riseFallPacing * 0.3 +
        energyWave.waveStability * 0.28 +
        transitionPacingStability * 0.22 +
        (100 - sustainedHypePressure) * 0.1 +
        signals.narrativeJourneyAlignment * 0.1,
    ),
  );
  const arcReasoning: string[] = [
    `Arc state ${signals.narrativeFlowState} with stability ${arcStability.toFixed(2)}.`,
    riseFallPacing >= 62
      ? "Rise/fall pacing supports long-horizon narrative continuity."
      : "Rise/fall pacing is constrained; transition sequencing should remain conservative.",
  ];
  return {
    flowState: signals.narrativeFlowState,
    arcStability,
    riseFallPacing,
    sustainedHypePressure,
    recoveryValleyDepth,
    transitionPacingStability,
    arcReasoning: Object.freeze(arcReasoning),
  };
}

function evaluateNarrativeRecoveryProfile(input: {
  signals: RuntimeNarrativeSignalContext;
  recoverySnapshot?: RuntimeRecoverySnapshot;
  continuity: NarrativeContinuityAssessment;
}): NarrativeRecoveryProfile {
  const executionDamage =
    (input.recoverySnapshot?.recommendation.risk.recoveryRiskScore ?? 0) * 0.45 +
    (input.recoverySnapshot?.recommendation.escalation.rollbackEscalationPressure ?? 0) * 0.35;
  const narrativeDamageScore = round(clamp(executionDamage + input.signals.narrativeRecoveryPressure * 0.2));
  const continuityPreservingRecoveryQuality = round(
    clamp(
      input.recoverySnapshot?.recommendation.continuity.continuityPreservationQuality ??
        input.continuity.arcPreservationScore * 0.7,
    ),
  );
  const emotionalResetOpportunity = round(
    clamp(
      input.signals.narrativeResolutionConfidence * 0.4 +
        (input.recoverySnapshot?.recommendation.plan.stabilization.stabilizationViable ? 22 : 8) +
        (100 - input.signals.narrativeTension) * 0.25,
    ),
  );
  const fallbackTransitionNarrativeQuality = round(
    clamp(
      input.continuity.transitionArcSafety * 0.45 +
        (input.recoverySnapshot?.recommendation.plan.fallbackStrategies.includes("fallback_transition") ? 24 : 10) +
        input.signals.orchestrationAlignment * 0.25,
    ),
  );
  const postRecoveryPacingStability = round(
    clamp(
      continuityPreservingRecoveryQuality * 0.5 +
        input.signals.cadenceStability * 0.3 +
        (100 - narrativeDamageScore) * 0.2,
    ),
  );
  const recoveryReasoning: string[] = [
    `Narrative damage proxy ${narrativeDamageScore.toFixed(2)} from execution degradation and recovery pressure.`,
    continuityPreservingRecoveryQuality >= 58
      ? "Recovery path can preserve narrative continuity before rollback escalation."
      : "Recovery path may fracture narrative continuity; supervised cooldown recommended.",
  ];
  if (input.recoverySnapshot) {
    recoveryReasoning.push(
      `Linked recovery strategy ${input.recoverySnapshot.recommendation.plan.primaryStrategy.replace(/_/g, " ")} informs narrative recovery pacing.`,
    );
  }
  return {
    narrativeDamageScore,
    continuityPreservingRecoveryQuality,
    emotionalResetOpportunity,
    fallbackTransitionNarrativeQuality,
    postRecoveryPacingStability,
    recoveryReasoning: Object.freeze(recoveryReasoning),
  };
}

function evaluateNarrativeContinuityAssessment(input: {
  signals: RuntimeNarrativeSignalContext;
  energyWave: NarrativeEnergyWave;
  arc: NarrativeArcState;
}): NarrativeContinuityAssessment {
  const emotionalContinuity = round(
    clamp(
      input.signals.narrativeResolutionConfidence * 0.35 +
        input.signals.narrativeContinuity * 0.35 +
        input.signals.orchestrationAlignment * 0.2 +
        (100 - input.signals.narrativeTension) * 0.1,
    ),
  );
  const multiTransitionContinuity = round(
    clamp(
      input.arc.transitionPacingStability * 0.35 +
        input.energyWave.pacingContinuity * 0.35 +
        input.signals.narrativeJourneyAlignment * 0.2 +
        (input.signals.transitionCompatibilityScore ?? input.signals.orchestrationStability) * 0.1,
    ),
  );
  const arcPreservationScore = round(
    clamp(
      multiTransitionContinuity * 0.45 +
        input.arc.arcStability * 0.35 +
        emotionalContinuity * 0.2,
    ),
  );
  const transitionArcSafety = round(
    clamp(
      arcPreservationScore * 0.5 +
        (input.signals.transitionEnergyFlowScore ?? input.signals.narrativeEnergyArc) * 0.25 +
        (100 - input.energyWave.abruptPacingRisk) * 0.25,
    ),
  );
  const continuityReasoning: string[] = [
    `Transition arc safety ${transitionArcSafety.toFixed(2)} relative to long-horizon arc preservation ${arcPreservationScore.toFixed(2)}.`,
    transitionArcSafety >= 62
      ? "Proposed transition path preserves the larger narrative arc under deterministic bounds."
      : "Transition may not preserve narrative arc; operator pacing review recommended.",
  ];
  return {
    emotionalContinuity,
    multiTransitionContinuity,
    arcPreservationScore,
    transitionArcSafety,
    continuityReasoning: Object.freeze(continuityReasoning),
  };
}

function deriveNarrativeClassifications(input: {
  arc: NarrativeArcState;
  energyWave: NarrativeEnergyWave;
  fatigue: NarrativeFatigueModel;
  momentum: NarrativeMomentumState;
  continuity: NarrativeContinuityAssessment;
  cadence: NarrativeCadenceProfile;
  recovery: NarrativeRecoveryProfile;
}): NarrativeClassification[] {
  const labels: NarrativeClassification[] = [];
  if (input.arc.arcStability >= 68 && input.energyWave.waveStability >= 65) labels.push("stable_arc");
  if (input.energyWave.hypeAccumulation >= 65 || input.arc.flowState === "peak") labels.push("escalating_hype");
  if (input.fatigue.fatiguePressure >= 58) labels.push("fatigue_risk");
  if (input.energyWave.abruptPacingRisk >= 55 || input.fatigue.pacingImbalance >= 60) labels.push("pacing_unstable");
  if (input.cadence.cooldownOpportunity >= 62 && input.fatigue.cooldownScarcity >= 55) labels.push("cooldown_needed");
  if (input.recovery.narrativeDamageScore >= 45 || input.momentum.narrativeRecoveryNeed >= 58) labels.push("recovery_sensitive");
  if (input.momentum.momentumStability < 52) labels.push("momentum_fragile");
  if (input.energyWave.fatiguePressure >= 65 && input.arc.sustainedHypePressure >= 60) labels.push("tension_overload");
  if (input.continuity.arcPreservationScore >= 62) labels.push("continuity_preserved");
  if (input.continuity.transitionArcSafety < 45 || input.continuity.arcPreservationScore < 42) labels.push("narrative_fractured");
  if (input.continuity.emotionalContinuity >= 65 && input.energyWave.narrativeSmoothness >= 60) labels.push("emotionally_stable");
  return [...new Set(labels)];
}

function evaluateNarrativeRiskProfile(input: {
  energyWave: NarrativeEnergyWave;
  fatigue: NarrativeFatigueModel;
  momentum: NarrativeMomentumState;
  continuity: NarrativeContinuityAssessment;
}): NarrativeRiskProfile {
  const pacingRisk = round(clamp(input.energyWave.abruptPacingRisk * 0.55 + input.fatigue.pacingImbalance * 0.45));
  const fatigueRisk = input.fatigue.fatiguePressure;
  const momentumRisk = round(clamp(100 - input.momentum.momentumStability + input.momentum.narrativeRecoveryNeed * 0.35));
  const narrativeRiskScore = round(
    clamp(
      pacingRisk * 0.32 +
        fatigueRisk * 0.28 +
        momentumRisk * 0.2 +
        (100 - input.continuity.transitionArcSafety) * 0.2,
    ),
  );
  const riskClassification: NarrativeRiskProfile["riskClassification"] =
    narrativeRiskScore >= 72 ? "critical" : narrativeRiskScore >= 52 ? "high" : narrativeRiskScore >= 32 ? "moderate" : "low";
  return {
    narrativeRiskScore,
    riskClassification,
    pacingRisk,
    fatigueRisk,
    momentumRisk,
    riskReasoning: Object.freeze([
      `Narrative risk ${narrativeRiskScore.toFixed(2)} (${riskClassification}) from pacing, fatigue, and momentum proxies.`,
    ]),
  };
}

export function evaluateRuntimeNarrativeOrchestration(input: {
  signals: RuntimeNarrativeSignalContext;
  recoverySnapshot?: RuntimeRecoverySnapshot;
  calibrationSnapshot?: ConfidenceCalibrationSnapshot;
  timestamp?: number;
}): NarrativeOrchestrationRecommendation {
  void input.calibrationSnapshot;
  const tensionCurve = buildNarrativeTensionCurve(input.signals);
  const cadence = buildNarrativeCadenceProfile(input.signals);
  const energyWave = evaluateNarrativeEnergyWave({ signals: input.signals, tensionCurve });
  const fatigue = buildNarrativeFatigueModel(input.signals, tensionCurve);
  const momentum = buildNarrativeMomentumState(input.signals, fatigue);
  const arc = buildNarrativeArcState(input.signals, energyWave, cadence);
  const continuity = evaluateNarrativeContinuityAssessment({ signals: input.signals, energyWave, arc });
  const recovery = evaluateNarrativeRecoveryProfile({
    signals: input.signals,
    recoverySnapshot: input.recoverySnapshot,
    continuity,
  });
  const risk = evaluateNarrativeRiskProfile({ energyWave, fatigue, momentum, continuity });
  const narrativeStability = round(
    clamp(
      arc.arcStability * 0.3 +
        energyWave.waveStability * 0.28 +
        continuity.arcPreservationScore * 0.22 +
        momentum.momentumStability * 0.12 +
        (100 - risk.narrativeRiskScore) * 0.08,
    ),
  );
  const cooldownPressure = round(
    clamp(
      fatigue.cooldownScarcity * 0.45 +
        cadence.escalationPressure * 0.3 +
        (cadence.cooldownOpportunity < 50 ? 18 : 0),
    ),
  );
  const classifications = deriveNarrativeClassifications({
    arc,
    energyWave,
    fatigue,
    momentum,
    continuity,
    cadence,
    recovery,
  });
  const orchestrationReasoning: string[] = [
    ...arc.arcReasoning,
    ...energyWave.narrativeReasoning,
    ...continuity.continuityReasoning,
    ...recovery.recoveryReasoning,
    `Narrative stability ${narrativeStability.toFixed(2)} | fatigue ${fatigue.fatiguePressure.toFixed(2)} | pacing continuity ${energyWave.pacingContinuity.toFixed(2)}.`,
  ];
  return {
    arc,
    energyWave,
    tensionCurve,
    cadence,
    fatigue,
    momentum,
    recovery,
    continuity,
    risk,
    narrativeStability,
    cooldownPressure,
    classifications: Object.freeze(classifications),
    orchestrationReasoning: Object.freeze(orchestrationReasoning),
  };
}

export function analyzeNarrativeDrift(input: {
  predicted: {
    narrativeStability: number;
    pacingContinuity: number;
    fatiguePressure: number;
    recoveryContinuity: number;
  };
  actual: {
    narrativeStability: number;
    pacingContinuity: number;
    fatiguePressure: number;
    recoveryContinuity: number;
  };
}): NarrativeDriftDiagnostics {
  const narrativeStabilityDrift = absoluteDrift(input.predicted.narrativeStability, input.actual.narrativeStability);
  const pacingPredictionAccuracy = round(clamp(100 - absoluteDrift(input.predicted.pacingContinuity, input.actual.pacingContinuity)));
  const fatigueMisprediction = absoluteDrift(input.predicted.fatiguePressure, input.actual.fatiguePressure);
  const recoveryContinuityPreservation = round(
    clamp(
      100 -
        absoluteDrift(input.predicted.recoveryContinuity, input.actual.recoveryContinuity) * 0.65 -
        fatigueMisprediction * 0.35,
    ),
  );
  return {
    narrativeStabilityDrift,
    pacingPredictionAccuracy,
    fatigueMisprediction,
    recoveryContinuityPreservation,
    driftReasoning: Object.freeze([
      `Narrative stability drift ${narrativeStabilityDrift.toFixed(2)}.`,
      pacingPredictionAccuracy >= 70
        ? "Pacing continuity prediction aligned with observed narrative pacing."
        : "Pacing continuity misprediction detected across replay window.",
      fatigueMisprediction >= 28
        ? "Fatigue pressure misprediction elevated; arc pacing review recommended."
        : "Fatigue misprediction within acceptable deterministic bounds.",
    ]),
  };
}

export type NarrativeDriftPoint = {
  narrativeStability: number;
  pacingContinuity: number;
  fatiguePressure: number;
  recoveryContinuity: number;
};

export function buildRuntimeNarrativeSnapshot(input: {
  signals: RuntimeNarrativeSignalContext;
  recoverySnapshot?: RuntimeRecoverySnapshot;
  calibrationSnapshot?: ConfidenceCalibrationSnapshot;
  predictedDrift?: NarrativeDriftPoint;
  actualDrift?: NarrativeDriftPoint;
  timestamp?: number;
}): RuntimeNarrativeSnapshot {
  const recommendation = evaluateRuntimeNarrativeOrchestration({
    signals: input.signals,
    recoverySnapshot: input.recoverySnapshot,
    calibrationSnapshot: input.calibrationSnapshot,
    timestamp: input.timestamp,
  });
  const driftDiagnostics =
    input.predictedDrift && input.actualDrift
      ? analyzeNarrativeDrift({ predicted: input.predictedDrift, actual: input.actualDrift })
      : undefined;
  return {
    timestamp: input.timestamp ?? Date.now(),
    recommendation,
    driftDiagnostics,
  };
}
