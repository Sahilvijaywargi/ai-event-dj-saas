import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { TransitionSimulationResult } from "@/lib/ai/transition-simulation";
import {
  type AdaptationDirective,
  type AdaptiveExecutionWindow,
  type AdaptiveOrchestrationCandidate,
  type AdaptiveOrchestrationStrategy,
  type SimulationInstabilitySignals,
  mapEvaluationStrategyToAdaptive,
  mapEvaluationWindowToAdaptive,
  widenExecutionWindow,
} from "@/lib/ai/adaptive-orchestration";
import type { PhraseWindowAnalysis } from "@/lib/ai/phrase-window-engine";
import type { AudioIntelligenceResult } from "@/lib/ai/audio-intelligence-engine";

export type CandidateSimulationProjection = {
  predictedTransitionSuccess: number;
  predictedRecoveryPressure: number;
  projectedExecutionStability: number;
  projectedConfidenceDrift: number;
  rollbackSurvivability: number;
  cadenceContinuity: number;
  narrativeStability: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeAverage(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function strategyAggression(strategy: AdaptiveOrchestrationStrategy) {
  if (strategy === "fast_cut") return 82;
  if (strategy === "energy_ramp") return 68;
  if (strategy === "smooth_blend") return 48;
  if (strategy === "recovery_blend") return 36;
  return 22;
}

function windowStabilityBonus(window: AdaptiveExecutionWindow) {
  if (window === "wide_window") return 10;
  if (window === "balanced_window") return 5;
  return -6;
}

export function simulateCandidateExecution(params: {
  candidate: Omit<AdaptiveOrchestrationCandidate, "orchestrationScore" | "rejected" | "rejectionReasons">;
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  instability: SimulationInstabilitySignals;
}): CandidateSimulationProjection {
  const baselineStability = computeAverage(params.simulation.timeline.projectedExecutionStability);
  const strategyBase = strategyAggression(params.candidate.strategy);
  const aggressionPenalty = params.candidate.aggression * 0.22;
  const continuityBoost = params.candidate.continuityWeight * 0.18;
  const rollbackBoost = params.candidate.rollbackPriority * 0.14;
  const windowBoost = windowStabilityBonus(params.candidate.executionWindow);

  let projectedExecutionStability = clamp(
    baselineStability * 0.35 +
      (100 - aggressionPenalty) * 0.25 +
      continuityBoost +
      rollbackBoost +
      windowBoost,
    0,
    100,
  );

  if (params.instability.fastCutInstability && params.candidate.strategy === "fast_cut") {
    projectedExecutionStability -= 18;
  }
  if (params.instability.transportUnstable && params.candidate.strategy === "fast_cut") {
    projectedExecutionStability -= 22;
  }
  if (params.candidate.strategy === "recovery_blend" && params.instability.rollbackReadinessLow) {
    projectedExecutionStability += 8;
  }
  if (params.candidate.strategy === "smooth_blend") {
    projectedExecutionStability += params.instability.fastCutInstability ? 10 : 4;
  }

  const predictedTransitionSuccess = clamp(
    projectedExecutionStability * 0.42 +
      params.evaluation.transitionDiagnostics.compatibilityScore * 0.28 +
      params.candidate.confidence * 0.2 +
      params.evaluation.transitionDiagnostics.phraseAlignmentScore * 0.1,
    0,
    100,
  );

  const predictedRecoveryPressure = clamp(
    params.candidate.recoveryPressure * 0.55 +
      (100 - projectedExecutionStability) * 0.25 +
      params.simulation.riskForecast.escalationProbability * 0.2,
    0,
    100,
  );

  const projectedConfidenceDrift = clamp(
    params.simulation.confidenceForecast.confidenceDrift * 0.6 +
      (params.candidate.confidence - params.evaluation.confidence.score) * 0.08 -
      params.candidate.aggression * 0.05,
    -30,
    20,
  );

  const rollbackSurvivability = clamp(
    params.evaluation.rollbackReadiness * 0.45 +
      params.candidate.rollbackPriority * 0.35 +
      projectedExecutionStability * 0.2,
    0,
    100,
  );

  const cadenceContinuity = clamp(
    params.evaluation.cadenceStability * 0.4 +
      params.candidate.continuityWeight * 0.35 +
      (params.candidate.executionWindow === "wide_window" ? 14 : 6),
    0,
    100,
  );

  const narrativeStability = clamp(
    params.evaluation.narrativeContinuity * 0.5 +
      params.evaluation.emotionalContinuity * 0.25 +
      continuityBoost,
    0,
    100,
  );

  return {
    predictedTransitionSuccess: Number(predictedTransitionSuccess.toFixed(2)),
    predictedRecoveryPressure: Number(predictedRecoveryPressure.toFixed(2)),
    projectedExecutionStability: Number(projectedExecutionStability.toFixed(2)),
    projectedConfidenceDrift: Number(projectedConfidenceDrift.toFixed(2)),
    rollbackSurvivability: Number(rollbackSurvivability.toFixed(2)),
    cadenceContinuity: Number(cadenceContinuity.toFixed(2)),
    narrativeStability: Number(narrativeStability.toFixed(2)),
  };
}

export function computeOrchestrationCandidateScore(params: {
  candidate: AdaptiveOrchestrationCandidate;
  projection: CandidateSimulationProjection;
  instability: SimulationInstabilitySignals;
  baselineStrategy: AdaptiveOrchestrationStrategy;
  phraseWindow?: PhraseWindowAnalysis | null;
  convergenceScore?: number;
  synthesisConfidence?: number;
  audioIntelligence?: AudioIntelligenceResult | null;
}): number {
  const { candidate, projection, instability, baselineStrategy } = params;
  const phraseSurvivability =
    params.phraseWindow?.survivability ?? params.candidate.phraseSurvivability ?? 50;
  const cadenceRecoveryPotential = params.phraseWindow?.cadenceStability ?? projection.cadenceContinuity;
  const timingRepairProbability = clamp(
    (params.phraseWindow ? 100 - params.phraseWindow.timingRisk : 50) * 0.5 +
      (params.phraseWindow?.safeEntryWindow ? 18 : 0) +
      (candidate.strategy === "recovery_blend" ? 12 : 0),
    0,
    100,
  );
  const synthesisStabilization = params.synthesisConfidence ?? projection.narrativeStability;
  const phraseWindowSafety = clamp(
    (params.phraseWindow?.safeEntryWindow ? 22 : 0) +
      (params.phraseWindow?.safeExitWindow ? 18 : 0) -
      (params.phraseWindow?.timingDriftSeverity === "severe" ? 24 : 0),
    -30,
    40,
  );

  let score =
    (params.convergenceScore ?? candidate.convergenceScore ?? 0) * 0.28 +
    phraseSurvivability * 0.22 +
    cadenceRecoveryPotential * 0.18 +
    synthesisStabilization * 0.14 +
    projection.rollbackSurvivability * 0.1 +
    projection.projectedExecutionStability * 0.08;

  score += timingRepairProbability * 0.04 + phraseWindowSafety;

  if (candidate.rejected) return 0;

  if (params.phraseWindow && !params.phraseWindow.safeEntryWindow && candidate.strategy === "fast_cut") {
    score -= 22;
  }
  if (params.phraseWindow?.timingDriftSeverity === "severe") {
    score -= 16;
  }
  if (cadenceRecoveryPotential < 52) {
    score -= 14;
  }

  const audio = params.audioIntelligence;
  if (audio) {
    score += (audio.audioMixabilityScore - 50) * 0.12;
    score -= audio.audioTransitionRisk * 0.1;
    score += audio.grooveContinuity * 0.06;
    score += audio.vocal.transitionSafety * 0.05;
    score += audio.drop.survivability * 0.05;
    if (audio.vocal.hookCollisionRisk >= 65) score -= 18;
    if (audio.spectral.bassMaskingRisk >= 62) score -= 14;
    if (audio.drop.risk >= 68) score -= 12;
    if (audio.spectral.transientConflict >= 60) score -= 10;
    if (candidate.strategy === "recovery_blend" && audio.drop.survivability >= 58) score += 6;
  }

  if (instability.fastCutInstability && candidate.strategy === "fast_cut") {
    score -= 28;
  }
  if (candidate.strategy === baselineStrategy && instability.refinementRequired) {
    score -= 6;
  }
  if (projection.predictedRecoveryPressure > 72) {
    score -= (projection.predictedRecoveryPressure - 72) * 0.35;
  }
  if (projection.projectedConfidenceDrift < -10) {
    score -= Math.abs(projection.projectedConfidenceDrift) * 0.8;
  }
  if (candidate.strategy === "recovery_blend" && projection.projectedExecutionStability > 62) {
    score += 4;
  }

  return Number(clamp(score, 0, 100).toFixed(2));
}

function buildCandidateSkeleton(params: {
  id: string;
  strategy: AdaptiveOrchestrationStrategy;
  executionWindow: AdaptiveExecutionWindow;
  evaluation: TransitionEvaluationResult;
  directives: AdaptationDirective;
  label: string;
}): Omit<AdaptiveOrchestrationCandidate, "orchestrationScore" | "rejected" | "rejectionReasons"> {
  const baseAggression = params.evaluation.transitionAggressiveness;
  let aggression = strategyAggression(params.strategy) * 0.55 + baseAggression * 0.45;
  if (params.directives.reduceAggression) {
    aggression = aggression * (1 - params.directives.aggressionDecay);
  }
  if (params.directives.downgradeExecutionPressure) {
    aggression *= 0.88;
  }
  if (params.directives.allowModerateAggressionRecovery && params.strategy === "energy_ramp") {
    aggression = clamp(aggression + 8, 0, 72);
  }

  const continuityWeight = clamp(
    params.evaluation.cadenceStability * 0.4 +
      (params.directives.increaseContinuityWeight ? 22 : 12) +
      (params.strategy === "hold_state" || params.strategy === "recovery_blend" ? 18 : 8),
    0,
    100,
  );

  const rollbackPriority = clamp(
    params.evaluation.rollbackReadiness * 0.55 +
      (params.directives.increaseRollbackPriority ? 20 : 8) +
      (params.strategy === "hold_state" || params.strategy === "recovery_blend" ? 12 : 0),
    0,
    100,
  );

  const confidence = clamp(
    params.evaluation.confidence.score -
      aggression * 0.08 +
      continuityWeight * 0.06 +
      rollbackPriority * 0.04,
    0,
    100,
  );

  const predictedRisk = clamp(
    100 -
      confidence * 0.45 -
      continuityWeight * 0.2 -
      rollbackPriority * 0.15 +
      aggression * 0.18,
    0,
    100,
  );

  return {
    id: params.id,
    strategy: params.strategy,
    executionWindow: params.executionWindow,
    aggression: Number(aggression.toFixed(2)),
    continuityWeight: Number(continuityWeight.toFixed(2)),
    rollbackPriority: Number(rollbackPriority.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    predictedRisk: Number(predictedRisk.toFixed(2)),
    executionStability: 0,
    recoveryPressure: 0,
    reasoning: [params.label],
  };
}

export function generateOrchestrationCandidates(params: {
  evaluation: TransitionEvaluationResult;
  directives: AdaptationDirective;
  instability: SimulationInstabilitySignals;
}): AdaptiveOrchestrationCandidate[] {
  const baselineStrategy = mapEvaluationStrategyToAdaptive(params.evaluation.executionStrategy);
  let baselineWindow = mapEvaluationWindowToAdaptive(params.evaluation.executionWindowState);
  if (params.directives.widenWindow) {
    baselineWindow = widenExecutionWindow(baselineWindow);
  }

  const skeletons: Array<
    Omit<AdaptiveOrchestrationCandidate, "orchestrationScore" | "rejected" | "rejectionReasons">
  > = [
    buildCandidateSkeleton({
      id: "baseline",
      strategy: baselineStrategy,
      executionWindow: baselineWindow,
      evaluation: params.evaluation,
      directives: params.directives,
      label: "Baseline strategy preserved from current orchestration evaluation.",
    }),
    buildCandidateSkeleton({
      id: "smooth_blend_recovery",
      strategy: "smooth_blend",
      executionWindow: params.directives.widenWindow ? widenExecutionWindow(baselineWindow) : baselineWindow,
      evaluation: params.evaluation,
      directives: params.directives,
      label: "Smooth blend recovery candidate for continuity preservation.",
    }),
    buildCandidateSkeleton({
      id: "hold_state_safety",
      strategy: "hold_state",
      executionWindow: widenExecutionWindow(baselineWindow),
      evaluation: params.evaluation,
      directives: params.directives,
      label: "Hold-state safety candidate prioritizing rollback survivability.",
    }),
  ];

  if (params.directives.generateRecoveryBlend) {
    skeletons.push(
      buildCandidateSkeleton({
        id: "recovery_blend",
        strategy: "recovery_blend",
        executionWindow: widenExecutionWindow(baselineWindow),
        evaluation: params.evaluation,
        directives: params.directives,
        label: "Recovery blend candidate for supervised instability recovery.",
      }),
    );
  }

  if (params.directives.generateEnergyRamp) {
    skeletons.push(
      buildCandidateSkeleton({
        id: "energy_ramp",
        strategy: "energy_ramp",
        executionWindow: baselineWindow === "narrow_window" ? "balanced_window" : baselineWindow,
        evaluation: params.evaluation,
        directives: params.directives,
        label: "Energy ramp candidate for moderate aggression recovery under stable crowd momentum.",
      }),
    );
  }

  const unique = new Map<string, (typeof skeletons)[number]>();
  for (const skeleton of skeletons) {
    const key = `${skeleton.strategy}:${skeleton.executionWindow}`;
    if (!unique.has(key)) unique.set(key, skeleton);
  }

  return Array.from(unique.values()).map((skeleton) => {
    const rejectionReasons: string[] = [];
    if (params.directives.rejectAggressiveStrategies && skeleton.strategy === "fast_cut") {
      rejectionReasons.push("aggressive_strategy_blocked_by_transport_instability");
    }
    if (params.directives.rejectNarrowWindow && skeleton.executionWindow === "narrow_window") {
      rejectionReasons.push("narrow_window_rejected_under_transport_instability");
    }
    if (
      params.instability.fastCutInstability &&
      skeleton.strategy === "fast_cut" &&
      skeleton.id !== "baseline"
    ) {
      rejectionReasons.push("fast_cut_instability_loop");
    }

    const rejected = rejectionReasons.length > 0;
    if (rejected) {
      console.log("[ADAPTIVE] candidate rejected", { id: skeleton.id, rejectionReasons });
    } else {
      console.log("[ADAPTIVE] candidate generated", { id: skeleton.id, strategy: skeleton.strategy });
    }

    return {
      ...skeleton,
      executionStability: 0,
      recoveryPressure: 0,
      orchestrationScore: 0,
      rejected,
      rejectionReasons,
    };
  });
}

export function finalizeCandidates(params: {
  candidates: AdaptiveOrchestrationCandidate[];
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  instability: SimulationInstabilitySignals;
  baselineStrategy: AdaptiveOrchestrationStrategy;
  userId?: string;
  strategyTrustPenalties?: Partial<Record<AdaptiveOrchestrationStrategy, number>>;
  strategyReliabilityPenalties?: Partial<Record<AdaptiveOrchestrationStrategy, number>>;
  calibratedTrustScore?: number;
  autonomyReadinessPenalty?: number;
  phraseWindow?: PhraseWindowAnalysis | null;
  synthesisConfidence?: number;
  audioIntelligence?: AudioIntelligenceResult | null;
}): AdaptiveOrchestrationCandidate[] {
  return params.candidates.map((candidate) => {
    if (candidate.rejected) {
      return { ...candidate, orchestrationScore: 0 };
    }
    const projection = simulateCandidateExecution({
      candidate,
      evaluation: params.evaluation,
      simulation: params.simulation,
      instability: params.instability,
    });
    const scored: AdaptiveOrchestrationCandidate = {
      ...candidate,
      executionStability: projection.projectedExecutionStability,
      recoveryPressure: projection.predictedRecoveryPressure,
      confidence: clamp(
        candidate.confidence + projection.projectedConfidenceDrift * 0.35,
        0,
        100,
      ),
      orchestrationScore: 0,
      reasoning: [
        ...candidate.reasoning,
        `Projected transition success ${projection.predictedTransitionSuccess.toFixed(0)}.`,
        `Rollback survivability ${projection.rollbackSurvivability.toFixed(0)}.`,
        `Cadence continuity ${projection.cadenceContinuity.toFixed(0)}.`,
      ],
    };
    let orchestrationScore = computeOrchestrationCandidateScore({
      candidate: scored,
      projection,
      instability: params.instability,
      baselineStrategy: params.baselineStrategy,
      phraseWindow: params.phraseWindow,
      convergenceScore: scored.convergenceScore,
      synthesisConfidence: params.synthesisConfidence,
      audioIntelligence: params.audioIntelligence,
    });
    const trustPenalty = params.strategyTrustPenalties?.[scored.strategy] ?? 0;
    const reliabilityPenalty = params.strategyReliabilityPenalties?.[scored.strategy] ?? 0;
    const calibratedPenalty =
      params.calibratedTrustScore != null && params.calibratedTrustScore < 55 ? 6 : 0;
    const autonomyPenalty = params.autonomyReadinessPenalty ?? 0;
    const scoreDelta = trustPenalty + reliabilityPenalty + calibratedPenalty + autonomyPenalty;
    if (scoreDelta !== 0) {
      orchestrationScore = Number(clamp(orchestrationScore - scoreDelta, 0, 100).toFixed(2));
      if (trustPenalty > 0) {
        scored.reasoning.push(`Historical execution trust penalty -${trustPenalty.toFixed(0)} applied.`);
      }
      if (reliabilityPenalty > 0) {
        scored.reasoning.push(`Strategy reliability penalty -${reliabilityPenalty.toFixed(0)} applied.`);
      } else if (reliabilityPenalty < 0) {
        scored.reasoning.push(`Strategy reliability bonus +${Math.abs(reliabilityPenalty).toFixed(0)} applied.`);
      }
      if (calibratedPenalty > 0) {
        scored.reasoning.push("Calibrated runtime trust below threshold — conservatism increased.");
      }
      if (autonomyPenalty > 0) {
        scored.reasoning.push(`Autonomy readiness penalty -${autonomyPenalty.toFixed(0)} applied.`);
      }
    }
    scored.orchestrationScore = orchestrationScore;
    return scored;
  });
}

export function rankOrchestrationCandidates(candidates: AdaptiveOrchestrationCandidate[]) {
  return [...candidates].sort((a, b) => {
    if (a.rejected !== b.rejected) return a.rejected ? 1 : -1;
    if (a.globallyDivergent !== b.globallyDivergent) return a.globallyDivergent ? 1 : -1;
    const convergenceA = a.convergenceScore ?? 0;
    const convergenceB = b.convergenceScore ?? 0;
    if (convergenceB !== convergenceA) return convergenceB - convergenceA;
    const phraseA = a.phraseSurvivability ?? 0;
    const phraseB = b.phraseSurvivability ?? 0;
    if (phraseB !== phraseA) return phraseB - phraseA;
    const cadenceA = a.continuityWeight ?? 0;
    const cadenceB = b.continuityWeight ?? 0;
    if (cadenceB !== cadenceA) return cadenceB - cadenceA;
    if (b.orchestrationScore !== a.orchestrationScore) {
      return b.orchestrationScore - a.orchestrationScore;
    }
    if (b.executionStability !== a.executionStability) {
      return b.executionStability - a.executionStability;
    }
    return (b.rollbackPriority ?? 0) - (a.rollbackPriority ?? 0);
  });
}

export function selectViableOrchestrationCandidate(
  ranked: AdaptiveOrchestrationCandidate[],
): AdaptiveOrchestrationCandidate {
  const converged = ranked.find(
    (candidate) =>
      !candidate.rejected &&
      !candidate.globallyDivergent &&
      (candidate.convergenceScore ?? 0) >= 68 &&
      (candidate.phraseSurvivability ?? 0) >= 40 &&
      candidate.executionStability >= 58 &&
      (candidate.strategy === "recovery_blend" ||
        candidate.strategy === "smooth_blend" ||
        candidate.strategy === "hold_state"),
  );
  const viable = converged ??
    ranked.find(
      (candidate) =>
        !candidate.rejected &&
        !candidate.globallyDivergent &&
        candidate.executionStability >= 58 &&
        candidate.orchestrationScore >= 52,
    );
  const holdFallback = ranked.find((c) => c.strategy === "hold_state" && !c.rejected);
  const selected = viable ?? holdFallback ?? ranked.find((candidate) => !candidate.rejected) ?? ranked[0];
  console.log("[ADAPTIVE] candidate selected", {
    id: selected.id,
    strategy: selected.strategy,
    convergenceScore: selected.convergenceScore,
    orchestrationScore: selected.orchestrationScore,
  });
  return selected;
}
