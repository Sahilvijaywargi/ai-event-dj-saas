import "server-only";

import type { SongSection } from "@/lib/ai/song-structure";

export type StructuralArbitrationSelectedSource =
  | "converged"
  | "audio"
  | "phrase"
  | "low_risk_graph";

export interface StructuralArbitrationResult {
  selectedSource: StructuralArbitrationSelectedSource;
  selectedSection: SongSection;
  arbitrationConfidence: number;
  arbitrationReason: string[];
  phraseConfidence: number;
  audioConfidence: number;
  agreementScore: number;
  overrideApplied: boolean;
}

const CONVERGED_AGREEMENT_THRESHOLD = 75;
const CONFIDENCE_GAP_THRESHOLD = 15;

/** Higher score = lower transition risk (aligned with exit-quality semantics). */
const SECTION_TRANSITION_SAFETY: Record<SongSection, number> = {
  outro: 96,
  breakdown: 88,
  build: 78,
  verse: 62,
  pre_chorus: 58,
  intro: 52,
  chorus: 44,
  drop: 28,
  unknown: 40,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(clamp(value, 0, 100).toFixed(2));
}

function formatSection(section: SongSection) {
  return section.replace(/_/g, " ");
}

function resolveLowerRiskSection(phraseSection: SongSection, audioSection: SongSection): SongSection {
  const phraseSafety = SECTION_TRANSITION_SAFETY[phraseSection] ?? 40;
  const audioSafety = SECTION_TRANSITION_SAFETY[audioSection] ?? 40;
  if (audioSafety > phraseSafety) return audioSection;
  if (phraseSafety > audioSafety) return phraseSection;
  return phraseSection;
}

function computeArbitrationConfidence(params: {
  selectedSource: StructuralArbitrationSelectedSource;
  agreementScore: number;
  phraseConfidence: number;
  audioConfidence: number;
  confidenceGap: number;
}) {
  const avgConfidence = (params.phraseConfidence + params.audioConfidence) / 2;
  if (params.selectedSource === "converged") {
    return round(params.agreementScore * 0.55 + avgConfidence * 0.45);
  }
  if (params.selectedSource === "audio") {
    return round(params.audioConfidence * 0.72 + params.agreementScore * 0.28);
  }
  if (params.selectedSource === "phrase") {
    return round(params.phraseConfidence * 0.72 + params.agreementScore * 0.28);
  }
  return round(
    avgConfidence * 0.5 +
      params.agreementScore * 0.2 +
      Math.max(0, 20 - params.confidenceGap) * 0.3,
  );
}

export function resolveStructuralArbitration(params: {
  phraseWindowPrediction: SongSection;
  audioEvidencePrediction: SongSection;
  phraseConfidence: number;
  audioConfidence: number;
  agreementScore: number;
}): StructuralArbitrationResult {
  const phraseConfidence = round(params.phraseConfidence);
  const audioConfidence = round(params.audioConfidence);
  const agreementScore = round(params.agreementScore);
  const confidenceGap = Math.abs(phraseConfidence - audioConfidence);
  const predictionsDiffer = params.phraseWindowPrediction !== params.audioEvidencePrediction;

  const arbitrationReason: string[] = [
    `Phrase window predicts ${formatSection(params.phraseWindowPrediction)} (${phraseConfidence.toFixed(0)} confidence).`,
    `Audio evidence predicts ${formatSection(params.audioEvidencePrediction)} (${audioConfidence.toFixed(0)} confidence).`,
    `Structural agreement ${agreementScore.toFixed(0)}%.`,
  ];

  if (agreementScore >= CONVERGED_AGREEMENT_THRESHOLD) {
    arbitrationReason.push("Phrase and audio converged; arbitration defers to agreed section.");
    return {
      selectedSource: "converged",
      selectedSection: params.phraseWindowPrediction,
      arbitrationConfidence: computeArbitrationConfidence({
        selectedSource: "converged",
        agreementScore,
        phraseConfidence,
        audioConfidence,
        confidenceGap,
      }),
      arbitrationReason,
      phraseConfidence,
      audioConfidence,
      agreementScore,
      overrideApplied: false,
    };
  }

  if (audioConfidence >= phraseConfidence + CONFIDENCE_GAP_THRESHOLD) {
    arbitrationReason.push(
      `Audio confidence leads phrase by ${(audioConfidence - phraseConfidence).toFixed(0)} points; audio source selected.`,
    );
    if (predictionsDiffer) {
      arbitrationReason.push("Override applied: audio evidence supersedes phrase window prediction.");
    }
    return {
      selectedSource: "audio",
      selectedSection: params.audioEvidencePrediction,
      arbitrationConfidence: computeArbitrationConfidence({
        selectedSource: "audio",
        agreementScore,
        phraseConfidence,
        audioConfidence,
        confidenceGap,
      }),
      arbitrationReason,
      phraseConfidence,
      audioConfidence,
      agreementScore,
      overrideApplied: predictionsDiffer,
    };
  }

  if (phraseConfidence >= audioConfidence + CONFIDENCE_GAP_THRESHOLD) {
    arbitrationReason.push(
      `Phrase confidence leads audio by ${(phraseConfidence - audioConfidence).toFixed(0)} points; phrase source selected.`,
    );
    if (predictionsDiffer) {
      arbitrationReason.push("Override applied: phrase window supersedes audio evidence prediction.");
    }
    return {
      selectedSource: "phrase",
      selectedSection: params.phraseWindowPrediction,
      arbitrationConfidence: computeArbitrationConfidence({
        selectedSource: "phrase",
        agreementScore,
        phraseConfidence,
        audioConfidence,
        confidenceGap,
      }),
      arbitrationReason,
      phraseConfidence,
      audioConfidence,
      agreementScore,
      overrideApplied: predictionsDiffer,
    };
  }

  const lowerRiskSection = resolveLowerRiskSection(
    params.phraseWindowPrediction,
    params.audioEvidencePrediction,
  );
  arbitrationReason.push(
    `Confidence gap ${confidenceGap.toFixed(0)} below ${CONFIDENCE_GAP_THRESHOLD}; tie-break uses structural transition safety graph.`,
  );
  arbitrationReason.push(
    `Lower-risk section selected: ${formatSection(lowerRiskSection)} (safety ${SECTION_TRANSITION_SAFETY[lowerRiskSection].toFixed(0)}).`,
  );
  if (predictionsDiffer) {
    arbitrationReason.push("Override applied: graph arbitration resolved phrase/audio disagreement.");
  }

  return {
    selectedSource: "low_risk_graph",
    selectedSection: lowerRiskSection,
    arbitrationConfidence: computeArbitrationConfidence({
      selectedSource: "low_risk_graph",
      agreementScore,
      phraseConfidence,
      audioConfidence,
      confidenceGap,
    }),
    arbitrationReason,
    phraseConfidence,
    audioConfidence,
    agreementScore,
    overrideApplied: predictionsDiffer,
  };
}
