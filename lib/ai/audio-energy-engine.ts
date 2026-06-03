import "server-only";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type AudioEnergyAnalysis = {
  energyCurve: number[];
  averageEnergy: number;
  peakEnergy: number;
  dropIntensity: number;
  tensionBuildScore: number;
  releaseStrength: number;
  crowdImpactProbability: number;
  volatility: number;
  pacingStability: number;
  reasoning: string[];
};

export function analyzeAudioEnergy(params: {
  currentEnergy: number;
  candidateEnergy: number;
  danceability?: number;
  dropIntensity?: number;
  narrativeEnergyArc?: number;
  crowdMomentum?: number;
  phraseWindow?: "intro" | "buildup" | "chorus" | "outro" | "phrase_boundary" | "unstable";
}): AudioEnergyAnalysis {
  console.log("[AUDIO] energy analysis started");

  const currentNorm = clamp(params.currentEnergy / 10, 0, 1);
  const candidateNorm = clamp(params.candidateEnergy / 10, 0, 1);
  const dance = clamp((params.danceability ?? 0.55) * 100, 0, 100);
  const drop = clamp(params.dropIntensity ?? candidateNorm * 85, 0, 100);

  const energyCurve = [
    Number((currentNorm * 100).toFixed(1)),
    Number((currentNorm * 88 + candidateNorm * 12).toFixed(1)),
    Number((currentNorm * 62 + candidateNorm * 38).toFixed(1)),
    Number((currentNorm * 35 + candidateNorm * 65).toFixed(1)),
    Number((candidateNorm * 100).toFixed(1)),
  ];

  const averageEnergy = Number(
    (energyCurve.reduce((s, v) => s + v, 0) / energyCurve.length).toFixed(2),
  );
  const peakEnergy = Math.max(...energyCurve);
  const energyDelta = Math.abs(candidateNorm - currentNorm);

  const tensionBuildScore = Number(
    clamp(
      (params.phraseWindow === "buildup" ? 22 : 0) +
        drop * 0.35 +
        (params.narrativeEnergyArc ?? 50) * 0.25 +
        energyDelta * 40,
      0,
      100,
    ).toFixed(2),
  );

  const releaseStrength = Number(
    clamp(
      (params.phraseWindow === "outro" || params.phraseWindow === "phrase_boundary" ? 18 : 0) +
        (100 - tensionBuildScore) * 0.45 +
        dance * 0.2,
      0,
      100,
    ).toFixed(2),
  );

  const volatility = Number(clamp(energyDelta * 95 + (peakEnergy - averageEnergy) * 0.4, 0, 100).toFixed(2));
  const pacingStability = Number(clamp(100 - volatility * 0.75 - (energyDelta > 0.35 ? 18 : 0), 0, 100).toFixed(2));

  const crowdImpactProbability = Number(
    clamp(
      releaseStrength * 0.35 +
        (params.crowdMomentum ?? 50) * 0.35 +
        drop * 0.2 +
        pacingStability * 0.1,
      0,
      100,
    ).toFixed(2),
  );

  const reasoning: string[] = [];
  if (tensionBuildScore >= 68) reasoning.push("energy buildup sustained");
  if (releaseStrength < 45) reasoning.push("drop release unstable");
  if (volatility >= 62) reasoning.push("high volatility detected");
  if (crowdImpactProbability < 48) reasoning.push("crowd fatigue risk elevated");

  return {
    energyCurve,
    averageEnergy,
    peakEnergy,
    dropIntensity: drop,
    tensionBuildScore,
    releaseStrength,
    crowdImpactProbability,
    volatility,
    pacingStability,
    reasoning,
  };
}
