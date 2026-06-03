import type { TransitionEvaluationResult, ExecutionStrategy } from "@/lib/ai/transition-engine";
import type { TransitionSimulationResult } from "@/lib/ai/transition-simulation";
import { evaluateOrchestrationConvergence } from "@/lib/ai/orchestration-convergence";
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
import {
  applyPhraseRecoveryToCandidate,
  generatePhraseRecoveryCandidates,
  selectBestPhraseRecovery,
} from "@/lib/ai/phrase-recovery-engine";
import { analyzePhraseWindow } from "@/lib/ai/phrase-window-engine";
import { recoverGlobalConvergence } from "@/lib/ai/convergence-recovery-engine";
import { coordinateTelemetryFreshness } from "@/lib/spotify/telemetry-freshness-coordinator";
import { computeHistoricalExecutionTrust } from "@/lib/ai/execution-trust-history";
import { calibrateRuntimeTrust } from "@/lib/ai/runtime-trust-calibration";
import { evaluateAutonomyReadiness } from "@/lib/ai/autonomy-readiness-engine";
import { getStrategyReliabilityPenalty } from "@/lib/ai/strategy-reliability-history";
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

function applyConvergenceToEvaluation(params: {
  evaluation: TransitionEvaluationResult;
  selected: AdaptiveOrchestrationCandidate;
  adaptationReasoning: string[];
  convergence: OrchestrationRefinementResult["convergenceMetrics"];
  phraseRecovery: OrchestrationRefinementResult["phraseRecovery"];
  globalConvergenceState: OrchestrationRefinementResult["globalConvergenceState"];
}): TransitionEvaluationResult {
  const executionStrategy = mapAdaptiveStrategyToExecution(params.selected.strategy);
  const executionWindowState = mapAdaptiveWindowToExecution(params.selected.executionWindow);
  return {
    ...params.evaluation,
    executionStrategy,
    executionWindowState,
    transitionAggressiveness: params.selected.aggression,
    phraseTimingRisk: Number(
      clamp(
        params.evaluation.phraseTimingRisk - (params.phraseRecovery?.timingRiskReduction ?? 0),
        0,
        100,
      ).toFixed(2),
    ),
    cadenceStability: Number(
      clamp(params.evaluation.cadenceStability + (params.phraseRecovery?.cadenceRecovery ?? 0), 0, 100).toFixed(2),
    ),
    narrativeContinuity: params.convergence.narrativeContinuity,
    emotionalContinuity: params.convergence.emotionalContinuity,
    orchestrationStability: Number(
      clamp(
        params.evaluation.orchestrationStability * 0.4 +
          params.convergence.convergenceScore * 0.35 +
          params.selected.executionStability * 0.25,
        0,
        100,
      ).toFixed(2),
    ),
    orchestrationSynthesisConfidence: params.convergence.synthesisConfidence,
    confidence: {
      ...params.evaluation.confidence,
      score: Number(params.selected.confidence.toFixed(2)),
      reasons: [
        ...params.evaluation.confidence.reasons.slice(0, 3),
        "Global orchestration convergence stabilization applied after simulation.",
      ],
    },
    executionStrategyReasoning: [
      ...params.evaluation.executionStrategyReasoning.slice(0, 3),
      ...params.adaptationReasoning,
      `Convergence score ${params.convergence.convergenceScore.toFixed(0)} (${params.globalConvergenceState}).`,
    ],
    operatorAttentionRequired:
      params.globalConvergenceState !== "stable" || !params.convergence.converged,
    autonomousReadiness:
      params.globalConvergenceState === "stable" &&
      params.convergence.converged &&
      params.selected.executionStability >= 68
        ? params.evaluation.autonomousReadiness
        : "needs_review",
  };
}

