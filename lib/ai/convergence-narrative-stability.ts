import "server-only";

import type { SimulationInstabilitySignals } from "@/lib/ai/adaptive-orchestration";
import type { OrchestrationConvergenceMetrics } from "@/lib/ai/orchestration-convergence";
import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { TransitionSimulationResult } from "@/lib/ai/transition-simulation";

export type ForecastSeverity = "stable" | "degrading" | "divergent";

export type PhraseLockState = "stable" | "drifting" | "fractured";

export type RecoveryChainStep = "phrase_lock" | "phrase_recovery" | "convergence_recovery" | "hold_state";

export interface StabilityAdvisory {
  aggressionDecayBoost: number;
  preferContinuityWeight: boolean;
  preferWidenWindow: boolean;
  preferRecoveryBlend: boolean;
  preferHoldState: boolean;
  preferPhraseHold: boolean;
  reasoning: string[];
}

export interface ConvergenceNarrativeStabilitySnapshot {
  forecastSeverity: ForecastSeverity;
  advisoryConvergenceTrajectory: number;
  advisoryNarrativeTrajectory: number;
  advisoryCadenceTrajectory: number;
  divergenceProbability: number;
  phraseLockConfidence: number;
  phraseLockState: PhraseLockState;
  transitionShock: {
    energy: number;
    narrative: number;
    cadence: number;
    aggregate: number;
  };
  rankedStabilizationActions: Array<{
    action: string;
    severity: number;
    reason: string;
  }>;
  recoveryChainPriority: RecoveryChainStep[];
  stabilityAdvisory: StabilityAdvisory;
  summary: string;
}

const MAX_AGGRESSION_DECAY_BOOST = 0.08;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(clamp(value, 0, 100).toFixed(2));
}

function computeAverage(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mapPhraseLockState(confidence: number): PhraseLockState {
  if (confidence >= 80) return "stable";
  if (confidence >= 60) return "drifting";
  return "fractured";
}

function computeAdvisoryNarrativeTrajectory(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
}): number {
  const simStructural = computeAverage(
    params.simulation.timeline.steps.map((step) => step.structuralContinuityProjection),
  );
  const convergenceNarrative = params.convergenceMetrics?.narrativeContinuity;
  return round(
    params.evaluation.narrativeContinuity * 0.42 +
      params.evaluation.emotionalContinuity * 0.18 +
      simStructural * 0.2 +
      (convergenceNarrative ?? params.evaluation.narrativeContinuity) * 0.2,
  );
}

function computeAdvisoryCadenceTrajectory(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
}): number {
  const phraseSurvivability =
    params.convergenceMetrics?.phraseTimingSurvivability ??
    clamp(100 - params.evaluation.phraseTimingRisk, 0, 100);
  const simPhraseWindow = computeAverage(
    params.simulation.timeline.steps.map((step) => step.transitionWindowConfidence),
  );
  return round(
    params.evaluation.cadenceStability * 0.38 +
      params.evaluation.phraseStability * 0.22 +
      phraseSurvivability * 0.22 +
      simPhraseWindow * 0.18,
  );
}

function computeAdvisoryConvergenceTrajectory(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
}): number {
  const canonicalConvergence = params.convergenceMetrics?.convergenceScore;
  const synthesis = params.convergenceMetrics?.synthesisConfidence ?? params.evaluation.orchestrationSynthesisConfidence;
  const simStability = computeAverage(params.simulation.timeline.projectedExecutionStability);
  const failurePenalty = (params.convergenceMetrics?.convergenceFailures.length ?? 0) * 6;
  const base =
    canonicalConvergence != null
      ? canonicalConvergence * 0.55 + synthesis * 0.25 + simStability * 0.2 - failurePenalty
      : synthesis * 0.4 + simStability * 0.35 + params.evaluation.orchestrationStability * 0.25 - failurePenalty;
  return round(base);
}

