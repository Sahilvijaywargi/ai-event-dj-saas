import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { AdaptiveOrchestrationCandidate } from "@/lib/ai/adaptive-orchestration";

export interface PhraseRecoveryDirective {
  strategy: "delay_blend" | "hold_phrase" | "cooldown_transition" | "rephrase_alignment";
  recoveryGain: number;
  timingRiskReduction: number;
  cadenceRecovery: number;
  reasoning: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function generatePhraseRecoveryCandidates(params: {
  evaluation: TransitionEvaluationResult;
  candidate?: AdaptiveOrchestrationCandidate | null;
}): PhraseRecoveryDirective[] {
  if (params.evaluation.phraseTimingRisk <= 60) {
    return [];
  }

  console.log("[CONVERGENCE] phrase recovery applied", {
    phraseTimingRisk: params.evaluation.phraseTimingRisk,
  });

  const risk = params.evaluation.phraseTimingRisk;
  const directives: PhraseRecoveryDirective[] = [];

  directives.push({
    strategy: "hold_phrase",
    recoveryGain: clamp((risk - 55) * 0.45, 8, 28),
    timingRiskReduction: clamp((risk - 50) * 0.55, 12, 32),
    cadenceRecovery: clamp(params.evaluation.cadenceStability * 0.08 + 10, 8, 22),
    reasoning: [
      "Hold phrase window to prevent bar-lock collapse under elevated timing risk.",
      "Bar-lock recovery prioritized before blend insertion.",
    ],
  });

  directives.push({
    strategy: "delay_blend",
    recoveryGain: clamp((risk - 60) * 0.4, 6, 24),
    timingRiskReduction: clamp((risk - 58) * 0.5, 10, 28),
    cadenceRecovery: clamp(14 + params.evaluation.phraseAlignmentConfidence * 0.06, 10, 26),
    reasoning: [
      "Delayed blend insertion preserves phrase boundary integrity.",
      "Recovery-oriented blend timing reduces phrase collision pressure.",
    ],
  });

  directives.push({
    strategy: "cooldown_transition",
    recoveryGain: clamp((risk - 65) * 0.35, 5, 20),
    timingRiskReduction: clamp((risk - 62) * 0.48, 14, 30),
    cadenceRecovery: clamp(18, 12, 30),
    reasoning: [
      "Cooldown transition window stabilizes cadence before next mutation.",
      "Phrase cooldown reduces immediate timing volatility.",
    ],
  });

  if (params.evaluation.transitionDiagnostics.phraseAlignmentScore < 55) {
    directives.push({
      strategy: "rephrase_alignment",
      recoveryGain: clamp(16 + (55 - params.evaluation.transitionDiagnostics.phraseAlignmentScore) * 0.4, 12, 30),
      timingRiskReduction: clamp((risk - 45) * 0.42, 8, 26),
      cadenceRecovery: clamp(20, 14, 32),
      reasoning: [
        "Rephrase alignment recovery improves bar-lock survivability.",
        "Timing-safe fallback defers aggressive transitions until alignment recovers.",
      ],
    });
  }

  return directives;
}

export function selectBestPhraseRecovery(directives: PhraseRecoveryDirective[]): PhraseRecoveryDirective | null {
  if (!directives.length) return null;
  return directives.reduce((best, current) =>
    current.timingRiskReduction + current.cadenceRecovery > best.timingRiskReduction + best.cadenceRecovery
      ? current
      : best,
  );
}

export function selectPhraseRecoveryByAdvisory(
  directives: PhraseRecoveryDirective[],
  preferPhraseHold: boolean,
): PhraseRecoveryDirective | null {
  if (!directives.length) return null;
  if (preferPhraseHold) {
    const holdPhrase = directives.find((directive) => directive.strategy === "hold_phrase");
    if (holdPhrase) return holdPhrase;
  }
  return selectBestPhraseRecovery(directives);
}

export function applyPhraseRecoveryToCandidate(
  candidate: AdaptiveOrchestrationCandidate,
  directive: PhraseRecoveryDirective,
): AdaptiveOrchestrationCandidate {
  return {
    ...candidate,
    strategy: candidate.strategy === "fast_cut" ? "smooth_blend" : candidate.strategy,
    aggression: Number(Math.max(18, candidate.aggression - directive.timingRiskReduction * 0.25).toFixed(2)),
    continuityWeight: Number(clamp(candidate.continuityWeight + directive.cadenceRecovery * 0.35, 0, 100).toFixed(2)),
    reasoning: [...candidate.reasoning, ...directive.reasoning],
  };
}
