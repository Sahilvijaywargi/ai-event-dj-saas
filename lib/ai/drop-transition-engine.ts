import "server-only";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type DropTransitionAnalysis = {
  dropCompatibility: number;
  tensionContinuity: number;
  impactStability: number;
  emotionalCarryover: number;
  crowdReleaseAlignment: number;
  risk: number;
  survivability: number;
};

export function analyzeDropTransition(params: {
  dropIntensityCurrent?: number;
  dropIntensityCandidate?: number;
  tensionBuildScore: number;
  releaseStrength: number;
  emotionalContinuity: number;
  crowdMomentum?: number;
  syncCompatibility?: string;
}): DropTransitionAnalysis {
  const currentDrop = clamp(params.dropIntensityCurrent ?? 55, 0, 100);
  const candidateDrop = clamp(params.dropIntensityCandidate ?? 60, 0, 100);
  const dropDelta = Math.abs(candidateDrop - currentDrop);

  const dropCompatibility = Number(
    clamp(100 - dropDelta * 0.85 - (params.syncCompatibility === "drop_collision" ? 35 : 0), 0, 100).toFixed(2),
  );

  const tensionContinuity = Number(
    clamp(params.tensionBuildScore * 0.45 + params.releaseStrength * 0.35 + dropCompatibility * 0.2, 0, 100).toFixed(2),
  );

  const impactStability = Number(
    clamp(dropCompatibility * 0.5 + tensionContinuity * 0.35 + (100 - dropDelta * 1.1), 0, 100).toFixed(2),
  );

  const emotionalCarryover = Number(
    clamp(params.emotionalContinuity * 0.55 + tensionContinuity * 0.25 + impactStability * 0.2, 0, 100).toFixed(2),
  );

  const crowdReleaseAlignment = Number(
    clamp(
      params.releaseStrength * 0.4 +
        (params.crowdMomentum ?? 50) * 0.35 +
        emotionalCarryover * 0.25,
      0,
      100,
    ).toFixed(2),
  );

  const risk = Number(
    clamp(
      dropDelta * 0.55 +
        (impactStability < 50 ? 28 : 0) +
        (params.syncCompatibility === "drop_collision" ? 30 : 0),
      0,
      100,
    ).toFixed(2),
  );

  const survivability = Number(
    clamp(
      dropCompatibility * 0.3 +
        impactStability * 0.25 +
        emotionalCarryover * 0.2 +
        crowdReleaseAlignment * 0.15 +
        (100 - risk) * 0.1,
      0,
      100,
    ).toFixed(2),
  );

  if (survivability < 45) {
    console.log("[AUDIO] drop survivability unstable");
  }

  return {
    dropCompatibility,
    tensionContinuity,
    impactStability,
    emotionalCarryover,
    crowdReleaseAlignment,
    risk,
    survivability,
  };
}