function computePhraseLockConfidence(params: {
  evaluation: TransitionEvaluationResult;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
}): number {
  const phraseAlignment = params.evaluation.transitionDiagnostics.phraseAlignmentScore;
  const phraseSurvivability =
    params.convergenceMetrics?.phraseTimingSurvivability ??
    clamp(
      params.evaluation.phraseAlignmentConfidence * 0.45 +
        (100 - params.evaluation.phraseTimingRisk) * 0.35 +
        params.evaluation.phraseStability * 0.2,
      0,
      100,
    );
  return round(
    phraseAlignment * 0.34 +
      phraseSurvivability * 0.36 +
      params.evaluation.cadenceStability * 0.2 +
      params.evaluation.phraseStability * 0.1,
  );
}

function computeTransitionShock(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  advisoryNarrativeTrajectory: number;
  advisoryCadenceTrajectory: number;
  advisoryConvergenceTrajectory: number;
}): ConvergenceNarrativeStabilitySnapshot["transitionShock"] {
  const steps = params.simulation.timeline.steps;
  const energyCurve = steps.map((step) => step.projectedEnergy);
  const energyDeltas = energyCurve.slice(1).map((value, index) => Math.abs(value - (energyCurve[index] ?? value)));
  const energyShock = round(
    computeAverage(energyDeltas) * 14 +
      Math.max(0, params.evaluation.narrativeTension - 55) * 0.35 +
      Math.max(0, params.evaluation.cadenceEscalationPressure - 60) * 0.25,
  );

  const narrativeBaseline = params.evaluation.narrativeContinuity;
  const narrativeDrop = Math.max(0, narrativeBaseline - params.advisoryNarrativeTrajectory);
  const narrativeShock = round(
    narrativeDrop * 0.55 +
      Math.max(0, params.evaluation.narrativeRecoveryPressure - 50) * 0.25 +
      Math.max(0, 62 - params.advisoryNarrativeTrajectory) * 0.35,
  );

  const cadenceDrop = Math.max(0, params.evaluation.cadenceStability - params.advisoryCadenceTrajectory);
  const cadenceShock = round(
    cadenceDrop * 0.5 +
      Math.max(0, params.evaluation.phraseTimingRisk - 55) * 0.3 +
      Math.max(0, 60 - params.advisoryCadenceTrajectory) * 0.35,
  );

  const convergenceDrop = Math.max(0, 72 - params.advisoryConvergenceTrajectory);
  const convergenceShock = round(convergenceDrop * 0.65);

  const aggregate = round(
    energyShock * 0.22 + narrativeShock * 0.3 + cadenceShock * 0.28 + convergenceShock * 0.2,
  );

  return { energy: energyShock, narrative: narrativeShock, cadence: cadenceShock, aggregate };
}

function computeDivergenceProbability(params: {
  instability: SimulationInstabilitySignals;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
  advisoryNarrativeTrajectory: number;
  advisoryCadenceTrajectory: number;
  advisoryConvergenceTrajectory: number;
  transitionShock: ConvergenceNarrativeStabilitySnapshot["transitionShock"];
}): number {
  const failureWeight = (params.convergenceMetrics?.convergenceFailures.length ?? 0) * 9;
  const signalWeight = params.instability.signals.length * 7;
  const narrativeCollapse = Math.max(0, 58 - params.advisoryNarrativeTrajectory) * 0.55;
  const cadenceCollapse = Math.max(0, 55 - params.advisoryCadenceTrajectory) * 0.5;
  const convergenceCollapse = Math.max(0, 68 - params.advisoryConvergenceTrajectory) * 0.65;
  const divergentFlag = params.convergenceMetrics?.convergenceSeverity === "divergent" ? 18 : 0;
  return round(
    failureWeight +
      signalWeight +
      narrativeCollapse +
      cadenceCollapse +
      convergenceCollapse +
      params.transitionShock.aggregate * 0.35 +
      divergentFlag +
      (params.instability.refinementRequired ? 8 : 0),
  );
}

function resolveForecastSeverity(params: {
  divergenceProbability: number;
  advisoryConvergenceTrajectory: number;
  phraseLockState: PhraseLockState;
}): ForecastSeverity {
  if (
    params.divergenceProbability >= 62 ||
    params.advisoryConvergenceTrajectory < 52 ||
    params.phraseLockState === "fractured"
  ) {
    return "divergent";
  }
  if (params.divergenceProbability >= 34 || params.advisoryConvergenceTrajectory < 68 || params.phraseLockState === "drifting") {
    return "degrading";
  }
  return "stable";
}

