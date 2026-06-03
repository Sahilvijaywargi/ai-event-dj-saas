import "server-only";

import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { PhraseWindowAnalysis } from "@/lib/ai/phrase-window-engine";
import type { AdaptiveOrchestrationCandidate } from "@/lib/ai/adaptive-orchestration";

export type PhraseRecoveryResult = {
  recovered: boolean;
  recoveryStrategy:
    | "delay_blend"
    | "hold_phrase"
    | "extend_window"
    | "resync_retry"
    | "abort_transition";
  phraseRecoveryScore: number;
  cadenceRepair: number;
  timingRiskReduction: number;
  retryRecommended: boolean;
  barsDelayed: number;
  reasoning: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function recoverPhraseLock(params: {
  evaluation: TransitionEvaluationResult;
  phraseWindow: PhraseWindowAnalysis;
  candidate?: AdaptiveOrchestrationCandidate | null;
}): PhraseRecoveryResult {
  const reasoning: string[] = [];
  const phraseRisk = params.evaluation.phraseTimingRisk;
  const survivability = params.phraseWindow.survivability;

  console.log("[PHRASE] recovery initiated", {
    phraseRisk,
    survivability,
    section: params.phraseWindow.sectionType,
  });

  if (phraseRisk <= 55 && survivability >= 58) {
    return {
      recovered: true,
      recoveryStrategy: "delay_blend",
      phraseRecoveryScore: survivability,
      cadenceRepair: 4,
      timingRiskReduction: 6,
      retryRecommended: false,
      barsDelayed: 0,
      reasoning: ["Phrase lock stable — no recovery required."],
    };
  }

  let recoveryStrategy: PhraseRecoveryResult["recoveryStrategy"] = "delay_blend";
  let barsDelayed = 0;
  let cadenceRepair = 12;
  let timingRiskReduction = 14;
  let retryRecommended = false;

  if (phraseRisk > 60) {
    recoveryStrategy = "hold_phrase";
    barsDelayed = params.phraseWindow.barsRemaining > 4 ? 8 : 4;
    timingRiskReduction = clamp((phraseRisk - 55) * 0.55, 14, 32);
    cadenceRepair = clamp(10 + params.phraseWindow.cadenceStability * 0.12, 12, 28);
    retryRecommended = true;
    console.log("[PHRASE] waiting for next bar lock", { barsDelayed });
    reasoning.push("Hold transition until next 8-bar phrase lock returns.");
  }

  if (survivability < 45) {
    recoveryStrategy = "extend_window";
    barsDelayed = Math.max(barsDelayed, 8);
    cadenceRepair += 8;
    timingRiskReduction += 6;
    reasoning.push("Phrase survivability low — execution window extended and aggression reduced.");
  }

  if (params.evaluation.cadenceStability < 58) {
    recoveryStrategy = recoveryStrategy === "hold_phrase" ? "hold_phrase" : "delay_blend";
    cadenceRepair += clamp(18 - params.evaluation.cadenceStability * 0.2, 8, 22);
    timingRiskReduction += 8;
    reasoning.push("Cadence unstable — widening blend timing and reducing timing pressure.");
    console.log("[PHRASE] cadence repaired", { cadenceRepair });
  }

  if (
    params.phraseWindow.timingDriftSeverity === "severe" &&
    params.evaluation.transitionDiagnostics.phraseAlignmentScore < 30
  ) {
    recoveryStrategy = "resync_retry";
    retryRecommended = true;
    barsDelayed = Math.max(barsDelayed, 8);
    reasoning.push("Resync retry recommended after phrase alignment collapse.");
  }

  if (
    params.candidate?.strategy === "fast_cut" &&
    phraseRisk > 70 &&
    params.phraseWindow.timingDriftSeverity === "severe"
  ) {
    recoveryStrategy = "abort_transition";
    reasoning.push("Fast cut aborted — phrase lock cannot support aggressive transition.");
  }

  const phraseRecoveryScore = Number(
    clamp(
      survivability + cadenceRepair * 0.45 + timingRiskReduction * 0.35 - barsDelayed * 1.2,
      0,
      100,
    ).toFixed(2),
  );

  const recovered =
    recoveryStrategy !== "abort_transition" &&
    phraseRecoveryScore >= 52 &&
    timingRiskReduction >= 10;

  return {
    recovered,
    recoveryStrategy,
    phraseRecoveryScore,
    cadenceRepair: Number(cadenceRepair.toFixed(2)),
    timingRiskReduction: Number(timingRiskReduction.toFixed(2)),
    retryRecommended,
    barsDelayed,
    reasoning,
  };
}
