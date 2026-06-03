import "server-only";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type VocalConflictAnalysis = {
  vocalDensity: number;
  overlapRisk: number;
  lyricalConflictRisk: number;
  hookCollisionRisk: number;
  vocalDominance: number;
  transitionSafety: number;
  recommendation: "safe_blend" | "instrumental_overlap_only" | "cut_vocals" | "delay_transition";
};

export function analyzeVocalConflict(params: {
  vocalOverlapRisk: number;
  vocalClashScore: number;
  speechiness?: number;
  instrumentalness?: number;
  phraseCompatibility?: string;
  phraseWindow?: string;
}): VocalConflictAnalysis {
  const speech = clamp((params.speechiness ?? 0.35) * 100, 0, 100);
  const instrumental = clamp((params.instrumentalness ?? 0.4) * 100, 0, 100);
  const vocalDensity = Number(clamp(speech * 0.65 + (100 - instrumental) * 0.35, 0, 100).toFixed(2));

  let overlapRisk = Number(
    clamp(params.vocalOverlapRisk * 0.55 + (100 - params.vocalClashScore) * 0.35 + vocalDensity * 0.1, 0, 100).toFixed(2),
  );

  const chorusOnChorus =
    params.phraseCompatibility === "vocal_overlap_risk" ||
    (params.phraseWindow === "chorus" && vocalDensity >= 58);
  if (chorusOnChorus) {
    overlapRisk = Number(clamp(overlapRisk + 22, 0, 100).toFixed(2));
    console.log("[AUDIO] vocal collision elevated");
  }

  const hookCollisionRisk = Number(
    clamp(overlapRisk * 0.7 + (chorusOnChorus ? 24 : 0), 0, 100).toFixed(2),
  );
  const lyricalConflictRisk = Number(clamp(overlapRisk * 0.85 + speech * 0.15, 0, 100).toFixed(2));
  const vocalDominance = Number(clamp(vocalDensity * 0.6 + overlapRisk * 0.4, 0, 100).toFixed(2));
  const transitionSafety = Number(clamp(100 - overlapRisk * 0.65 - hookCollisionRisk * 0.35, 0, 100).toFixed(2));

  let recommendation: VocalConflictAnalysis["recommendation"] = "safe_blend";
  if (overlapRisk >= 72 || hookCollisionRisk >= 68) {
    recommendation = "delay_transition";
  } else if (overlapRisk >= 55) {
    recommendation = instrumental >= 55 ? "instrumental_overlap_only" : "cut_vocals";
  } else if (instrumental >= 62 && overlapRisk < 45) {
    recommendation = "instrumental_overlap_only";
  }

  return {
    vocalDensity,
    overlapRisk,
    lyricalConflictRisk,
    hookCollisionRisk,
    vocalDominance,
    transitionSafety,
    recommendation,
  };
}