function buildStabilityAdvisory(severity: ForecastSeverity, shock: ConvergenceNarrativeStabilitySnapshot["transitionShock"]): StabilityAdvisory {
  const reasoning: string[] = [];
  let aggressionDecayBoost = 0;
  let preferContinuityWeight = false;
  let preferWidenWindow = false;
  let preferRecoveryBlend = false;
  let preferHoldState = false;
  let preferPhraseHold = false;

  if (severity === "degrading") {
    aggressionDecayBoost = 0.04;
    preferContinuityWeight = true;
    preferWidenWindow = shock.cadence >= 40;
    preferRecoveryBlend = shock.aggregate >= 35;
    preferPhraseHold = shock.cadence >= 32;
    reasoning.push("Degrading narrative/cadence forecast — bounded continuity preservation advised.");
  }

  if (severity === "divergent") {
    aggressionDecayBoost = MAX_AGGRESSION_DECAY_BOOST;
    preferContinuityWeight = true;
    preferWidenWindow = true;
    preferRecoveryBlend = true;
    preferHoldState = true;
    preferPhraseHold = true;
    reasoning.push("Divergent convergence forecast — hold-state and phrase-lock stabilization advised.");
  }

  if (shock.energy >= 45) {
    preferRecoveryBlend = true;
    reasoning.push("Elevated energy shock — recovery blend weighting advised.");
  }

  if (shock.narrative >= 42) {
    preferContinuityWeight = true;
    reasoning.push("Narrative shock detected — narrative continuity weighting advised.");
  }

  return {
    aggressionDecayBoost: Number(clamp(aggressionDecayBoost, 0, MAX_AGGRESSION_DECAY_BOOST).toFixed(3)),
    preferContinuityWeight,
    preferWidenWindow,
    preferRecoveryBlend,
    preferHoldState,
    preferPhraseHold,
    reasoning,
  };
}

function buildRankedStabilizationActions(params: {
  severity: ForecastSeverity;
  shock: ConvergenceNarrativeStabilitySnapshot["transitionShock"];
  phraseLockState: PhraseLockState;
  instability: SimulationInstabilitySignals;
}): ConvergenceNarrativeStabilitySnapshot["rankedStabilizationActions"] {
  const actions: ConvergenceNarrativeStabilitySnapshot["rankedStabilizationActions"] = [];

  if (params.instability.fastCutInstability) {
    actions.push({
      action: "reduce_fast_cut_aggression",
      severity: 88,
      reason: "Repeated fast-cut instability in simulation horizon.",
    });
  }
  if (params.shock.narrative >= 40) {
    actions.push({
      action: "preserve_narrative_continuity",
      severity: round(params.shock.narrative),
      reason: "Projected narrative continuity deterioration exceeds safe pacing envelope.",
    });
  }
  if (params.shock.cadence >= 38) {
    actions.push({
      action: "stabilize_cadence_window",
      severity: round(params.shock.cadence),
      reason: "Cadence shock threatens phrase-boundary integrity.",
    });
  }
  if (params.phraseLockState !== "stable") {
    actions.push({
      action: "phrase_lock_recovery",
      severity: params.phraseLockState === "fractured" ? 86 : 68,
      reason: `Phrase lock state ${params.phraseLockState} — defer aggressive transitions.`,
    });
  }
  if (params.severity === "divergent") {
    actions.push({
      action: "hold_state_fallback",
      severity: 82,
      reason: "Global convergence divergence probability elevated.",
    });
  }
  if (params.shock.aggregate >= 50) {
    actions.push({
      action: "recovery_blend_priority",
      severity: round(params.shock.aggregate),
      reason: "Aggregate transition shock warrants supervised recovery blend.",
    });
  }

  return actions.sort((a, b) => b.severity - a.severity).slice(0, 8);
}

