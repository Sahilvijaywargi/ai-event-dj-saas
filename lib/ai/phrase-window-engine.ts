import "server-only";

import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";

export type PhraseWindowType =
  | "intro"
  | "build"
  | "drop"
  | "chorus"
  | "breakdown"
  | "outro"
  | "transition"
  | "recovery";

export type PhraseWindowAnalysis = {
  sectionType: PhraseWindowType;
  phrasePosition: number;
  phraseLength: number;
  barsRemaining: number;
  safeEntryWindow: boolean;
  safeExitWindow: boolean;
  timingRisk: number;
  cadenceStability: number;
  survivability: number;
  cadencePressure: number;
  timingDriftSeverity: "low" | "moderate" | "severe";
  reasoning: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mapTransitionWindow(
  window: TransitionEvaluationResult["phraseTransitionWindow"],
): PhraseWindowType {
  if (window === "intro") return "intro";
  if (window === "buildup") return "build";
  if (window === "chorus") return "chorus";
  if (window === "outro") return "outro";
  if (window === "phrase_boundary") return "transition";
  if (window === "unstable") return "recovery";
  return "breakdown";
}

function barsFromPhrasePosition(phrasePosition: number, phraseLengthBars: number) {
  const positionBars = (phrasePosition / 100) * phraseLengthBars;
  return Math.max(0, Math.ceil(phraseLengthBars - positionBars));
}

export function analyzePhraseWindow(params: {
  evaluation: TransitionEvaluationResult;
  phraseLengthBars?: 8 | 16;
}): PhraseWindowAnalysis {
  console.log("[PHRASE] window analysis started");

  const phraseLengthBars = params.phraseLengthBars ?? (params.evaluation.currentPhraseLength >= 24 ? 16 : 8);
  const phrasePosition = params.evaluation.currentPhrasePosition ?? 50;
  const phraseLength = params.evaluation.currentPhraseLength ?? phraseLengthBars * 4;
  const barsRemaining = barsFromPhrasePosition(phrasePosition, phraseLengthBars);

  const sectionType = mapTransitionWindow(params.evaluation.phraseTransitionWindow);
  const alignment = params.evaluation.phraseAlignmentConfidence;
  const phraseAlignmentScore = params.evaluation.transitionDiagnostics.phraseAlignmentScore;

  const boundaryProximity =
    phrasePosition >= 44 && phrasePosition <= 58 ? 1 : phrasePosition >= 88 || phrasePosition <= 8 ? 0.85 : 0.2;
  const unsafeBoundary = boundaryProximity >= 0.8 && alignment < 62;

  if (unsafeBoundary) {
    console.log("[PHRASE] unsafe phrase boundary detected", { phrasePosition, alignment });
  }

  const safeEntryWindow =
    (sectionType === "outro" || sectionType === "transition" || sectionType === "breakdown") &&
    alignment >= 58 &&
    !unsafeBoundary;
  const safeExitWindow =
    (sectionType === "intro" || sectionType === "build" || sectionType === "chorus") &&
    barsRemaining >= 2 &&
    alignment >= 55;

  let timingRisk = Number(
    clamp(
      params.evaluation.phraseTimingRisk * 0.55 +
        (100 - alignment) * 0.25 +
        (unsafeBoundary ? 18 : 0) +
        (phraseAlignmentScore < 40 ? 12 : phraseAlignmentScore < 55 ? 6 : 0),
      0,
      100,
    ).toFixed(2),
  );

  let cadenceStability = Number(
    clamp(
      params.evaluation.cadenceStability * 0.5 +
        params.evaluation.phraseStability * 0.25 +
        alignment * 0.15 +
        (safeEntryWindow || safeExitWindow ? 8 : -6),
      0,
      100,
    ).toFixed(2),
  );

  const survivability = Number(
    clamp(
      alignment * 0.35 +
        cadenceStability * 0.25 +
        (100 - timingRisk) * 0.25 +
        (safeEntryWindow ? 10 : 0) +
        (params.evaluation.rollbackReadiness * 0.15),
      0,
      100,
    ).toFixed(2),
  );

  const cadencePressure = Number(clamp(100 - cadenceStability + timingRisk * 0.2, 0, 100).toFixed(2));

  let timingDriftSeverity: PhraseWindowAnalysis["timingDriftSeverity"] = "low";
  if (timingRisk >= 72 || phraseAlignmentScore < 35) timingDriftSeverity = "severe";
  else if (timingRisk >= 55 || phraseAlignmentScore < 50) timingDriftSeverity = "moderate";

  const reasoning: string[] = [];
  reasoning.push(
    `${phraseLengthBars}-bar phrase model: position ${phrasePosition.toFixed(0)}%, ${barsRemaining} bars remaining.`,
  );
  if (unsafeBoundary) {
    reasoning.push("Unsafe phrase-boundary transition window — blend insertion penalized.");
  }
  if (safeEntryWindow) reasoning.push("Survivable blend entry window detected.");
  if (safeExitWindow) reasoning.push("Safe phrase exit window supports supervised transition.");
  if (timingDriftSeverity !== "low") {
    reasoning.push(`Timing drift severity ${timingDriftSeverity} from alignment collapse.`);
  }

  return {
    sectionType,
    phrasePosition,
    phraseLength,
    barsRemaining,
    safeEntryWindow,
    safeExitWindow,
    timingRisk,
    cadenceStability,
    survivability,
    cadencePressure,
    timingDriftSeverity,
    reasoning,
  };
}