function evaluateCandidatesWithConvergence(params: {
  candidates: AdaptiveOrchestrationCandidate[];
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  transportRuntime?: TransportRuntimeState | null;
  executionRuntime?: ExecutionRuntimeState | null;
  phraseRecovery: OrchestrationRefinementResult["phraseRecovery"];
  audioMixRecovered?: boolean;
}): {
  evaluated: AdaptiveOrchestrationCandidate[];
  metricsById: Map<string, OrchestrationRefinementResult["convergenceMetrics"]>;
} {
  const freshnessCoordination = coordinateTelemetryFreshness(
    params.executionRuntime
      ? {
          verificationFinalized: true,
          stabilizationCompleted: params.executionRuntime.lifecycleState === "rollback_ready",
          rollbackIntegrity: params.executionRuntime.rollbackIntegrityScore,
          verificationConfidence: params.executionRuntime.verificationConfidence,
          telemetryUpdatedAt: Date.now() - 12_000,
        }
      : null,
    params.transportRuntime
      ? {
          playbackAgeMs:
            params.transportRuntime.transportFreshness === "expired"
              ? 60_000
              : params.transportRuntime.transportFreshness === "stale"
                ? 28_000
                : 10_000,
        }
      : undefined,
  );

  const metricsById = new Map<string, OrchestrationRefinementResult["convergenceMetrics"]>();
  const evaluated = params.candidates.map((candidate) => {
    const metrics = evaluateOrchestrationConvergence({
      candidate,
      evaluation: params.evaluation,
      simulation: params.simulation,
      transportRuntime: params.transportRuntime,
      freshnessCoordination,
      phraseRecovery: params.phraseRecovery,
      audioIntelligence: params.evaluation.audioIntelligence,
      audioMixRecovered: params.audioMixRecovered,
    });
    metricsById.set(candidate.id, metrics);
    const globallyDivergent =
      !metrics.converged || metrics.convergenceSeverity === "divergent" || metrics.convergenceScore < 68;
    if (globallyDivergent) {
      return {
        ...candidate,
        convergenceScore: metrics.convergenceScore,
        phraseSurvivability: metrics.phraseTimingSurvivability,
        globallyDivergent: true,
        rejected: candidate.rejected || metrics.convergenceFailures.length > 2,
        rejectionReasons: [
          ...candidate.rejectionReasons,
          ...metrics.convergenceFailures.map((f) => `convergence_${f}`),
        ],
      };
    }
    return {
      ...candidate,
      convergenceScore: metrics.convergenceScore,
      phraseSurvivability: metrics.phraseTimingSurvivability,
      globallyDivergent: false,
    };
  });
  return { evaluated, metricsById };
}

