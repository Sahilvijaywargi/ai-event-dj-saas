import "server-only";

import { analyzeAudioEnergy, type AudioEnergyAnalysis } from "@/lib/ai/audio-energy-engine";
import { analyzeVocalConflict, type VocalConflictAnalysis } from "@/lib/ai/vocal-conflict-engine";
import {
  analyzeSpectralCompatibility,
  type SpectralCompatibilityAnalysis,
} from "@/lib/ai/spectral-compatibility-engine";
import { analyzeDropTransition, type DropTransitionAnalysis } from "@/lib/ai/drop-transition-engine";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type AudioIntelligenceResult = {
  energy: AudioEnergyAnalysis;
  vocal: VocalConflictAnalysis;
  spectral: SpectralCompatibilityAnalysis;
  drop: DropTransitionAnalysis;
  audioMixabilityScore: number;
  audioTransitionRisk: number;
  grooveContinuity: number;
  audioConfidence: number;
  recoveryRecommendations: string[];
  reasoning: string[];
};

export type AudioIntelligenceInput = {
  currentEnergy: number;
  candidateEnergy: number;
  currentBpm: number;
  candidateBpm: number;
  danceability?: number;
  speechiness?: number;
  instrumentalness?: number;
  valence?: number;
  currentValence?: number;
  dropIntensity?: number;
  vocalOverlapRisk: number;
  vocalClashScore: number;
  phraseCompatibility?: string;
  phraseWindow?: string;
  emotionalContinuity: number;
  crowdMomentum?: number;
  narrativeEnergyArc?: number;
  syncCompatibility?: string;
  bassHeavyCurrent?: boolean;
  bassHeavyCandidate?: boolean;
};

export function analyzeAudioIntelligence(params: AudioIntelligenceInput): AudioIntelligenceResult {
  const energy = analyzeAudioEnergy({
    currentEnergy: params.currentEnergy,
    candidateEnergy: params.candidateEnergy,
    danceability: params.danceability,
    dropIntensity: params.dropIntensity,
    narrativeEnergyArc: params.narrativeEnergyArc,
    crowdMomentum: params.crowdMomentum,
    phraseWindow: params.phraseWindow as
      | "intro"
      | "buildup"
      | "chorus"
      | "outro"
      | "phrase_boundary"
      | "unstable"
      | undefined,
  });

  const vocal = analyzeVocalConflict({
    vocalOverlapRisk: params.vocalOverlapRisk,
    vocalClashScore: params.vocalClashScore,
    speechiness: params.speechiness,
    instrumentalness: params.instrumentalness,
    phraseCompatibility: params.phraseCompatibility,
    phraseWindow: params.phraseWindow,
  });

  const spectral = analyzeSpectralCompatibility({
    bpmDelta: params.candidateBpm - params.currentBpm,
    energyDelta: params.candidateEnergy - params.currentEnergy,
    danceability: params.danceability,
    valenceDelta: (params.valence ?? 0.5) - (params.currentValence ?? 0.5),
    bassHeavyCurrent: params.bassHeavyCurrent,
    bassHeavyCandidate: params.bassHeavyCandidate,
  });

  const drop = analyzeDropTransition({
    dropIntensityCurrent: energy.averageEnergy,
    dropIntensityCandidate: energy.dropIntensity,
    tensionBuildScore: energy.tensionBuildScore,
    releaseStrength: energy.releaseStrength,
    emotionalContinuity: params.emotionalContinuity,
    crowdMomentum: params.crowdMomentum,
    syncCompatibility: params.syncCompatibility,
  });

  const grooveContinuity = spectral.grooveCompatibility;
  const audioMixabilityScore = Number(
    clamp(
      spectral.mixabilityScore * 0.28 +
        vocal.transitionSafety * 0.24 +
        drop.survivability * 0.22 +
        grooveContinuity * 0.16 +
        energy.pacingStability * 0.1,
      0,
      100,
    ).toFixed(2),
  );

  const audioTransitionRisk = Number(
    clamp(
      vocal.overlapRisk * 0.28 +
        spectral.bassMaskingRisk * 0.22 +
        drop.risk * 0.22 +
        spectral.transientConflict * 0.14 +
        energy.volatility * 0.14,
      0,
      100,
    ).toFixed(2),
  );

  const audioConfidence = Number(
    clamp(audioMixabilityScore - audioTransitionRisk * 0.45 + 12, 0, 100).toFixed(2),
  );

  const recoveryRecommendations: string[] = [];
  if (vocal.recommendation === "delay_transition") recoveryRecommendations.push("delay_blend");
  if (vocal.recommendation === "cut_vocals") recoveryRecommendations.push("cut_vocals_earlier");
  if (vocal.recommendation === "instrumental_overlap_only") {
    recoveryRecommendations.push("force_instrumental_entry");
    console.log("[MIXABILITY] safe instrumental overlap selected");
  }
  if (spectral.recommendation === "bass_swap_required") recoveryRecommendations.push("reduce_bass_overlap");
  if (spectral.recommendation === "eq_required") recoveryRecommendations.push("widen_transition");
  if (grooveContinuity < 50) recoveryRecommendations.push("cadence_stabilization");

  const reasoning = [
    ...energy.reasoning,
    `Audio mixability ${audioMixabilityScore.toFixed(0)}; transition risk ${audioTransitionRisk.toFixed(0)}.`,
    `Vocal recommendation: ${vocal.recommendation.replace(/_/g, " ")}.`,
    `Spectral recommendation: ${spectral.recommendation.replace(/_/g, " ")}.`,
    `Drop survivability ${drop.survivability.toFixed(0)}.`,
  ];

  if (audioMixabilityScore < 52) {
    console.log("[MIXABILITY] continuity degraded");
  }

  return {
    energy,
    vocal,
    spectral,
    drop,
    audioMixabilityScore,
    audioTransitionRisk,
    grooveContinuity,
    audioConfidence,
    recoveryRecommendations,
    reasoning,
  };
}

