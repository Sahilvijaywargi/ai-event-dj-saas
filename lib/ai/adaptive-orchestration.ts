import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { TransitionSimulationResult } from "@/lib/ai/transition-simulation";
import type { ExecutionRuntimeState, TransportRuntimeState } from "@/lib/transition-orchestration/layer-state";

export type AdaptiveOrchestrationStrategy =
  | "fast_cut"
  | "smooth_blend"
  | "hold_state"
  | "energy_ramp"
  | "recovery_blend";

export type AdaptiveExecutionWindow = "narrow_window" | "balanced_window" | "wide_window";

export type AdaptiveOrchestrationCandidate = {
  id: string;
  strategy: AdaptiveOrchestrationStrategy;
  executionWindow: AdaptiveExecutionWindow;
  aggression: number;
  continuityWeight: number;
  rollbackPriority: number;
  confidence: number;
  predictedRisk: number;
  executionStability: number;
  recoveryPressure: number;
  orchestrationScore: number;
  convergenceScore?: number;
  phraseSurvivability?: number;
  globallyDivergent?: boolean;
  convergenceFailures?: string[];
  rejected: boolean;
  rejectionReasons: string[];
  reasoning: string[];
};

export type SimulationInstabilitySignals = {
  fastCutInstability: boolean;
  projectedRiskShiftHigh: boolean;
  executionStabilityLow: boolean;
  rollbackReadinessLow: boolean;
  phraseMisalignment: boolean;
  transportUnstable: boolean;
  crowdMomentumFavorable: boolean;
  refinementRequired: boolean;
  signals: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mapEvaluationStrategyToAdaptive(
  strategy: TransitionEvaluationResult["executionStrategy"],
): AdaptiveOrchestrationStrategy {
  if (strategy === "fast_cut" || strategy === "percussive_swap") return "fast_cut";
  if (strategy === "hold_state") return "hold_state";
  if (strategy === "energy_ramp_blend") return "energy_ramp";
  return "smooth_blend";
}

export function mapEvaluationWindowToAdaptive(
  window: TransitionEvaluationResult["executionWindowState"],
): AdaptiveExecutionWindow {
  if (window === "stable_window") return "wide_window";
  if (window === "narrow_window") return "narrow_window";
  return "balanced_window";
}

export function widenExecutionWindow(window: AdaptiveExecutionWindow): AdaptiveExecutionWindow {
  if (window === "narrow_window") return "balanced_window";
  if (window === "balanced_window") return "wide_window";
  return "wide_window";
}

export function detectSimulationInstability(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  transportRuntime?: TransportRuntimeState | null;
}): SimulationInstabilitySignals {
  const steps = params.simulation.timeline.steps;
  const fastCutCount = steps.filter((step) => step.executionStrategy === "fast_cut").length;
  const avgStability = computeAverage(params.simulation.timeline.projectedExecutionStability);
  const projectedRiskShift = params.simulation.riskForecast.escalationProbability;
  const phraseAlignment = params.evaluation.transitionDiagnostics.phraseAlignmentScore;
  const rollbackReadiness = params.evaluation.rollbackReadiness;
  const transportStability =
    params.transportRuntime?.transportStability ?? params.evaluation.transportStability;
  const crowdMomentum = params.evaluation.crowdMomentumScore;
  const crowdVolatility = params.evaluation.crowdEnergyVolatility;

  const fastCutInstability = fastCutCount >= 2;
  const projectedRiskShiftHigh = projectedRiskShift > 85;
  const executionStabilityLow = avgStability < 60;
  const rollbackReadinessLow = rollbackReadiness < 40;
  const phraseMisalignment = phraseAlignment < 40;
  const transportUnstable = transportStability < 75;
  const crowdMomentumFavorable = crowdMomentum > 75 && crowdVolatility < 25;

  const signals: string[] = [];
  if (fastCutInstability) signals.push("repeated_fast_cut_instability");
  if (projectedRiskShiftHigh) signals.push("projected_risk_shift_high");
  if (executionStabilityLow) signals.push("execution_stability_low");
  if (rollbackReadinessLow) signals.push("rollback_readiness_low");
  if (phraseMisalignment) signals.push("phrase_misalignment");
  if (transportUnstable) signals.push("transport_instability");

  const refinementRequired =
    fastCutInstability ||
    projectedRiskShiftHigh ||
    executionStabilityLow ||
    rollbackReadinessLow ||
    phraseMisalignment ||
    transportUnstable ||
    params.simulation.confidenceForecast.confidenceDrift <= -12;

  if (refinementRequired) {
    console.log("[ADAPTIVE] instability detected", { signals });
  }

  return {
    fastCutInstability,
    projectedRiskShiftHigh,
    executionStabilityLow,
    rollbackReadinessLow,
    phraseMisalignment,
    transportUnstable,
    crowdMomentumFavorable,
    refinementRequired,
    signals,
  };
}

