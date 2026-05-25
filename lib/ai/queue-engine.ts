import { EventPlanView } from "@/lib/events/types";

export type MoodPhase = "warmup" | "social" | "build" | "peak" | "cooldown";

export type BpmRange = {
  min: number;
  max: number;
};

export type EnergyScore = {
  current: number;
  target: number;
  crowdMomentum: "low" | "steady" | "rising" | "surging";
};

export type TransitionCompatibility = {
  score: number;
  reason: string;
};

export type QueueTrack = {
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  energy: number;
  moodPhase: MoodPhase;
  transitionCompatibility: TransitionCompatibility;
};

export type AIEnhancedTrackRecommendation = {
  id: string;
  name: string;
  artistName: string;
  bpm: number;
  energy: number;
  aiConfidence: number;
  transitionReason: string;
  sourceType: "spotify_recommendation";
  sourceLabel: string;
  contextSnapshot?: {
    eventPhase: string;
    bpmLane: { min: number; max: number };
    crowdMomentumBucket: "low" | "steady" | "rising" | "surging";
    energyBucket: "very-low" | "low" | "medium" | "high" | "very-high";
  };
  scoreBreakdown: {
    bpmCompatibility: number;
    energyCompatibility: number;
    genreBlending: number;
    transitionSmoothness: number;
    crowdMomentumFit: number;
    total: number;
  };
};

export type QueueRecommendation = {
  planId: string;
  eventName: string;
  eventType: string;
  currentMoodPhase: MoodPhase;
  bpmFlow: BpmRange[];
  energyCurve: number[];
  currentEnergy: number;
  crowdMomentum: EnergyScore["crowdMomentum"];
  nextRecommendedTransition: string;
  recommendedQueue: QueueTrack[];
  spotifyEnhancedRecommendations?: AIEnhancedTrackRecommendation[];
};

export type QueueSnapshotRecord = {
  id: string;
  user_id: string;
  event_plan_id: string;
  created_at: string;
  queue_data: QueueRecommendation;
  current_phase: MoodPhase;
  average_bpm: number;
  average_energy: number;
  crowd_momentum: EnergyScore["crowdMomentum"];
};

export type QueueRecommendationWithMeta = QueueRecommendation & {
  latestSnapshotId: string | null;
  latestGeneratedAt: string | null;
  queueVersionCount: number;
};

export type QueueGenerationContext = {
  previousSnapshots?: QueueSnapshotRecord[];
};

// Prepared for future OpenRouter integration: replace mock generation logic
// with an AI provider implementation that conforms to this interface.
export interface QueueEngineProvider {
  generateFromPlan(
    plan: EventPlanView,
    context?: QueueGenerationContext,
  ): Promise<QueueRecommendation>;
}

const phaseCatalog: MoodPhase[] = ["warmup", "social", "build", "peak", "cooldown"];

const genreTrackSeeds: Record<string, { artist: string; title: string }[]> = {
  house: [
    { artist: "Luma Nova", title: "Midnight Pulse" },
    { artist: "Kairo Flux", title: "Velvet Skyline" },
    { artist: "Monroe Decks", title: "Champagne Circuit" },
  ],
  pop: [
    { artist: "Ari Vale", title: "Neon Hearts" },
    { artist: "Elio Ray", title: "Starlight Echoes" },
    { artist: "Nova Bloom", title: "Electric Boulevard" },
  ],
  "r&b": [
    { artist: "Mira Lane", title: "Silk Frequency" },
    { artist: "Jules Coast", title: "Late Hour Glow" },
    { artist: "Soren Pax", title: "Afterparty Air" },
  ],
  afrobeats: [
    { artist: "Kemi Vibe", title: "Gold Rhythm" },
    { artist: "Tayo Lin", title: "Sunset Drums" },
    { artist: "Rico Ama", title: "Lagos Lights" },
  ],
  default: [
    { artist: "Orion Club", title: "Velocity Drive" },
    { artist: "Selene Mode", title: "Crystal Motion" },
    { artist: "Axiom Soul", title: "Night Arc" },
  ],
};