export type AudioMixRecoveryResult = {
  recovered: boolean;
  mixabilityDelta: number;
  riskReduction: number;
  strategy: string;
  reasoning: string[];
};

export function attemptAudioMixRecovery(params: {
  audio: AudioIntelligenceResult;
}): AudioMixRecoveryResult {
  const strategies = params.audio.recoveryRecommendations;
  const reasoning: string[] = [];
  let riskReduction = 0;
  let mixabilityDelta = 0;

  if (strategies.includes("delay_blend")) {
    riskReduction += 12;
    mixabilityDelta += 8;
    reasoning.push("Delayed blend reduces vocal overlap pressure.");
  }
  if (strategies.includes("force_instrumental_entry")) {
    riskReduction += 18;
    mixabilityDelta += 14;
    reasoning.push("Instrumental entry window selected for safer overlap.");
  }
  if (strategies.includes("reduce_bass_overlap")) {
    riskReduction += 10;
    mixabilityDelta += 9;
    reasoning.push("Bass overlap reduction improves spectral cleanliness.");
  }
  if (strategies.includes("widen_transition")) {
    riskReduction += 8;
    mixabilityDelta += 10;
    reasoning.push("Widened transition reduces transient stacking.");
  }
  if (strategies.includes("cut_vocals_earlier")) {
    riskReduction += 14;
    mixabilityDelta += 6;
    reasoning.push("Earlier vocal cut avoids hook-on-hook collision.");
  }

  const recovered =
    mixabilityDelta >= 8 &&
    params.audio.audioMixabilityScore + mixabilityDelta >= 55 &&
    params.audio.audioTransitionRisk - riskReduction < 65;

  return {
    recovered,
    mixabilityDelta,
    riskReduction,
    strategy: strategies[0] ?? "hold_blend",
    reasoning,
  };
}

export function applyAudioIntelligenceInfluence(params: {
  orchestrationSynthesisConfidence: number;
  cadenceStability: number;
  phraseTimingRisk: number;
  confidenceScore: number;
  rollbackReadiness: number;
  audio: AudioIntelligenceResult;
}): {
  orchestrationSynthesisConfidence: number;
  cadenceStability: number;
  phraseTimingRisk: number;
  confidenceScore: number;
  rollbackReadiness: number;
} {
  const mixBoost = (params.audio.audioMixabilityScore - 50) * 0.12;
  const riskPenalty = params.audio.audioTransitionRisk * 0.08;

  return {
    orchestrationSynthesisConfidence: Number(
      clamp(params.orchestrationSynthesisConfidence + mixBoost - riskPenalty * 0.5, 0, 100).toFixed(2),
    ),
    cadenceStability: Number(
      clamp(params.cadenceStability + params.audio.grooveContinuity * 0.08 - riskPenalty * 0.3, 0, 100).toFixed(2),
    ),
    phraseTimingRisk: Number(
      clamp(params.phraseTimingRisk + params.audio.vocal.overlapRisk * 0.06 - mixBoost * 0.4, 0, 100).toFixed(2),
    ),
    confidenceScore: Number(clamp(params.confidenceScore + mixBoost - riskPenalty, 0, 100).toFixed(2)),
    rollbackReadiness: Number(
      clamp(
        params.rollbackReadiness +
          (params.audio.drop.survivability > 60 ? 4 : -2) -
          (params.audio.spectral.recommendation === "unsafe_overlap" ? 8 : 0),
        0,
        100,
      ).toFixed(2),
    ),
  };
}
