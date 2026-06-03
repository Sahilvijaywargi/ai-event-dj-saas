import "server-only";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type SpectralCompatibilityAnalysis = {
  lowEndCollision: number;
  bassMaskingRisk: number;
  transientConflict: number;
  brightnessConflict: number;
  grooveCompatibility: number;
  spectralContinuity: number;
  mixabilityScore: number;
  recommendation: "clean_mix" | "eq_required" | "bass_swap_required" | "unsafe_overlap";
};

export function analyzeSpectralCompatibility(params: {
  bpmDelta: number;
  energyDelta: number;
  danceability?: number;
  valenceDelta?: number;
  bassHeavyCurrent?: boolean;
  bassHeavyCandidate?: boolean;
}): SpectralCompatibilityAnalysis {
  const bpmStress = clamp(Math.abs(params.bpmDelta) * 8, 0, 48);
  const energyStress = clamp(Math.abs(params.energyDelta) * 22, 0, 40);

  const lowEndCollision = Number(
    clamp(
      bpmStress * 0.45 +
        energyStress * 0.35 +
        (params.bassHeavyCurrent && params.bassHeavyCandidate ? 28 : 0),
      0,
      100,
    ).toFixed(2),
  );

  const bassMaskingRisk = Number(
    clamp(lowEndCollision * 0.75 + (params.bassHeavyCurrent && params.bassHeavyCandidate ? 18 : 0), 0, 100).toFixed(2),
  );

  if (bassMaskingRisk >= 60) {
    console.log("[AUDIO] spectral masking detected");
  }

  const transientConflict = Number(
    clamp(bpmStress * 0.55 + (params.danceability ?? 0.5) * 20 + energyStress * 0.25, 0, 100).toFixed(2),
  );

  const brightnessConflict = Number(
    clamp(Math.abs(params.valenceDelta ?? 0.15) * 120 + energyStress * 0.4, 0, 100).toFixed(2),
  );

  const grooveCompatibility = Number(
    clamp(
      (params.danceability ?? 0.55) * 100 * 0.5 +
        (100 - transientConflict) * 0.3 +
        (100 - bpmStress * 1.2) * 0.2,
      0,
      100,
    ).toFixed(2),
  );

  if (grooveCompatibility < 48) {
    console.log("[AUDIO] groove instability detected");
  }

  const spectralContinuity = Number(
    clamp(
      grooveCompatibility * 0.35 +
        (100 - lowEndCollision) * 0.3 +
        (100 - brightnessConflict) * 0.2 +
        (100 - transientConflict) * 0.15,
      0,
      100,
    ).toFixed(2),
  );

  const mixabilityScore = Number(
    clamp(spectralContinuity * 0.55 + grooveCompatibility * 0.25 + (100 - bassMaskingRisk) * 0.2, 0, 100).toFixed(2),
  );

  let recommendation: SpectralCompatibilityAnalysis["recommendation"] = "clean_mix";
  if (mixabilityScore < 42 || bassMaskingRisk >= 72) recommendation = "unsafe_overlap";
  else if (bassMaskingRisk >= 58) recommendation = "bass_swap_required";
  else if (lowEndCollision >= 52 || transientConflict >= 58) recommendation = "eq_required";

  return {
    lowEndCollision,
    bassMaskingRisk,
    transientConflict,
    brightnessConflict,
    grooveCompatibility,
    spectralContinuity,
    mixabilityScore,
    recommendation,
  };
}