export type AdaptationDirective = {
  reduceAggression: boolean;
  aggressionDecay: number;
  increaseContinuityWeight: boolean;
  widenWindow: boolean;
  increaseRollbackPriority: boolean;
  downgradeExecutionPressure: boolean;
  rejectAggressiveStrategies: boolean;
  rejectNarrowWindow: boolean;
  allowModerateAggressionRecovery: boolean;
  generateSmoothBlend: boolean;
  generateRecoveryBlend: boolean;
  generateHoldState: boolean;
  generateEnergyRamp: boolean;
  warnings: string[];
};

export function buildAdaptationDirectives(
  instability: SimulationInstabilitySignals,
): AdaptationDirective {
  const warnings: string[] = [];
  let aggressionDecay = 0;
  let reduceAggression = false;
  let increaseContinuityWeight = false;
  let widenWindow = false;
  let increaseRollbackPriority = false;
  let downgradeExecutionPressure = false;
  let rejectAggressiveStrategies = false;
  let rejectNarrowWindow = false;
  let allowModerateAggressionRecovery = false;
  let generateSmoothBlend = false;
  let generateRecoveryBlend = false;
  let generateHoldState = false;
  let generateEnergyRamp = false;

  if (
    instability.fastCutInstability ||
    instability.projectedRiskShiftHigh ||
    instability.executionStabilityLow
  ) {
    reduceAggression = true;
    aggressionDecay = 0.2;
    increaseContinuityWeight = true;
    widenWindow = true;
    generateSmoothBlend = true;
    generateRecoveryBlend = true;
    warnings.push("Fast-cut instability forced continuity-preserving fallback.");
  }

  if (instability.rollbackReadinessLow) {
    increaseRollbackPriority = true;
    widenWindow = true;
    downgradeExecutionPressure = true;
    generateHoldState = true;
    warnings.push("Execution window widened after rollback survivability degradation.");
  }

  if (instability.phraseMisalignment) {
    generateSmoothBlend = true;
    reduceAggression = true;
    aggressionDecay = Math.max(aggressionDecay, 0.12);
    warnings.push("Phrase misalignment reduced fast-cut viability and boosted smooth blend weighting.");
  }

  if (instability.transportUnstable) {
    rejectAggressiveStrategies = true;
    rejectNarrowWindow = true;
    increaseContinuityWeight = true;
    generateHoldState = true;
    warnings.push("Transport instability rejected aggressive strategies and narrow windows.");
  }

  if (instability.crowdMomentumFavorable && !instability.transportUnstable) {
    allowModerateAggressionRecovery = true;
    generateEnergyRamp = true;
  }

  if (!generateSmoothBlend && instability.refinementRequired) {
    generateSmoothBlend = true;
  }
  if (!generateHoldState && instability.refinementRequired) {
    generateHoldState = true;
  }

  return {
    reduceAggression,
    aggressionDecay,
    increaseContinuityWeight,
    widenWindow,
    increaseRollbackPriority,
    downgradeExecutionPressure,
    rejectAggressiveStrategies,
    rejectNarrowWindow,
    allowModerateAggressionRecovery,
    generateSmoothBlend,
    generateRecoveryBlend,
    generateHoldState,
    generateEnergyRamp,
    warnings,
  };
}

export function buildAdaptationContext(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  transportRuntime?: TransportRuntimeState | null;
  executionRuntime?: ExecutionRuntimeState | null;
}) {
  const instability = detectSimulationInstability({
    evaluation: params.evaluation,
    simulation: params.simulation,
    transportRuntime: params.transportRuntime,
  });
  const directives = buildAdaptationDirectives(instability);
  return { instability, directives };
}

function computeAverage(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
