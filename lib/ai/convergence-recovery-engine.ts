import "server-only";

import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { TransitionSimulationResult } from "@/lib/ai/transition-simulation";
import type { AdaptiveOrchestrationCandidate } from "@/lib/ai/adaptive-orchestration";
import {
  evaluateOrchestrationConvergence,
  type OrchestrationConvergenceMetrics,
} from "@/lib/ai/orchestration-convergence";
import { analyzePhraseWindow, type PhraseWindowAnalysis } from "@/lib/ai/phrase-window-engine";
import { recoverPhraseLock, type PhraseRecoveryResult } from "@/lib/ai/phrase-lock-recovery";
import type { PhraseRecoveryDirective } from "@/lib/ai/phrase-recovery-engine";
import type { TransportRuntimeState } from "@/lib/transition-orchestration/layer-state";
import { attemptAudioMixRecovery } from "@/lib/ai/audio-intelligence-engine";

export type ConvergenceRecoveryResult = {
  recovered: boolean;
  convergenceDelta: number;
  synthesisDelta: number;
  cadenceDelta: number;
  survivabilityDelta: number;
  retryExecution: boolean;
  finalRecommendation: "execute_supervised" | "hold_state" | "retry_alignment" | "reject";
  reasoning: string[];
  phraseWindow: PhraseWindowAnalysis;
  phraseLockRecovery: PhraseRecoveryResult;
  repairedMetrics: OrchestrationConvergenceMetrics;
  phraseRecoveryDirective: PhraseRecoveryDirective | null;
  audioMixRecovery: ReturnType<typeof attemptAudioMixRecovery> | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildPhraseDirective(lock: PhraseRecoveryResult): PhraseRecoveryDirective | null {
  if (lock.recoveryStrategy === "abort_transition") return null;
  let strategy: PhraseRecoveryDirective["strategy"] = "delay_blend";
  if (lock.recoveryStrategy === "hold_phrase") strategy = "hold_phrase";
  if (lock.recoveryStrategy === "extend_window" || lock.recoveryStrategy === "resync_retry") {
    strategy = "rephrase_alignment";
  }
  return {
    strategy,
    recoveryGain: lock.phraseRecoveryScore * 0.4,
    timingRiskReduction: lock.timingRiskReduction,
    cadenceRecovery: lock.cadenceRepair,
    reasoning: lock.reasoning,
  };
}

export function recoverGlobalConvergence(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  candidate: AdaptiveOrchestrationCandidate;
  baselineMetrics: OrchestrationConvergenceMetrics;
  transportRuntime?: TransportRuntimeState | null;
}): ConvergenceRecoveryResult {
  console.log("[CONVERGENCE] recovery attempt started", {
    baselineScore: params.baselineMetrics.convergenceScore,
    failures: params.baselineMetrics.convergenceFailures,
  });

  const phraseWindow = analyzePhraseWindow({ evaluation: params.evaluation });
  const phraseLockRecovery = recoverPhraseLock({
    evaluation: params.evaluation,
    phraseWindow,
    candidate: params.candidate,
  });

  const phraseRecoveryDirective = buildPhraseDirective(phraseLockRecovery);

  if (phraseLockRecovery.recoveryStrategy !== "abort_transition") {
    console.log("[CONVERGENCE] retrying synthesis");
  }

  const repairedCandidate: AdaptiveOrchestrationCandidate = {
    ...params.candidate,
    strategy:
      params.candidate.strategy === "fast_cut" && !phraseLockRecovery.recovered
        ? "smooth_blend"
        : params.candidate.strategy === "fast_cut" && phraseLockRecovery.recovered
          ? "recovery_blend"
          : params.candidate.strategy,
    aggression: Number(
      clamp(params.candidate.aggression - phraseLockRecovery.timingRiskReduction * 0.35, 12, 78).toFixed(2),
    ),
    continuityWeight: Number(
      clamp(params.candidate.continuityWeight + phraseLockRecovery.cadenceRepair * 0.4, 0, 100).toFixed(2),
    ),
    executionWindow:
      phraseLockRecovery.barsDelayed >= 8 ? "wide_window" : params.candidate.executionWindow,
    reasoning: [
      ...params.candidate.reasoning,
      ...phraseLockRecovery.reasoning,
      "Convergence recovery pipeline applied phrase lock and cadence stabilization.",
    ],
  };

  const audioMixRecovery = params.evaluation.audioIntelligence
    ? attemptAudioMixRecovery({ audio: params.evaluation.audioIntelligence })
    : null;

  const repairedMetrics = evaluateOrchestrationConvergence({
    candidate: repairedCandidate,
    evaluation: params.evaluation,
    simulation: params.simulation,
    transportRuntime: params.transportRuntime,
    phraseRecovery: phraseRecoveryDirective,
    audioIntelligence: params.evaluation.audioIntelligence,
    audioMixRecovered: audioMixRecovery?.recovered ?? false,
  });

  const convergenceDelta = Number(
    (repairedMetrics.convergenceScore - params.baselineMetrics.convergenceScore).toFixed(2),
  );
  const synthesisDelta = Number(
    (repairedMetrics.synthesisConfidence - params.baselineMetrics.synthesisConfidence).toFixed(2),
  );
  const cadenceDelta = Number(
    (repairedMetrics.cadenceStability - params.baselineMetrics.cadenceStability).toFixed(2),
  );
  const survivabilityDelta = Number(
    (repairedMetrics.phraseTimingSurvivability - params.baselineMetrics.phraseTimingSurvivability).toFixed(2),
  );

  const reasoning = [
    ...phraseLockRecovery.reasoning,
    `Convergence delta ${convergenceDelta >= 0 ? "+" : ""}${convergenceDelta.toFixed(1)} after recovery.`,
    `Synthesis repair ${synthesisDelta >= 0 ? "+" : ""}${synthesisDelta.toFixed(1)}.`,
  ];

  const rollbackUnsafe = params.evaluation.rollbackReadiness < 55;
  const phraseCritical = repairedMetrics.phraseTimingSurvivability < 32;
  const telemetryExpired =
    params.baselineMetrics.convergenceFailures.includes("transport_freshness_expired") &&
    repairedMetrics.convergenceFailures.includes("transport_freshness_expired");

  const audioUnsafe =
    (params.evaluation.audioIntelligence?.vocal.overlapRisk ?? 0) >= 75 &&
    !(audioMixRecovery?.recovered ?? false);
  const grooveCollapsed = (repairedMetrics.grooveStability ?? 0) < 38;
  const dropUnstable = (repairedMetrics.dropContinuity ?? 0) < 32;

  let recovered =
    repairedMetrics.converged ||
    (repairedMetrics.convergenceScore >= 68 &&
      phraseLockRecovery.recovered &&
      !rollbackUnsafe &&
      !phraseCritical &&
      !audioUnsafe &&
      !grooveCollapsed &&
      !dropUnstable);

  let finalRecommendation: ConvergenceRecoveryResult["finalRecommendation"] = "retry_alignment";
  let retryExecution = phraseLockRecovery.retryRecommended;

  if (recovered && !rollbackUnsafe) {
    finalRecommendation = "execute_supervised";
    retryExecution = false;
    console.log("[CONVERGENCE] convergence repaired", {
      score: repairedMetrics.convergenceScore,
    });
  } else if (rollbackUnsafe || telemetryExpired || phraseCritical) {
    recovered = false;
    finalRecommendation = rollbackUnsafe || telemetryExpired ? "reject" : "hold_state";
    retryExecution = false;
    console.log("[CONVERGENCE] final rejection after failed recovery", {
      rollbackUnsafe,
      telemetryExpired,
      phraseCritical,
    });
  } else if (phraseLockRecovery.recoveryStrategy === "hold_phrase" || phraseLockRecovery.barsDelayed > 0) {
    finalRecommendation = "retry_alignment";
    retryExecution = true;
    reasoning.push("Retry alignment after phrase lock recovery window.");
  } else {
    finalRecommendation = "hold_state";
    reasoning.push("Hold state until convergence repairs mature.");
  }

  return {
    recovered,
    convergenceDelta,
    synthesisDelta,
    cadenceDelta,
    survivabilityDelta,
    retryExecution,
    finalRecommendation,
    reasoning,
    phraseWindow,
    phraseLockRecovery,
    repairedMetrics,
    phraseRecoveryDirective,
    audioMixRecovery,
  };
}
