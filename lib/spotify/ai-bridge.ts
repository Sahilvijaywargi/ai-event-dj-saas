import "server-only";

import {
  AIEnhancedTrackRecommendation,
  QueueRecommendationWithMeta,
} from "@/lib/ai/queue-engine";
import {
  getSpotifyAudioFeatures,
  getSpotifyRecommendations,
  getSpotifyConnectionStatus,
  searchSpotify,
} from "@/lib/spotify/service";
import { toAudioFeatureIntelligence } from "@/lib/spotify/audio-feature-intelligence";
import { SpotifyRecommendation } from "@/lib/spotify/types";

type Momentum = QueueRecommendationWithMeta["crowdMomentum"];
type EnergyBucket = NonNullable<AIEnhancedTrackRecommendation["contextSnapshot"]>["energyBucket"];

type BridgeSeedConfig = {
  seedTracks: string[];
  seedArtists: string[];
  seedGenres: string[];
  targetEnergy: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeGenre(genre: string) {
  return genre.trim().toLowerCase().replace(/\s+/g, "-");
}

function momentumTargetShift(momentum: Momentum) {
  if (momentum === "surging") return 0.8;
  if (momentum === "rising") return 0.4;
  if (momentum === "low") return -0.5;
  return 0;
}

function bpmCompatibility(targetBpm: number, candidateBpm: number) {
  const delta = Math.abs(targetBpm - candidateBpm);
  return clamp(100 - delta * 3, 0, 100);
}

function energyCompatibility(targetEnergy: number, candidateEnergy: number) {
  const delta = Math.abs(targetEnergy - candidateEnergy);
  return clamp(100 - delta * 20, 0, 100);
}

function genreBlendingScore(
  recommendation: QueueRecommendationWithMeta,
  spotifyTrack: SpotifyRecommendation,
) {
  const phase = recommendation.currentMoodPhase.toLowerCase();

  const combined =
    `${spotifyTrack.name} ${spotifyTrack.artistName}`.toLowerCase();

  let score = 50;

  const preferredGenres = recommendation.recommendedQueue
    .map((track) => track.genre.toLowerCase());

  for (const genre of preferredGenres) {
    if (combined.includes(genre)) {
      score += 12;
    }
  }

  if (
    phase.includes("peak") ||
    phase.includes("drop")
  ) {
    if (
      combined.includes("festival") ||
      combined.includes("dance") ||
      combined.includes("edm") ||
      combined.includes("club")
    ) {
      score += 15;
    }
  }

  if (
    phase.includes("warm") ||
    phase.includes("opening")
  ) {
    if (
      combined.includes("chill") ||
      combined.includes("lofi") ||
      combined.includes("deep")
    ) {
      score += 15;
    }
  }

  return clamp(score, 0, 100);
}
function transitionSmoothnessScore(bpmScore: number, energyScore: number) {
  return clamp((bpmScore * 0.6 + energyScore * 0.4), 0, 100);
}

function crowdMomentumFit(momentum: Momentum, candidateEnergy: number, targetEnergy: number) {
  const desiredEnergy = clamp(targetEnergy + momentumTargetShift(momentum), 1, 10);
  const delta = Math.abs(desiredEnergy - candidateEnergy);
  return clamp(100 - delta * 18, 0, 100);
}

function crowdMomentumFromProjection(projection: number): Momentum {
  if (projection >= 78) return "surging";
  if (projection >= 62) return "rising";
  if (projection <= 38) return "low";
  return "steady";
}

function normalizeEnergyBucket(energy: number): EnergyBucket {
  const safe = clamp(Math.round(energy), 1, 10);
  if (safe <= 2) return "very-low";
  if (safe <= 4) return "low";
  if (safe <= 6) return "medium";
  if (safe <= 8) return "high";
  return "very-high";
}

async function buildSeedConfig(
  userId: string,
  recommendation: QueueRecommendationWithMeta,
): Promise<BridgeSeedConfig> {
  const seedGenres = recommendation.recommendedQueue
    .map((track) => normalizeGenre(track.genre))
    .filter(Boolean)
    .slice(0, 5);

  const topQueue = recommendation.recommendedQueue.slice(0, 2);
  const seedTracks: string[] = [];
  const seedArtists: string[] = [];

  for (const queueTrack of topQueue) {
    const [trackResult] = await searchSpotify(
      userId,
      `${queueTrack.title} ${queueTrack.artist}`,
      "track",
    );
    if (trackResult?.id) seedTracks.push(trackResult.id);
    const [artistResult] = await searchSpotify(userId, queueTrack.artist, "artist");
    if (artistResult?.id) seedArtists.push(artistResult.id);
  }

  return {
    seedTracks: seedTracks.slice(0, 5),
    seedArtists: seedArtists.slice(0, 5),
    seedGenres,
    targetEnergy: recommendation.currentEnergy,
  };
}

export async function createSpotifyEnhancedRecommendations(params: {
  userId: string;
  recommendation: QueueRecommendationWithMeta;
}) {
  const { userId, recommendation } = params;
  const connection = await getSpotifyConnectionStatus(userId);
  if (!connection) {
    return {
      ok: false as const,
      reason: "Spotify account not connected.",
      enhanced: [] as AIEnhancedTrackRecommendation[],
    };
  }

  try {
    const seedConfig = await buildSeedConfig(userId, recommendation);
    const spotifyRecommendations = await getSpotifyRecommendations({
      userId,
      seedTracks: seedConfig.seedTracks,
      seedArtists: seedConfig.seedArtists,
      seedGenres: seedConfig.seedGenres,
      targetEnergy: seedConfig.targetEnergy,
    });

    const audioFeatures = await getSpotifyAudioFeatures(
      userId,
      spotifyRecommendations.map((track) => track.id),
    );
    const featuresByTrack = new Map(audioFeatures.map((feature) => [feature.id, feature]));

    const targetBpm =
      recommendation.bpmFlow.length > 0
        ? Math.round(
            recommendation.bpmFlow.reduce((sum, range) => sum + (range.min + range.max) / 2, 0) /
              recommendation.bpmFlow.length,
          )
        : 115;
    const targetEnergy = recommendation.currentEnergy;

    const enhanced: AIEnhancedTrackRecommendation[] = spotifyRecommendations.map((candidate) => {
      const feature = featuresByTrack.get(candidate.id);
      const featureIntelligence = toAudioFeatureIntelligence(feature);
      const candidateBpm = feature?.tempo ? Math.round(feature.tempo) : targetBpm;
      const candidateEnergy = feature?.energy
        ? clamp(Number((feature.energy * 10).toFixed(2)), 1, 10)
        : targetEnergy;
      const danceability = feature?.danceability ?? 0.5;
      const valence = feature?.valence ?? 0.5;
      const crowdMomentumProjection = featureIntelligence?.crowdMomentumProjection ?? 50;
      const projectedMomentum = crowdMomentumFromProjection(crowdMomentumProjection);

      const bpmScore = bpmCompatibility(targetBpm, candidateBpm);
      const energyScore = energyCompatibility(targetEnergy, candidateEnergy);
      const genreScore = genreBlendingScore(
        recommendation,
        candidate,
      );
      const smoothness = transitionSmoothnessScore(bpmScore, energyScore);
      const momentumScore = crowdMomentumFit(
        projectedMomentum,
        candidateEnergy,
        targetEnergy,
      );
      const total = Number(
        (
          bpmScore * 0.25 +
          energyScore * 0.25 +
          genreScore * 0.2 +
          smoothness * 0.15 +
          momentumScore * 0.15
        ).toFixed(2),
      );

      const track: AIEnhancedTrackRecommendation = {
        id: candidate.id,
        name: candidate.name,
        artistName: candidate.artistName,
        bpm: candidateBpm,
        energy: candidateEnergy,
        aiConfidence: clamp(Math.round(total), 0, 100),
        transitionReason: `Balanced transition fit for ${recommendation.currentMoodPhase} phase with ${recommendation.crowdMomentum} momentum.`,
        sourceType: "spotify_recommendation" as const,
        sourceLabel: connection.display_name,
        contextSnapshot: {
          eventPhase: recommendation.currentMoodPhase,
          bpmLane: recommendation.bpmFlow[0] ?? { min: targetBpm - 6, max: targetBpm + 6 },
          crowdMomentumBucket: projectedMomentum,
          energyBucket: normalizeEnergyBucket(recommendation.currentEnergy),
        },
        audioFeatures: featureIntelligence ?? undefined,
        structuralMetadata: {
          introLengthBars: 16,
          outroLengthBars: 16,
          phraseLength: 16,
          dropIntensity: Number(clamp((feature?.energy ?? 0.5) * 10, 1, 10).toFixed(2)),
          breakdownPresence: (feature?.valence ?? 0.5) < 0.45,
          vocalSections: (feature?.speechiness ?? 0.12) >= 0.33 ? 2 : 1,
          instrumentalSections: (feature?.instrumentalness ?? 0.25) >= 0.35 ? 3 : 2,
          beatGridResolution: 16,
          barAlignmentConfidence: Number(clamp((feature?.danceability ?? 0.5) * 100, 45, 96).toFixed(2)),
          cuePointCandidates: [8, 16, 24, 32],
          transitionWindows: [
            { startBar: 8, endBar: 16, confidence: 78 },
            { startBar: 24, endBar: 32, confidence: 74 },
          ],
          dropTimingMarkers: [16, 32],
          estimatedMixInPoint: 8,
          estimatedMixOutPoint: 24,
        },
        scoreBreakdown: {
          bpmCompatibility: Number(bpmScore.toFixed(2)),
          energyCompatibility: Number(
            clamp(
              energyScore * 0.7 + danceability * 100 * 0.2 + valence * 100 * 0.1,
              0,
              100,
            ).toFixed(2),
          ),
          genreBlending: Number(genreScore.toFixed(2)),
          transitionSmoothness: Number(smoothness.toFixed(2)),
          crowdMomentumFit: Number(momentumScore.toFixed(2)),
          total,
        },
      };
      return track;
    });

    enhanced.sort((a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total);
    return {
      ok: true as const,
      reason: null,
      enhanced: enhanced.slice(0, 12),
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: error instanceof Error ? error.message : "Spotify bridge failed.",
      enhanced: [] as AIEnhancedTrackRecommendation[],
    };
  }
}