export function refineOrchestrationAfterSimulation(params: {
  userId?: string;
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  transportRuntime?: TransportRuntimeState | null;
  executionRuntime?: ExecutionRuntimeState | null;
}): OrchestrationRefinementResult {
  const historicalTrust = params.userId ? computeHistoricalExecutionTrust(params.userId) : null;
  const runtimeTrustCalibration = params.userId
    ? calibrateRuntimeTrust({ userId: params.userId })
    : null;
  const autonomyReadiness =
    params.userId && runtimeTrustCalibration
      ? evaluateAutonomyReadiness({
          userId: params.userId,
          calibration: runtimeTrustCalibration,
          convergenceScore: params.evaluation.orchestrationSynthesisConfidence,
          transportStability: params.transportRuntime?.transportStability ?? params.evaluation.transportStability,
        })
      : null;
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

  const autonomyPenalty =
    autonomyReadiness?.readiness === "not_ready"
      ? 12
      : autonomyReadiness?.readiness === "supervised_only"
        ? 4
        : 0;

  const phraseWindowAnalysis = analyzePhraseWindow({ evaluation: params.evaluation });
  const audioMixRecovered = params.evaluation.audioMixRecovery?.recovered ?? false;

  let candidates = finalizeCandidates({
    candidates: rawCandidates,
    evaluation: params.evaluation,
    simulation: params.simulation,
    instability,
    baselineStrategy: previousStrategy,
    userId: params.userId,
    strategyTrustPenalties: historicalTrust?.strategyPenalties,
    strategyReliabilityPenalties: params.userId
      ? {
          fast_cut: getStrategyReliabilityPenalty("fast_cut", params.userId),
          smooth_blend: getStrategyReliabilityPenalty("smooth_blend", params.userId),
          recovery_blend: getStrategyReliabilityPenalty("recovery_blend", params.userId),
          hold_state: getStrategyReliabilityPenalty("hold_state", params.userId),
          energy_ramp: getStrategyReliabilityPenalty("energy_ramp", params.userId),
        }
      : undefined,
    calibratedTrustScore: runtimeTrustCalibration?.trustScore,
    autonomyReadinessPenalty: autonomyPenalty,
    phraseWindow: phraseWindowAnalysis,
    synthesisConfidence: params.evaluation.orchestrationSynthesisConfidence,
    audioIntelligence: params.evaluation.audioIntelligence,
  });

  const phraseDirectives = generatePhraseRecoveryCandidates({ evaluation: params.evaluation });
  let phraseRecovery = selectBestPhraseRecovery(phraseDirectives);

  let firstPass = evaluateCandidatesWithConvergence({
    candidates,
    evaluation: params.evaluation,
    simulation: params.simulation,
    transportRuntime: params.transportRuntime,
    executionRuntime: params.executionRuntime,
    phraseRecovery,
    audioMixRecovered,
  });

  if (phraseRecovery && params.evaluation.phraseTimingRisk > 60) {
    candidates = firstPass.evaluated.map((candidate) =>
      candidate.globallyDivergent || candidate.rejected
        ? applyPhraseRecoveryToCandidate(candidate, phraseRecovery!)
        : candidate,
    );
    firstPass = evaluateCandidatesWithConvergence({
      candidates,
      evaluation: params.evaluation,
      simulation: params.simulation,
      transportRuntime: params.transportRuntime,
      executionRuntime: params.executionRuntime,
      phraseRecovery,
      audioMixRecovered,
    });
  }

  let rankedCandidates = rankOrchestrationCandidates(firstPass.evaluated);
  let selectedCandidate = selectViableOrchestrationCandidate(rankedCandidates);

  const allDivergent = rankedCandidates.every(
    (c) => c.globallyDivergent || (c.convergenceScore ?? 0) < 68,
  );
  let globalConvergenceState: OrchestrationRefinementResult["globalConvergenceState"] = "stable";

  const recoverySeed =
    rankedCandidates.find(
      (c) =>
        !c.rejected &&
        (c.strategy === "recovery_blend" || c.strategy === "smooth_blend"),
    ) ?? selectedCandidate;

  const baselineMetrics =
    firstPass.metricsById.get(recoverySeed.id) ??
    evaluateOrchestrationConvergence({
      candidate: recoverySeed,
      evaluation: params.evaluation,
      simulation: params.simulation,
      transportRuntime: params.transportRuntime,
      phraseRecovery,
      audioIntelligence: params.evaluation.audioIntelligence,
      audioMixRecovered,
    });

  let convergenceRecovery = null;
  if (allDivergent || selectedCandidate.globallyDivergent || baselineMetrics.convergenceScore < 68) {
    convergenceRecovery = recoverGlobalConvergence({
      evaluation: params.evaluation,
      simulation: params.simulation,
      candidate: recoverySeed,
      baselineMetrics,
      transportRuntime: params.transportRuntime,
    });
    if (convergenceRecovery.phraseRecoveryDirective) {
      phraseRecovery = {
        strategy: convergenceRecovery.phraseRecoveryDirective.strategy,
        recoveryGain: convergenceRecovery.phraseRecoveryDirective.recoveryGain,
        timingRiskReduction: convergenceRecovery.phraseRecoveryDirective.timingRiskReduction,
        cadenceRecovery: convergenceRecovery.phraseRecoveryDirective.cadenceRecovery,
        reasoning: convergenceRecovery.phraseRecoveryDirective.reasoning,
      };
    }
    if (convergenceRecovery.recovered) {
      const repairedId = recoverySeed.id;
      candidates = firstPass.evaluated.map((candidate) => {
        if (candidate.id !== repairedId) return candidate;
        if (!convergenceRecovery!.phraseLockRecovery.recovered) return candidate;
        return {
          ...candidate,
          strategy: candidate.strategy === "fast_cut" ? "recovery_blend" : candidate.strategy,
          globallyDivergent: false,
          rejected: false,
          convergenceScore: convergenceRecovery!.repairedMetrics.convergenceScore,
          phraseSurvivability: convergenceRecovery!.repairedMetrics.phraseTimingSurvivability,
          orchestrationScore: Number(
            clamp(
              (candidate.orchestrationScore ?? 0) + convergenceRecovery!.convergenceDelta,
              0,
              100,
            ).toFixed(2),
          ),
          reasoning: [...candidate.reasoning, ...convergenceRecovery!.reasoning],
        };
      });
      firstPass = evaluateCandidatesWithConvergence({
        candidates,
        evaluation: params.evaluation,
        simulation: params.simulation,
        transportRuntime: params.transportRuntime,
        executionRuntime: params.executionRuntime,
        phraseRecovery,
        audioMixRecovered: true,
      });
      rankedCandidates = rankOrchestrationCandidates(firstPass.evaluated);
      selectedCandidate = selectViableOrchestrationCandidate(rankedCandidates);
      globalConvergenceState =
        convergenceRecovery.repairedMetrics.convergenceSeverity === "stable"
          ? "stable"
          : "degraded";
    } else if (convergenceRecovery.finalRecommendation === "reject") {
      globalConvergenceState = "divergent";
    }
  }

  const stillDivergent =
    rankedCandidates.every((c) => c.globallyDivergent || (c.convergenceScore ?? 0) < 68) &&
    !convergenceRecovery?.recovered;

  if (stillDivergent) {
    globalConvergenceState = "divergent";
    const holdCandidate =
      rankedCandidates.find((c) => c.strategy === "hold_state") ??
      ({
        ...selectedCandidate,
        id: "hold_state_fallback",
        strategy: "hold_state" as const,
        executionWindow: "wide_window" as const,
        aggression: 18,
        globallyDivergent: false,
        rejected: false,
        rejectionReasons: [],
        reasoning: [
          "Hold-state fallback only after phrase lock and convergence recovery attempts failed.",
        ],
      } satisfies AdaptiveOrchestrationCandidate);
    selectedCandidate = holdCandidate;
  } else if ((selectedCandidate.convergenceScore ?? 0) < 68) {
    globalConvergenceState = "degraded";
  }

  const convergenceMetrics =
    convergenceRecovery?.recovered
      ? convergenceRecovery.repairedMetrics
      : firstPass.metricsById.get(selectedCandidate.id) ??
        evaluateOrchestrationConvergence({
          candidate: selectedCandidate,
          evaluation: params.evaluation,
          simulation: params.simulation,
          transportRuntime: params.transportRuntime,
          phraseRecovery,
        });

  const selectedProjection = simulateCandidateExecution({
    candidate: selectedCandidate,
    evaluation: params.evaluation,
    simulation: params.simulation,
    instability,
  });

  const adaptationWarnings = [...directives.warnings];
  if (globalConvergenceState === "divergent") {
    adaptationWarnings.push("Global orchestration divergence forced hold-state fallback and operator supervision.");
  }
  if (phraseRecovery) {
    adaptationWarnings.push(
      `Phrase recovery applied (${phraseRecovery.strategy.replace(/_/g, " ")}).`,
    );
  }
  if (selectedCandidate.id !== "baseline") {
    adaptationWarnings.push(
      `Adaptive orchestration selected ${selectedCandidate.strategy.replace(/_/g, " ")} candidate.`,
    );
  }

  const adaptationReasoning = [
    instability.refinementRequired
      ? "Simulation instability triggered adaptive orchestration refinement."
      : "Simulation completed; convergence validation applied across orchestration layers.",
    ...instability.signals.map((signal) => `Instability signal: ${signal.replace(/_/g, " ")}.`),
    ...selectedCandidate.reasoning,
    `Global convergence ${globalConvergenceState}; score ${convergenceMetrics.convergenceScore.toFixed(0)}.`,
  ];

  const refinedEvaluation = applyConvergenceToEvaluation({
    evaluation: params.evaluation,
    selected: selectedCandidate,
    adaptationReasoning,
    convergence: convergenceMetrics,
    phraseRecovery,
    globalConvergenceState,
  });

  if (selectedCandidate.executionStability > baselineStability || convergenceMetrics.converged) {
    console.log("[ADAPTIVE] orchestration stabilized", {
      baselineStability,
      selectedStability: selectedCandidate.executionStability,
      convergenceScore: convergenceMetrics.convergenceScore,
    });
  }

  const candidateConvergence = rankedCandidates.map((candidate) => ({
    candidateId: candidate.id,
    metrics:
      firstPass.metricsById.get(candidate.id) ??
      evaluateOrchestrationConvergence({
        candidate,
        evaluation: params.evaluation,
        simulation: params.simulation,
        transportRuntime: params.transportRuntime,
        phraseRecovery,
      }),
  }));

  return {
    instabilityDetected: instability.refinementRequired,
    instabilitySignals: instability.signals,
    candidates: firstPass.evaluated,
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
    convergenceMetrics,
    phraseRecovery,
    globalConvergenceState,
    candidateConvergence,
    runtimeTrustCalibration,
    autonomyReadiness,
    phraseWindowAnalysis,
    phraseLockRecovery: convergenceRecovery?.phraseLockRecovery ?? null,
    convergenceRecovery,
  };
}
