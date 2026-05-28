import { SpotifyAudioFeatures } from "@/lib/spotify/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function convertSpotifyKeyToCamelot(params: {
  key?: number | null;
  mode?: number | null;
}) {
  const { key, mode } = params;
  if (typeof key !== "number" || key < 0 || key > 11) return null;
  if (typeof mode !== "number" || (mode !== 0 && mode !== 1)) return null;

  // Spotify pitch class: C=0..B=11, mode: 1 major / 0 minor.
  const majorMap = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
  const minorMap = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
  const hour = mode === 1 ? majorMap[key] : minorMap[key];
  const lane = mode === 1 ? "B" : "A";
  return `${hour}${lane}`;
}

export function deriveVocalDensityScore(speechiness?: number | null) {
  return Number(clamp((speechiness ?? 0) * 100, 0, 100).toFixed(2));
}

export function deriveInstrumentalBlendConfidence(params: {
  instrumentalness?: number | null;
  speechiness?: number | null;
}) {
  const instrumental = clamp(params.instrumentalness ?? 0, 0, 1);
  const speech = clamp(params.speechiness ?? 0, 0, 1);
  return Number(clamp((instrumental * 0.75 + (1 - speech) * 0.25) * 100, 0, 100).toFixed(2));
}

export function deriveCrowdMomentumProjection(params: {
  energy?: number | null;
  danceability?: number | null;
  valence?: number | null;
}) {
  const energy = clamp(params.energy ?? 0.5, 0, 1);
  const danceability = clamp(params.danceability ?? 0.5, 0, 1);
  const valence = clamp(params.valence ?? 0.5, 0, 1);
  return Number(clamp((energy * 0.5 + danceability * 0.3 + valence * 0.2) * 100, 0, 100).toFixed(2));
}

export function toAudioFeatureIntelligence(feature?: SpotifyAudioFeatures | null) {
  if (!feature) return null;
  return {
    tempo: Number(feature.tempo.toFixed(2)),
    energy: Number(feature.energy.toFixed(4)),
    danceability: Number(feature.danceability.toFixed(4)),
    valence: Number(feature.valence.toFixed(4)),
    speechiness: Number(feature.speechiness.toFixed(4)),
    acousticness: Number(feature.acousticness.toFixed(4)),
    instrumentalness: Number(feature.instrumentalness.toFixed(4)),
    key: feature.key,
    mode: feature.mode,
    camelotKey: convertSpotifyKeyToCamelot({ key: feature.key, mode: feature.mode }),
    vocalDensityScore: deriveVocalDensityScore(feature.speechiness),
    instrumentalBlendConfidence: deriveInstrumentalBlendConfidence({
      instrumentalness: feature.instrumentalness,
      speechiness: feature.speechiness,
    }),
    crowdMomentumProjection: deriveCrowdMomentumProjection({
      energy: feature.energy,
      danceability: feature.danceability,
      valence: feature.valence,
    }),
  };
}
