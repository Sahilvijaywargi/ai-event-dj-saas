import type { TransitionEvaluationResult, ExecutionStrategy } from "@/lib/ai/transition-engine";
import type { TransitionSimulationResult } from "@/lib/ai/transition-simulation";
import {
  buildAdaptationContext,
  mapEvaluationStrategyToAdaptive,
  mapEvaluationWindowToAdaptive,
  type AdaptiveOrchestrationCandidate,
  type AdaptiveOrchestrationStrategy,
  type AdaptiveExecutionWindow,
} from "@/lib/ai/adaptive-orchestration";
import {
  finalizeCandidates,
  generateOrchestrationCandidates,
  rankOrchestrationCandidates,
  selectViableOrchestrationCandidate,
  simulateCandidateExecution,
} from "@/lib/ai/orchestration-candidate-engine";
import type { ExecutionRuntimeState, TransportRuntimeState } from "@/lib/transition-orchestration/layer-state";
import type { OrchestrationRefinementResult } from "@/lib/ai/orchestration-refinement-types";

export type { OrchestrationRefinementResult, OrchestrationRefinementTelemetry } from "@/lib/ai/orchestration-refinement-types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeAverage(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mapAdaptiveStrategyToExecution(strategy: AdaptiveOrchestrationStrategy): ExecutionStrategy {
  if (strategy === "fast_cut") return "fast_cut";
  if (strategy === "hold_state") return "hold_state";
  if (strategy === "energy_ramp") return "energy_ramp_blend";
  if (strategy === "recovery_blend") return "smooth_blend";
  return "smooth_blend";
}

function mapAdaptiveWindowToExecution(window: AdaptiveExecutionWindow): TransitionEvaluationResult["executionWindowState"] {
  if (window === "wide_window") return "stable_window";
  if (window === "narrow_window") return "narrow_window";
  return "narrow_window";
}

export function applySelectedCandidateToEvaluation(params: {
  evaluation: TransitionEvaluationResult;
  selected: AdaptiveOrchestrationCandidate;
  adaptationReasoning: string[];
}): TransitionEvaluationResult {
  const executionStrategy = mapAdaptiveStrategyToExecution(params.selected.strategy);
  const executionWindowState = mapAdaptiveWindowToExecution(params.selected.executionWindow);
  return {
    ...params.evaluation,
    executionStrategy,
    executionWindowState,
    transitionAggressiveness: params.selected.aggression,
    confidence: {
      ...params.evaluation.confidence,
      score: Number(params.selected.confidence.toFixed(2)),
      reasons: [
        ...params.evaluation.confidence.reasons.slice(0, 4),
        "Adaptive orchestration refinement adjusted confidence after simulation instability.",
      ],
    },
    executionStrategyReasoning: [
      ...params.evaluation.executionStrategyReasoning.slice(0, 3),
      ...params.adaptationReasoning,
      `Adaptive refinement selected ${params.selected.strategy.replace(/_/g, " ")} (${params.selected.id}).`,
    ],
    autonomousReadiness:
      params.selected.executionStability >= 68 && params.selected.rejected === false
        ? params.evaluation.autonomousReadiness
        : "needs_review",
  };
}

export function refineOrchestrationAfterSimulation(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  transportRuntime?: TransportRuntimeState | null;
  executionRuntime?: ExecutionRuntimeState | null;
}): OrchestrationRefinementResult {
  const { instability, directives } = buildAdaptationContext({
    evaluation: params.evaluation,
    simulation: params.simulation,
    transportRuntime: params.transportRuntime,
    executionRuntime: params.executionRuntime,
  });

  const previousStrategy = mapEvaluationStrategyToAdaptive(params.evaluation.executionStrategy);
  const baselineStability = computeAverage(params.simulation.timeline.projectedExecutionStability);
  const baselineRollbackSurvivability = params.evaluation.rollbackReadiness;

  if (instability.refinementRequired) {
    console.log("[ADAPTIVE] refinement triggered", { signals: instability.signals });
  }

  const rawCandidates = generateOrchestrationCandidates({
    evaluation: params.evaluation,
    directives,
    instability,
  });

  const candidates = finalizeCandidates({
    candidates: rawCandidates,
    evaluation: params.evaluation,
    simulation: params.simulation,
    instability,
    baselineStrategy: previousStrategy,
  });

  const rankedCandidates = rankOrchestrationCandidates(candidates);
  const selectedCandidate = selectViableOrchestrationCandidate(rankedCandidates);

  const selectedProjection = simulateCandidateExecution({
    candidate: selectedCandidate,
    evaluation: params.evaluation,
    simulation: params.simulation,
    instability,
  });

  const adaptationWarnings = [...directives.warnings];
  if (selectedCandidate.id !== "baseline") {
    adaptationWarnings.push(
      `Adaptive orchestration selected ${selectedCandidate.strategy.replace(/_/g, " ")} candidate.`,
    );
  }
  const recoveryWinner = rankedCandidates.find(
    (c) => c.id === "recovery_blend" && !c.rejected && c.orchestrationScore > 0,
  );
  const baseline = rankedCandidates.find((c) => c.id === "baseline");
  if (
    recoveryWinner &&
    baseline &&
    recoveryWinner.orchestrationScore > baseline.orchestrationScore + 4 &&
    selectedCandidate.id === recoveryWinner.id
  ) {
    adaptationWarnings.push("Recovery blend candidate outperformed baseline execution stability.");
  }

  const adaptationReasoning = [
    instability.refinementRequired
      ? "Simulation instability triggered adaptive orchestration refinement."
      : "Simulation completed; baseline candidate retained with stability verification.",
    ...instability.signals.map((signal) => `Instability signal: ${signal.replace(/_/g, " ")}.`),
    ...selectedCandidate.reasoning,
  ];

  const refinedEvaluation = applySelectedCandidateToEvaluation({
    evaluation: params.evaluation,
    selected: selectedCandidate,
    adaptationReasoning,
  });

  if (selectedCandidate.executionStability > baselineStability) {
    console.log("[ADAPTIVE] orchestration stabilized", {
      baselineStability,
      selectedStability: selectedCandidate.executionStability,
    });
  }

  return {
    instabilityDetected: instability.refinementRequired,
    instabilitySignals: instability.signals,
    candidates,
    rankedCandidates,
    selectedCandidate,
    previousStrategy,
    adaptationWarnings,
    adaptationReasoning,
    refinementTelemetry: {
      refinementTriggered: instability.refinementRequired,
      baselineStability: Number(baselineStability.toFixed(2)),
      selectedStability: selectedCandidate.executionStability,
      stabilityDelta: Number((selectedCandidate.executionStability - baselineStability).toFixed(2)),
      baselineRollbackSurvivability: Number(baselineRollbackSurvivability.toFixed(2)),
      selectedRollbackSurvivability: selectedProjection.rollbackSurvivability,
      rollbackSurvivabilityDelta: Number(
        (selectedProjection.rollbackSurvivability - baselineRollbackSurvivability).toFixed(2),
      ),
      aggressionDecay: directives.aggressionDecay,
      executionWindowAdaptation: `${mapEvaluationWindowToAdaptive(params.evaluation.executionWindowState)} → ${selectedCandidate.executionWindow}`,
      baselineStrategy: previousStrategy,
      selectedStrategy: selectedCandidate.strategy,
    },
    refinedEvaluation,
  };
}