function inferMoodPhase(plan: EventPlanView): MoodPhase {
  const peak = Math.max(...plan.energyProgression.map((point) => point.level));
  const latest = plan.energyProgression[plan.energyProgression.length - 1]?.level ?? 5;
  if (latest >= peak - 1 && latest >= 8) return "peak";
  if (latest <= 4) return "cooldown";
  if (latest >= 6) return "build";
  return "social";
}

function bpmWindowForPhase(phase: MoodPhase, baseEnergy: number): BpmRange {
  const centerByPhase: Record<MoodPhase, number> = {
    warmup: 98,
    social: 108,
    build: 118,
    peak: 126,
    cooldown: 103,
  };
  const center = centerByPhase[phase] + Math.round((baseEnergy - 5) * 1.4);
  return { min: Math.max(86, center - 6), max: Math.min(136, center + 6) };
}

function momentumFromEnergyCurve(curve: number[]): EnergyScore["crowdMomentum"] {
  const start = curve[0] ?? 5;
  const end = curve[curve.length - 1] ?? start;
  const delta = end - start;
  if (delta >= 3) return "surging";
  if (delta >= 1) return "rising";
  if (delta <= -2) return "low";
  return "steady";
}

function pickSeed(genre: string, index: number) {
  const key = genre.toLowerCase();
  const collection = genreTrackSeeds[key] ?? genreTrackSeeds.default;
  return collection[index % collection.length];
}

function buildQueue(plan: EventPlanView, phase: MoodPhase, bpmFlow: BpmRange[]): QueueTrack[] {
  const genres = plan.recommendedGenres.length > 0 ? plan.recommendedGenres : ["House", "Pop"];
  const curve = plan.energyProgression.map((point) => point.level);

  return Array.from({ length: 6 }).map((_, index) => {
    const genre = genres[index % genres.length];
    const seed = pickSeed(genre, index);
    const bpmRange = bpmFlow[Math.min(index, bpmFlow.length - 1)];
    const bpm = bpmRange.min + Math.round(((bpmRange.max - bpmRange.min) * (index % 3)) / 2);
    const baseEnergy = curve[Math.min(index, curve.length - 1)] ?? 6;
    const score = Math.max(72, 96 - index * 3);

    return {
      title: seed.title,
      artist: seed.artist,
      genre,
      bpm,
      energy: Math.min(10, Math.max(1, baseEnergy)),
      moodPhase: phaseCatalog[Math.min(index, phaseCatalog.length - 1)],
      transitionCompatibility: {
        score,
        reason: "Compatible BPM lane and adjacent harmonic mood profile.",
      },
    };
  });
}

export function generateQueueFromPlan(plan: EventPlanView): QueueRecommendation {
  const currentMoodPhase = inferMoodPhase(plan);
  const energyCurve = plan.energyProgression.map((point) => point.level);
  const currentEnergy = energyCurve[energyCurve.length - 1] ?? 6;
  const crowdMomentum = momentumFromEnergyCurve(energyCurve);

  const bpmFlow = phaseCatalog.map((phase) => bpmWindowForPhase(phase, currentEnergy));
  const recommendedQueue = buildQueue(plan, currentMoodPhase, bpmFlow);
  const nextTrack = recommendedQueue[0];

  return {
    planId: plan.id,
    eventName: plan.eventName,
    eventType: plan.eventType,
    currentMoodPhase,
    bpmFlow,
    energyCurve,
    currentEnergy,
    crowdMomentum,
    nextRecommendedTransition: `${nextTrack.title} by ${nextTrack.artist} (${nextTrack.bpm} BPM)`,
    recommendedQueue,
  };
}

export class MockQueueEngineProvider implements QueueEngineProvider {
  async generateFromPlan(
    plan: EventPlanView,
    context?: QueueGenerationContext,
  ): Promise<QueueRecommendation> {
    void context;
    return generateQueueFromPlan(plan);
  }
}

export function getQueueAverages(recommendation: QueueRecommendation) {
  const totalBpm = recommendation.recommendedQueue.reduce((sum, track) => sum + track.bpm, 0);
  const totalEnergy = recommendation.recommendedQueue.reduce(
    (sum, track) => sum + track.energy,
    0,
  );
  const count = Math.max(recommendation.recommendedQueue.length, 1);

  return {
    averageBpm: Math.round(totalBpm / count),
    averageEnergy: Number((totalEnergy / count).toFixed(2)),
  };
}