function buildRecoveryChainPriority(severity: ForecastSeverity, phraseLockState: PhraseLockState): RecoveryChainStep[] {
  if (severity === "divergent" || phraseLockState === "fractured") {
    return ["phrase_lock", "phrase_recovery", "convergence_recovery", "hold_state"];
  }
  if (severity === "degrading" || phraseLockState === "drifting") {
    return ["phrase_lock", "phrase_recovery", "convergence_recovery", "hold_state"];
  }
  return ["phrase_recovery", "convergence_recovery", "phrase_lock", "hold_state"];
}

function buildSummary(params: {
  severity: ForecastSeverity;
  divergenceProbability: number;
  phraseLockState: PhraseLockState;
  shock: ConvergenceNarrativeStabilitySnapshot["transitionShock"];
}): string {
  if (params.severity === "stable") {
    return "Narrative, cadence, and convergence trajectories remain within advisory stability envelope.";
  }
  const lead =
    params.phraseLockState === "fractured"
      ? "phrase lock fractured"
      : params.shock.narrative >= params.shock.cadence
        ? "narrative continuity shock"
        : "cadence instability shock";
  return `Advisory forecast ${params.severity} (divergence ${params.divergenceProbability.toFixed(0)}%) — primary driver: ${lead}.`;
}

export function analyzeConvergenceNarrativeStability(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  instability: SimulationInstabilitySignals;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
}): ConvergenceNarrativeStabilitySnapshot {
  const advisoryNarrativeTrajectory = computeAdvisoryNarrativeTrajectory(params);
  const advisoryCadenceTrajectory = computeAdvisoryCadenceTrajectory(params);
  const advisoryConvergenceTrajectory = computeAdvisoryConvergenceTrajectory(params);
  const phraseLockConfidence = computePhraseLockConfidence(params);
  const phraseLockState = mapPhraseLockState(phraseLockConfidence);
  const transitionShock = computeTransitionShock({
    evaluation: params.evaluation,
    simulation: params.simulation,
    advisoryNarrativeTrajectory,
    advisoryCadenceTrajectory,
    advisoryConvergenceTrajectory,
  });
  const divergenceProbability = computeDivergenceProbability({
    instability: params.instability,
    convergenceMetrics: params.convergenceMetrics,
    advisoryNarrativeTrajectory,
    advisoryCadenceTrajectory,
    advisoryConvergenceTrajectory,
    transitionShock,
  });
  const forecastSeverity = resolveForecastSeverity({
    divergenceProbability,
    advisoryConvergenceTrajectory,
    phraseLockState,
  });
  const stabilityAdvisory = buildStabilityAdvisory(forecastSeverity, transitionShock);
  const recoveryChainPriority = buildRecoveryChainPriority(forecastSeverity, phraseLockState);
  const rankedStabilizationActions = buildRankedStabilizationActions({
    severity: forecastSeverity,
    shock: transitionShock,
    phraseLockState,
    instability: params.instability,
  });

  return {
    forecastSeverity,
    advisoryConvergenceTrajectory,
    advisoryNarrativeTrajectory,
    advisoryCadenceTrajectory,
    divergenceProbability,
    phraseLockConfidence,
    phraseLockState,
    transitionShock,
    rankedStabilizationActions,
    recoveryChainPriority,
    stabilityAdvisory,
    summary: buildSummary({ severity: forecastSeverity, divergenceProbability, phraseLockState, shock: transitionShock }),
  };
}

export function resolveRecoverySeedFromAdvisory(params: {
  rankedCandidates: Array<{ id: string; strategy: string; rejected: boolean }>;
  selectedCandidate: { id: string; strategy: string; rejected: boolean };
  recoveryChainPriority: RecoveryChainStep[];
}): string | null {
  for (const step of params.recoveryChainPriority) {
    if (step === "hold_state") {
      const hold = params.rankedCandidates.find((c) => !c.rejected && c.strategy === "hold_state");
      if (hold) return hold.id;
    }
    if (step === "convergence_recovery" || step === "phrase_recovery") {
      const blend = params.rankedCandidates.find(
        (c) => !c.rejected && (c.strategy === "recovery_blend" || c.strategy === "smooth_blend"),
      );
      if (blend) return blend.id;
    }
  }
  return null;
}
