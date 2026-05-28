import "server-only";

import { AIEnhancedTrackRecommendation, QueueRecommendationWithMeta, QueueTrack } from "@/lib/ai/queue-engine";
import { getCrowdFeedbackSummary } from "@/lib/ai/crowd-feedback";
import { getAudioEnvironmentState } from "@/lib/audio/audio-energy";
import { getLiveSessionState, updateDjSession } from "@/lib/dj-session/engine";
import { RecommendationTelemetryItem } from "@/lib/spotify/telemetry-types";
import { getPlaybackOrchestrationState, queueAiRecommendedTrack } from "@/lib/spotify/device-orchestrator";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";
import { startSpotifyPlayback } from "@/lib/spotify/playback-service";
import { serveRecommendationDiagnostics } from "@/lib/spotify/diagnostics-serving";
import {
  computeLearnedOrchestrationBias,
  getRuntimeMemoryPatterns,
  RuntimeMemoryPattern,
  storeRuntimeMemoryPattern,
} from "@/lib/ai/runtime-memory";

export type TransitionRiskLevel = "low" | "medium" | "high";
export type CamelotCompatibility = "unknown" | "match" | "adjacent" | "relative" | "distant";
export type TransitionConfidence = {
  score: number;
  reasons: string[];
};

export type TransitionDecision = {
  shouldTransition: boolean;
  holdEnergy: boolean;
  rampEnergy: boolean;
  cooldownEnergy: boolean;
  reason: string;
};

export type TransitionExecutionPlan = {
  nextAction: "queue_next_track" | "advance_playback" | "hold_state" | "reject_unsafe_transition";
  targetTrackId: string | null;
  targetTrackLabel: string | null;
  targetPhase: string;
  targetEnergy: number;
  targetBpm: number;
};

type RuntimeCandidateTrack = QueueTrack & {
  spotifyTrackId?: string;
  camelotKey?: string | null;
  speechiness?: number | null;
  instrumentalness?: number | null;
  danceability?: number | null;
  valence?: number | null;
  crowdMomentumProjection?: number | null;
  vocalDensityScore?: number | null;
  instrumentalBlendConfidence?: number | null;
  introLengthBars?: number | null;
  outroLengthBars?: number | null;
  phraseLength?: number | null;
  dropIntensity?: number | null;
  breakdownPresence?: boolean | null;
  vocalSections?: number | null;
  instrumentalSections?: number | null;
  beatGridResolution?: number | null;
  barAlignmentConfidence?: number | null;
  cuePointCandidates?: number[] | null;
  transitionWindows?: Array<{ startBar: number; endBar: number; confidence: number }> | null;
  dropTimingMarkers?: number[] | null;
  estimatedMixInPoint?: number | null;
  estimatedMixOutPoint?: number | null;
};

type PhraseAwareTrack = RuntimeCandidateTrack;

export type TransitionEvaluationResult = {
  autonomousReadiness: "ready" | "needs_review" | "blocked";
  decision: TransitionDecision;
  confidence: TransitionConfidence;
  riskLevel: TransitionRiskLevel;
  executionPlan: TransitionExecutionPlan;
  telemetry: RecommendationTelemetryItem | null;
  currentState: {
    sessionId: string | null;
    phase: string | null;
    energy: number | null;
    bpm: number | null;
    playbackActive: boolean;
  };
  crowdFeedbackInfluence: {
    crowdSentiment: number;
    transitionTrustScore: number;
    energyAdaptationTrend: number;
    operatorInterventionRate: number;
  };
  audioEnergyInfluence: {
    roomEnergy: number;
    crowdIntensity: number;
    silenceDetected: boolean;
    spikeDetected: boolean;
    driftScore: number;
    engagementScore: number;
  };
  learnedMemoryInfluence: {
    transitionBias: number;
    energyBias: number;
    operatorBias: number;
    crowdBias: number;
    confidenceBias: number;
    rationale: string[];
  };

  transitionDiagnostics: {
    bpmCompatibilityScore: number;

    energyFlowScore: number;

    harmonicCompatibilityScore: number;

    camelotCompatibility: CamelotCompatibility;

    keyMatchConfidence: number;

    vocalClashScore: number;

    transitionBlendScore: number;

    phraseAlignmentScore: number;

    phraseRisk: "safe" | "watch" | "risky";

    transitionWindowConfidence: number;

    phraseCompatibility: "intro_outro_aligned" | "instrumental_to_vocal_drop" | "neutral" | "vocal_overlap_risk" | "drop_collision";

    vocalOverlapRisk: number;

    transitionBlendType: "instrumental_blend" | "vocal_guarded_blend" | "percussive_blend";

    beatSyncScore: number;

    beatRisk: "safe" | "watch" | "risky";

    downbeatAlignmentConfidence: number;

    transitionTimingConfidence: number;

    syncCompatibility: "aligned_downbeat" | "matched_bar_window" | "late_phrase_alignment" | "drop_collision" | "unstable_window";

    estimatedMixInTiming: number;

    estimatedSwapWindow: string;

    estimatedBlendDuration: number;

    downbeatAlignmentQuality: "high" | "medium" | "low";

    transitionExecutionStyle:
      | "smooth_blend"
      | "fast_cut"
      | "percussive_swap"
      | "harmonic_overlay"
      | "vocal_guarded_transition";

    transitionSignature: string | null;

    memoryConfidenceBias: number;

    memoryRiskDelta: number;

    transitionReasoning: string[];
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeRiskLevel(params: { confidence: number; telemetry: RecommendationTelemetryItem | null }) {
  if (!params.telemetry) return "high" as const;
  if (params.telemetry.invalidationStatus === "invalidated") return "high" as const;
  if (params.confidence < 55) return "high" as const;
  if (params.confidence < 75) return "medium" as const;
  return "low" as const;
}

function recentTransitionCooldown(activities: Array<{ activity_type: string; created_at: string }>) {
  const lastTransition = activities.find((activity) => activity.activity_type === "QUEUE_TRANSITION");
  if (!lastTransition) return false;
  return Date.now() - new Date(lastTransition.created_at).getTime() < 25_000;
}
function scoreBpmCompatibility(
  currentBpm: number,
  nextBpm: number,
) {
  const difference = Math.abs(
    currentBpm - nextBpm,
  );

  if (difference <= 2) return 100;

  if (difference <= 4) return 92;

  if (difference <= 6) return 82;

  if (difference <= 8) return 68;

  if (difference <= 10) return 52;

  return 30;
}

function scoreEnergyFlow(
  currentEnergy: number,
  nextEnergy: number,
  phase: string | null,
) {
  const delta = nextEnergy - currentEnergy;

  if (
    phase === "warmup" &&
    delta > 2
  ) {
    return 45;
  }

  if (
    phase === "peak" &&
    delta >= 0
  ) {
    return 92;
  }

  if (
    phase === "cooldown" &&
    delta > 1
  ) {
    return 40;
  }

  const difference = Math.abs(delta);

  return clamp(
    100 - difference * 18,
    0,
    100,
  );
}

function normalizeCamelotKey(raw?: string | null) {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, "");
  const matched = normalized.match(/^([1-9]|1[0-2])([AB])$/);
  if (!matched) return null;
  return `${matched[1]}${matched[2]}` as const;
}

function parseCamelot(key: string) {
  const parsed = key.match(/^([1-9]|1[0-2])([AB])$/);
  if (!parsed) return null;
  return {
    hour: Number(parsed[1]),
    lane: parsed[2] as "A" | "B",
  };
}

function isCamelotAdjacent(current: string, candidate: string) {
  const a = parseCamelot(current);
  const b = parseCamelot(candidate);
  if (!a || !b) return false;

  const clockwise = a.hour === 12 ? 1 : a.hour + 1;
  const counterClockwise = a.hour === 1 ? 12 : a.hour - 1;
  return a.lane === b.lane && (b.hour === clockwise || b.hour === counterClockwise);
}

function isCamelotRelative(current: string, candidate: string) {
  const a = parseCamelot(current);
  const b = parseCamelot(candidate);
  if (!a || !b) return false;
  return a.hour === b.hour && a.lane !== b.lane;
}

export function scoreHarmonicCompatibility(params: {
  currentKey?: string | null;
  candidateKey?: string | null;
}) {
  const currentCamelot = normalizeCamelotKey(params.currentKey);
  const candidateCamelot = normalizeCamelotKey(params.candidateKey);
  if (!currentCamelot || !candidateCamelot) {
    return {
      harmonicCompatibilityScore: 65,
      camelotCompatibility: "unknown" as CamelotCompatibility,
      keyMatchConfidence: 38,
      harmonicRisk: "neutral_missing_key_metadata",
    };
  }

  if (currentCamelot === candidateCamelot) {
    return {
      harmonicCompatibilityScore: 98,
      camelotCompatibility: "match" as CamelotCompatibility,
      keyMatchConfidence: 96,
      harmonicRisk: "harmonic_safe_transition",
    };
  }

  if (isCamelotAdjacent(currentCamelot, candidateCamelot)) {
    return {
      harmonicCompatibilityScore: 90,
      camelotCompatibility: "adjacent" as CamelotCompatibility,
      keyMatchConfidence: 88,
      harmonicRisk: "adjacent_camelot_transition",
    };
  }

  if (isCamelotRelative(currentCamelot, candidateCamelot)) {
    return {
      harmonicCompatibilityScore: 84,
      camelotCompatibility: "relative" as CamelotCompatibility,
      keyMatchConfidence: 82,
      harmonicRisk: "relative_major_minor_safe",
    };
  }

  return {
    harmonicCompatibilityScore: 42,
    camelotCompatibility: "distant" as CamelotCompatibility,
    keyMatchConfidence: 46,
    harmonicRisk: "incompatible_harmonic_jump",
  };
}

function scoreVocalClash(
  currentTrack: {
    speechiness?: number | null;
  },
  nextTrack: {
    speechiness?: number | null;
  },
) {
  const currentSpeech =
    currentTrack.speechiness ?? 0;

  const nextSpeech =
    nextTrack.speechiness ?? 0;

  if (
    currentSpeech > 0.45 &&
    nextSpeech > 0.45
  ) {
    return 35;
  }

  return 90;
}

function computeTransitionBlendScore(params: {
  bpmScore: number;
  energyScore: number;
  harmonicScore: number;
  vocalScore: number;
}) {
  return clamp(
    params.bpmScore * 0.3 +
      params.energyScore * 0.3 +
      params.harmonicScore * 0.25 +
      params.vocalScore * 0.15,
    0,
    100,
  );
}

function scorePhraseAlignment(params: {
  currentTrack: PhraseAwareTrack;
  candidateTrack: PhraseAwareTrack;
}) {
  const currentOutro = params.currentTrack.outroLengthBars ?? 16;
  const candidateIntro = params.candidateTrack.introLengthBars ?? 16;
  const candidatePhrase = params.candidateTrack.phraseLength ?? 16;
  const currentDrop = params.currentTrack.dropIntensity ?? 5;
  const candidateDrop = params.candidateTrack.dropIntensity ?? 5;
  const currentVocalSections = params.currentTrack.vocalSections ?? 1;
  const candidateVocalSections = params.candidateTrack.vocalSections ?? 1;
  const candidateInstrumentalSections = params.candidateTrack.instrumentalSections ?? 2;

  const introOutroDelta = Math.abs(currentOutro - candidateIntro);
  const introOutroScore = clamp(100 - introOutroDelta * 4, 50, 100);
  const phraseGridScore = candidatePhrase % 8 === 0 ? 96 : candidatePhrase % 4 === 0 ? 84 : 70;
  const dropDelta = Math.abs(candidateDrop - currentDrop);
  const dropPrepScore = clamp(100 - dropDelta * 12, 38, 100);
  const vocalOverlapRisk = clamp(
    ((currentVocalSections + candidateVocalSections) / Math.max(candidateInstrumentalSections + 1, 1)) * 34,
    0,
    100,
  );

  let phraseCompatibility:
    | "intro_outro_aligned"
    | "instrumental_to_vocal_drop"
    | "neutral"
    | "vocal_overlap_risk"
    | "drop_collision" = "neutral";
  if (introOutroDelta <= 2 && candidatePhrase % 8 === 0) {
    phraseCompatibility = "intro_outro_aligned";
  } else if (candidateInstrumentalSections >= 2 && candidateVocalSections >= 1 && dropDelta <= 1.8) {
    phraseCompatibility = "instrumental_to_vocal_drop";
  } else if (dropDelta >= 3.5) {
    phraseCompatibility = "drop_collision";
  } else if (vocalOverlapRisk >= 62) {
    phraseCompatibility = "vocal_overlap_risk";
  }

  const phraseAlignmentScore = Number(
    clamp(
      introOutroScore * 0.38 + phraseGridScore * 0.22 + dropPrepScore * 0.25 + (100 - vocalOverlapRisk) * 0.15,
      0,
      100,
    ).toFixed(2),
  );
  const transitionWindowConfidence = Number(clamp((introOutroScore + phraseGridScore) / 2, 0, 100).toFixed(2));
  const phraseRisk = phraseAlignmentScore >= 80 ? "safe" : phraseAlignmentScore >= 62 ? "watch" : "risky";

  return {
    phraseAlignmentScore,
    phraseRisk,
    transitionWindowConfidence,
    phraseCompatibility,
    vocalOverlapRisk: Number(vocalOverlapRisk.toFixed(2)),
  };
}

function scoreBeatGridSynchronization(params: {
  currentTrack: RuntimeCandidateTrack;
  candidateTrack: RuntimeCandidateTrack;
}) {
  const currentGrid = params.currentTrack.beatGridResolution ?? 16;
  const candidateGrid = params.candidateTrack.beatGridResolution ?? 16;
  const currentBarAlignment = params.currentTrack.barAlignmentConfidence ?? 68;
  const candidateBarAlignment = params.candidateTrack.barAlignmentConfidence ?? 68;
  const currentDropMarkers = params.currentTrack.dropTimingMarkers ?? [16, 32];
  const candidateDropMarkers = params.candidateTrack.dropTimingMarkers ?? [16, 32];
  const candidateWindows = params.candidateTrack.transitionWindows ?? [
    { startBar: 8, endBar: 16, confidence: 70 },
    { startBar: 24, endBar: 32, confidence: 68 },
  ];
  const estimatedMixInPoint = params.candidateTrack.estimatedMixInPoint ?? 8;
  const estimatedMixOutPoint = params.currentTrack.estimatedMixOutPoint ?? 24;

  const gridDelta = Math.abs(currentGrid - candidateGrid);
  const gridScore = clamp(100 - gridDelta * 8, 56, 100);
  const downbeatAlignmentConfidence = Number(
    clamp((currentBarAlignment * 0.4 + candidateBarAlignment * 0.6), 0, 100).toFixed(2),
  );
  const strongestWindow = candidateWindows.reduce(
    (best, window) => (window.confidence > best.confidence ? window : best),
    candidateWindows[0] ?? { startBar: 8, endBar: 16, confidence: 70 },
  );
  const windowSpan = Math.max(1, strongestWindow.endBar - strongestWindow.startBar);
  const windowStabilityScore = clamp(strongestWindow.confidence + Math.min(18, windowSpan * 2), 0, 100);
  const dropCollisionRisk = currentDropMarkers.some((marker) => candidateDropMarkers.includes(marker));
  const latePhrasePenalty = estimatedMixInPoint > strongestWindow.endBar ? 14 : 0;

  let syncCompatibility:
    | "aligned_downbeat"
    | "matched_bar_window"
    | "late_phrase_alignment"
    | "drop_collision"
    | "unstable_window" = "matched_bar_window";
  if (downbeatAlignmentConfidence >= 84 && gridScore >= 84) {
    syncCompatibility = "aligned_downbeat";
  } else if (dropCollisionRisk) {
    syncCompatibility = "drop_collision";
  } else if (windowStabilityScore < 60) {
    syncCompatibility = "unstable_window";
  } else if (latePhrasePenalty > 0) {
    syncCompatibility = "late_phrase_alignment";
  }

  const beatSyncScore = Number(
    clamp(
      gridScore * 0.3 +
        downbeatAlignmentConfidence * 0.3 +
        windowStabilityScore * 0.3 -
        (dropCollisionRisk ? 12 : 0) -
        latePhrasePenalty,
      0,
      100,
    ).toFixed(2),
  );
  const transitionTimingConfidence = Number(
    clamp((downbeatAlignmentConfidence * 0.45 + windowStabilityScore * 0.55), 0, 100).toFixed(2),
  );
  const beatRisk = beatSyncScore >= 80 ? "safe" : beatSyncScore >= 62 ? "watch" : "risky";

  return {
    beatSyncScore,
    beatRisk,
    downbeatAlignmentConfidence,
    transitionTimingConfidence,
    syncCompatibility,
    estimatedMixInTiming: estimatedMixInPoint,
    estimatedSwapWindow: `${strongestWindow.startBar}-${strongestWindow.endBar} bars`,
    estimatedBlendDuration: Number(clamp(windowSpan * 1.8, 4, 24).toFixed(2)),
    downbeatAlignmentQuality:
      downbeatAlignmentConfidence >= 82
        ? ("high" as const)
        : downbeatAlignmentConfidence >= 62
          ? ("medium" as const)
          : ("low" as const),
  };
}

function deriveTransitionExecutionStyle(params: {
  phraseCompatibility: "intro_outro_aligned" | "instrumental_to_vocal_drop" | "neutral" | "vocal_overlap_risk" | "drop_collision";
  beatRisk: "safe" | "watch" | "risky";
  harmonicRisk: string;
  vocalOverlapRisk: number;
}) {
  if (params.vocalOverlapRisk >= 62 || params.phraseCompatibility === "vocal_overlap_risk") {
    return "vocal_guarded_transition" as const;
  }
  if (params.harmonicRisk === "harmonic_safe_transition" && params.beatRisk === "safe") {
    return "harmonic_overlay" as const;
  }
  if (params.phraseCompatibility === "drop_collision" || params.beatRisk === "risky") {
    return "fast_cut" as const;
  }
  if (params.phraseCompatibility === "intro_outro_aligned") {
    return "smooth_blend" as const;
  }
  return "percussive_swap" as const;
}

function toMoodPhase(phase: string | null | undefined): QueueTrack["moodPhase"] {
  if (phase === "warmup" || phase === "social" || phase === "build" || phase === "peak" || phase === "cooldown") {
    return phase;
  }
  return "social";
}

function scoreMoodPhaseCompatibility(
  currentMoodPhase: QueueTrack["moodPhase"],
  candidateMoodPhase: QueueTrack["moodPhase"],
) {
  if (currentMoodPhase === "peak" && candidateMoodPhase === "cooldown") {
    return 25;
  }

  if (currentMoodPhase === candidateMoodPhase) {
    return 90;
  }

  if (
    (currentMoodPhase === "build" && candidateMoodPhase === "peak") ||
    (currentMoodPhase === "social" && candidateMoodPhase === "build") ||
    (currentMoodPhase === "cooldown" && candidateMoodPhase === "social")
  ) {
    return 96;
  }

  return 62;
}

function toTrackSignaturePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function buildTransitionSignature(
  currentTrack: QueueTrack,
  candidateTrack: QueueTrack,
  harmonic?: {
    currentKey?: string | null;
    candidateKey?: string | null;
    camelotCompatibility?: CamelotCompatibility;
  },
  phrase?: {
    phraseCompatibility?: string;
    dropAlignment?: string;
    vocalOverlapRisk?: number;
    syncCompatibility?: string;
    beatRisk?: "safe" | "watch" | "risky";
  },
) {
  const current = `${toTrackSignaturePart(currentTrack.title)}:${toTrackSignaturePart(currentTrack.artist)}`;
  const candidate = `${toTrackSignaturePart(candidateTrack.title)}:${toTrackSignaturePart(candidateTrack.artist)}`;
  if (!harmonic && !phrase) {
    return `${current}->${candidate}`;
  }
  const currentKeySig = toTrackSignaturePart(harmonic?.currentKey ?? "unknown");
  const candidateKeySig = toTrackSignaturePart(harmonic?.candidateKey ?? "unknown");
  const camelotSig = toTrackSignaturePart(harmonic?.camelotCompatibility ?? "unknown");
  const phraseCompatibilitySig = toTrackSignaturePart(phrase?.phraseCompatibility ?? "unknown");
  const dropAlignmentSig = toTrackSignaturePart(phrase?.dropAlignment ?? "unknown");
  const vocalOverlapSig = toTrackSignaturePart(String(Math.round(phrase?.vocalOverlapRisk ?? 0)));
  const syncCompatibilitySig = toTrackSignaturePart(phrase?.syncCompatibility ?? "unknown");
  const beatRiskSig = toTrackSignaturePart(phrase?.beatRisk ?? "watch");
  return `${current}->${candidate}|keys:${currentKeySig}:${candidateKeySig}|camelot:${camelotSig}|phrase:${phraseCompatibilitySig}:${dropAlignmentSig}:${vocalOverlapSig}|sync:${syncCompatibilitySig}:${beatRiskSig}`;
}

function computeTransitionMemoryBias(params: {
  currentTrack: QueueTrack;
  candidateTrack: QueueTrack;
  currentKey?: string | null;
  candidateKey?: string | null;
  camelotCompatibility?: CamelotCompatibility;
  phraseCompatibility?: string;
  dropAlignment?: string;
  vocalOverlapRisk?: number;
    phraseRisk?: "safe" | "watch" | "risky";
  syncCompatibility?: string;
  beatRisk?: "safe" | "watch" | "risky";
  memoryPatterns?: RuntimeMemoryPattern[];
}) {
  if (!params.memoryPatterns?.length) {
    return {
      confidenceBias: 0,
      riskDelta: 0,
      rationale: [] as string[],
      signature: buildTransitionSignature(params.currentTrack, params.candidateTrack, {
        currentKey: params.currentKey,
        candidateKey: params.candidateKey,
        camelotCompatibility: params.camelotCompatibility,
      }, {
        phraseCompatibility: params.phraseCompatibility,
        dropAlignment: params.dropAlignment,
        vocalOverlapRisk: params.vocalOverlapRisk,
        syncCompatibility: params.syncCompatibility,
        beatRisk: params.beatRisk,
      }),
    };
  }

  const signature = buildTransitionSignature(params.currentTrack, params.candidateTrack, {
    currentKey: params.currentKey,
    candidateKey: params.candidateKey,
    camelotCompatibility: params.camelotCompatibility,
  }, {
    phraseCompatibility: params.phraseCompatibility,
    dropAlignment: params.dropAlignment,
    vocalOverlapRisk: params.vocalOverlapRisk,
    syncCompatibility: params.syncCompatibility,
    beatRisk: params.beatRisk,
  });
  const matchingPatterns = params.memoryPatterns.filter((pattern) =>
    pattern.pattern_context.toLowerCase().includes(signature),
  );

  if (!matchingPatterns.length) {
    return {
      confidenceBias: 0,
      riskDelta: 0,
      rationale: [] as string[],
      signature,
    };
  }

  let confidenceBias = 0;
  let riskDelta = 0;
  let weightSum = 0;
  let successMatches = 0;
  let failedMatches = 0;

  for (const pattern of matchingPatterns) {
    const reinforcementWeight =
      pattern.reinforcement_state === "reinforced"
        ? 1.2
        : pattern.reinforcement_state === "decaying"
          ? 0.75
          : 1;
    const usageWeight = clamp(1 + pattern.usage_count / 8, 1, 2.5);
    const ageDays = Math.max(
      0,
      (Date.now() - new Date(pattern.updated_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    const recencyDecay =
      pattern.learning_frozen
        ? 1
        : clamp(
            Math.exp(
              -ageDays /
                clamp(
                  9 + pattern.usage_count * 2.2 + (pattern.reinforcement_state === "reinforced" ? 6 : 0),
                  9,
                  40,
                ),
            ),
            0.42,
            1,
          );
    const baseWeight = reinforcementWeight * usageWeight;
    const successFactor = clamp(pattern.success_score / 100, -1, 1);
    const confidenceFactor = clamp(pattern.confidence_score / 100, 0, 1);
    const signedWeight =
      (pattern.pattern_type === "successful_transition" ? 1 : pattern.pattern_type === "failed_transition" ? -1 : 0) *
      baseWeight *
      recencyDecay;

    confidenceBias += signedWeight * (10 * confidenceFactor + 8 * successFactor);
    riskDelta += signedWeight > 0 ? -0.6 * confidenceFactor : 0.9 * Math.abs(successFactor);
    weightSum += Math.abs(signedWeight);

    if (pattern.pattern_type === "successful_transition") successMatches += 1;
    if (pattern.pattern_type === "failed_transition") failedMatches += 1;
  }

  const normalizer = Math.max(weightSum, 1);
  const normalizedConfidenceBias = Number(clamp(confidenceBias / normalizer, -15, 12).toFixed(2));
  const normalizedRiskDelta = Number(clamp(riskDelta / normalizer, -1, 1).toFixed(2));
  const rationale: string[] = [];
  if (successMatches > 0) {
    rationale.push(`Matched ${successMatches} successful transition memory pattern(s).`);
  }
  if (failedMatches > 0) {
    rationale.push(`Matched ${failedMatches} failed transition memory pattern(s).`);
  }

  return {
    confidenceBias: normalizedConfidenceBias,
    riskDelta: normalizedRiskDelta,
    rationale,
    signature,
  };
}

function applyRiskDelta(baseRisk: TransitionRiskLevel, riskDelta: number): TransitionRiskLevel {
  const lanes: TransitionRiskLevel[] = ["low", "medium", "high"];
  const baseIndex = lanes.indexOf(baseRisk);
  const laneShift = riskDelta >= 0.35 ? 1 : riskDelta <= -0.35 ? -1 : 0;
  return lanes[clamp(baseIndex + laneShift, 0, lanes.length - 1)];
}

function toSpotifyTrackId(track: QueueTrack) {
  const compatibilityReason = track.transitionCompatibility.reason ?? "";
  const uriMatch = compatibilityReason.match(/spotify:track:([A-Za-z0-9]+)/i);
  if (uriMatch) return uriMatch[1];
  const idMatch = compatibilityReason.match(/\b([A-Za-z0-9]{22})\b/);
  if (idMatch) return idMatch[1];
  return null;
}

function extractCamelotHintFromText(value?: string | null) {
  if (!value) return null;
  const camelotMatch = value.match(/\b(1[0-2]|[1-9])[AB]\b/i);
  return camelotMatch ? camelotMatch[0].toUpperCase() : null;
}

function extractCamelotHintFromTrack(track: QueueTrack) {
  const compatibilityReason = track.transitionCompatibility.reason ?? "";
  return extractCamelotHintFromText(compatibilityReason) ?? extractCamelotHintFromText(track.title);
}

function crowdMomentumBucketFromProjection(projection: number) {
  if (projection >= 78) return "surging" as const;
  if (projection >= 62) return "rising" as const;
  if (projection <= 38) return "low" as const;
  return "steady" as const;
}

function toRuntimeCandidateFromEnhanced(track: AIEnhancedTrackRecommendation): RuntimeCandidateTrack {
  return {
    title: track.name,
    artist: track.artistName,
    genre: "spotify",
    bpm: track.bpm,
    energy: track.energy,
    moodPhase: "social",
    transitionCompatibility: {
      score: track.aiConfidence,
      reason: `spotify:track:${track.id}`,
    },
    spotifyTrackId: track.id,
    camelotKey: track.audioFeatures?.camelotKey ?? null,
    speechiness: track.audioFeatures?.speechiness ?? null,
    instrumentalness: track.audioFeatures?.instrumentalness ?? null,
    danceability: track.audioFeatures?.danceability ?? null,
    valence: track.audioFeatures?.valence ?? null,
    crowdMomentumProjection: track.audioFeatures?.crowdMomentumProjection ?? null,
    vocalDensityScore: track.audioFeatures?.vocalDensityScore ?? null,
    instrumentalBlendConfidence: track.audioFeatures?.instrumentalBlendConfidence ?? null,
    introLengthBars: track.structuralMetadata?.introLengthBars ?? null,
    outroLengthBars: track.structuralMetadata?.outroLengthBars ?? null,
    phraseLength: track.structuralMetadata?.phraseLength ?? null,
    dropIntensity: track.structuralMetadata?.dropIntensity ?? null,
    breakdownPresence: track.structuralMetadata?.breakdownPresence ?? null,
    vocalSections: track.structuralMetadata?.vocalSections ?? null,
    instrumentalSections: track.structuralMetadata?.instrumentalSections ?? null,
    beatGridResolution: track.structuralMetadata?.beatGridResolution ?? null,
    barAlignmentConfidence: track.structuralMetadata?.barAlignmentConfidence ?? null,
    cuePointCandidates: track.structuralMetadata?.cuePointCandidates ?? null,
    transitionWindows: track.structuralMetadata?.transitionWindows ?? null,
    dropTimingMarkers: track.structuralMetadata?.dropTimingMarkers ?? null,
    estimatedMixInPoint: track.structuralMetadata?.estimatedMixInPoint ?? null,
    estimatedMixOutPoint: track.structuralMetadata?.estimatedMixOutPoint ?? null,
  };
}

export function scoreTransitionCandidate(params: {
  currentTrack: RuntimeCandidateTrack;
  candidateTrack: RuntimeCandidateTrack;
  currentKey?: string | null;
  candidateKey?: string | null;
  memoryPatterns?: RuntimeMemoryPattern[];
}) {
  const bpmDelta = Math.abs(
    params.currentTrack.bpm - params.candidateTrack.bpm,
  );
  const bpmScore =
    bpmDelta <= 2
      ? 98
      : bpmDelta <= 5
        ? 84
        : bpmDelta <= 8
          ? 66
          : 38;

  const energyDelta = params.candidateTrack.energy - params.currentTrack.energy;
  const energyScore =
    energyDelta >= 0
      ? energyDelta <= 1.5
        ? 96
        : energyDelta <= 3
          ? 78
          : 42
      : Math.abs(energyDelta) <= 1.5
        ? 88
        : Math.abs(energyDelta) <= 3
          ? 70
          : 36;
  const candidateDanceability = params.candidateTrack.danceability ?? 0.5;
  const candidateValence = params.candidateTrack.valence ?? 0.5;
  const crowdMomentumProjection =
    params.candidateTrack.crowdMomentumProjection ??
    clamp((params.candidateTrack.energy / 10) * 55 + candidateDanceability * 30 + candidateValence * 15, 0, 100);
  const enrichedEnergyScore = clamp(
    energyScore * 0.72 + candidateDanceability * 100 * 0.18 + candidateValence * 100 * 0.1,
    0,
    100,
  );

  const moodScore = scoreMoodPhaseCompatibility(
    params.currentTrack.moodPhase,
    params.candidateTrack.moodPhase,
  );
  const harmonic = scoreHarmonicCompatibility({
    currentKey: params.currentKey,
    candidateKey: params.candidateKey,
  });
  const phrase = scorePhraseAlignment({
    currentTrack: params.currentTrack,
    candidateTrack: params.candidateTrack,
  });
  const beatSync = scoreBeatGridSynchronization({
    currentTrack: params.currentTrack,
    candidateTrack: params.candidateTrack,
  });
  const memoryBias = computeTransitionMemoryBias({
    currentTrack: params.currentTrack,
    candidateTrack: params.candidateTrack,
    currentKey: params.currentKey,
    candidateKey: params.candidateKey,
    camelotCompatibility: harmonic.camelotCompatibility,
    phraseCompatibility: phrase.phraseCompatibility,
    dropAlignment: phrase.phraseCompatibility === "drop_collision" ? "collision" : "safe",
    vocalOverlapRisk: phrase.vocalOverlapRisk,
    syncCompatibility: beatSync.syncCompatibility,
    beatRisk: beatSync.beatRisk as "safe" | "watch" | "risky",
    memoryPatterns: params.memoryPatterns,
  });

  const confidence =
    bpmScore * 0.15 +
    enrichedEnergyScore * 0.15 +
    moodScore * 0.10 +
    harmonic.harmonicCompatibilityScore * 0.20 +
    phrase.phraseAlignmentScore * 0.20 +
    beatSync.beatSyncScore * 0.20 +
    memoryBias.confidenceBias;
  const harmonicRiskDelta =
    harmonic.harmonicRisk === "incompatible_harmonic_jump"
      ? 0.45
      : harmonic.harmonicRisk === "adjacent_camelot_transition"
        ? -0.18
        : harmonic.harmonicRisk === "harmonic_safe_transition"
          ? -0.25
          : 0;

  const baseRiskLevel: TransitionRiskLevel = confidence > 80 ? "low" : confidence > 60 ? "medium" : "high";
  const riskLevel = applyRiskDelta(baseRiskLevel, memoryBias.riskDelta + harmonicRiskDelta);

  return {
    confidence: Number(clamp(confidence, 0, 100).toFixed(2)),
    bpmScore,
    energyScore: Number(enrichedEnergyScore.toFixed(2)),
    moodScore,
    harmonicCompatibilityScore: harmonic.harmonicCompatibilityScore,
    camelotCompatibility: harmonic.camelotCompatibility,
    keyMatchConfidence: harmonic.keyMatchConfidence,
    harmonicRisk: harmonic.harmonicRisk,
    phraseAlignmentScore: phrase.phraseAlignmentScore,
    phraseRisk: phrase.phraseRisk,
    transitionWindowConfidence: phrase.transitionWindowConfidence,
    phraseCompatibility: phrase.phraseCompatibility,
    crowdMomentumProjection: Number(crowdMomentumProjection.toFixed(2)),
    vocalOverlapRisk: phrase.vocalOverlapRisk,
    transitionBlendType:
      phrase.vocalOverlapRisk >= 60
        ? "vocal_guarded_blend"
        : (params.candidateTrack.instrumentalBlendConfidence ?? 0) >= 70
          ? "instrumental_blend"
          : "percussive_blend",
    beatSyncScore: beatSync.beatSyncScore,
    beatRisk: beatSync.beatRisk,
    downbeatAlignmentConfidence: beatSync.downbeatAlignmentConfidence,
    transitionTimingConfidence: beatSync.transitionTimingConfidence,
    syncCompatibility: beatSync.syncCompatibility,
    estimatedMixInTiming: beatSync.estimatedMixInTiming,
    estimatedSwapWindow: beatSync.estimatedSwapWindow,
    estimatedBlendDuration: beatSync.estimatedBlendDuration,
    downbeatAlignmentQuality: beatSync.downbeatAlignmentQuality,
    transitionExecutionStyle: deriveTransitionExecutionStyle({
      phraseCompatibility: phrase.phraseCompatibility,
      beatRisk: beatSync.beatRisk as "safe" | "watch" | "risky",
      harmonicRisk: harmonic.harmonicRisk,
      vocalOverlapRisk: phrase.vocalOverlapRisk,
    }),
    vocalDensityScore: Number(((params.candidateTrack.vocalDensityScore ?? (params.candidateTrack.speechiness ?? 0) * 100)).toFixed(2)),
    instrumentalBlendConfidence: Number(
      (
        params.candidateTrack.instrumentalBlendConfidence ??
        clamp(((params.candidateTrack.instrumentalness ?? 0) * 0.75 + (1 - (params.candidateTrack.speechiness ?? 0)) * 0.25) * 100, 0, 100)
      ).toFixed(2),
    ),
    speechiness: Number((params.candidateTrack.speechiness ?? 0).toFixed(4)),
    instrumentalness: Number((params.candidateTrack.instrumentalness ?? 0).toFixed(4)),
    danceability: Number(candidateDanceability.toFixed(4)),
    riskLevel,
    memoryBias,
  };
}
export async function evaluateTransitionEngine(params: {
  userId: string;
  queueRecommendations: QueueRecommendationWithMeta[];
  assistedAutonomousEnabled: boolean;
}) {
  console.log("[TransitionEngine] before getLiveSessionState");
  const liveState = await Promise.race([
    getLiveSessionState(params.userId),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 8000),
    ),
  ]);
  console.log("[TransitionEngine] after getLiveSessionState");

  console.log("[TransitionEngine] before getPlaybackOrchestrationState");
  const playback = await Promise.race([
    getPlaybackOrchestrationState(params.userId),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 8000),
    ),
  ]);
  console.log("[TransitionEngine] after getPlaybackOrchestrationState");

  console.log("[TransitionEngine] before serveRecommendationDiagnostics");
  const diagnostics = await Promise.race([
    serveRecommendationDiagnostics(params.userId),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 8000),
    ),
  ]);
  console.log("[TransitionEngine] after serveRecommendationDiagnostics");

  console.log("[TransitionEngine] before getCrowdFeedbackSummary");
  const feedbackSummary = await Promise.race([
    getCrowdFeedbackSummary({
      userId: params.userId,
      sessionId: liveState.session?.id,
      limit: 60,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 8000),
    ),
  ]);
  console.log("[TransitionEngine] after getCrowdFeedbackSummary");

  console.log("[TransitionEngine] before getAudioEnvironmentState");
  const audioState = await Promise.race([
    getAudioEnvironmentState({
      userId: params.userId,
      sessionId: liveState.session?.id ?? undefined,
      limit: 40,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 8000),
    ),
  ]);
  console.log("[TransitionEngine] after getAudioEnvironmentState");
  const session = liveState.session;
  const telemetry = diagnostics.items[0] ?? null;

  console.log("[TransitionEngine] before getRuntimeMemoryPatterns");
  const memoryPatterns = await Promise.race([
    getRuntimeMemoryPatterns({
      userId: params.userId,
      limit: 30,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 8000),
    ),
  ]);
  console.log("[TransitionEngine] after getRuntimeMemoryPatterns");

  const memoryBias = computeLearnedOrchestrationBias(memoryPatterns);
  const playbackTrackId = playback.playbackState?.track?.id ?? null;
  const currentTrack: QueueTrack = {
    title: playback.playbackState?.track?.name ?? "Current Track",
    artist: playback.playbackState?.track?.artistName ?? "Unknown Artist",
    genre: "mixed",
    bpm: session?.current_bpm ?? 110,
    energy: session?.current_energy ?? 5,
    moodPhase: toMoodPhase(session?.current_phase),
    transitionCompatibility: {
      score: 100,
      reason: "Current live playback context.",
    },
  };

  const spotifyEnhancedCandidateTracks = params.queueRecommendations
    .flatMap((item) => item.spotifyEnhancedRecommendations ?? [])
    .map(toRuntimeCandidateFromEnhanced)
    .filter((track) => !playbackTrackId || track.spotifyTrackId !== playbackTrackId);
  const fallbackQueueCandidateTracks = params.queueRecommendations
    .flatMap((item) => item.recommendedQueue ?? [])
    .map((track): RuntimeCandidateTrack => ({
      ...track,
      camelotKey: extractCamelotHintFromTrack(track),
      spotifyTrackId: undefined,
      speechiness: null,
      instrumentalness: null,
      danceability: null,
      valence: null,
      crowdMomentumProjection: null,
      vocalDensityScore: null,
      instrumentalBlendConfidence: null,
      introLengthBars: null,
      outroLengthBars: null,
      phraseLength: null,
      dropIntensity: null,
      breakdownPresence: null,
      vocalSections: null,
      instrumentalSections: null,
      beatGridResolution: null,
      barAlignmentConfidence: null,
      cuePointCandidates: null,
      transitionWindows: null,
      dropTimingMarkers: null,
      estimatedMixInPoint: null,
      estimatedMixOutPoint: null,
    }))
    .filter((track) => !playbackTrackId || `${track.title}-${track.artist}` !== playbackTrackId);
  const candidateTracks = spotifyEnhancedCandidateTracks.length
    ? spotifyEnhancedCandidateTracks
    : fallbackQueueCandidateTracks;
  const currentTrackKey =
    extractCamelotHintFromText(playback.playbackState?.track?.name ?? null) ??
    extractCamelotHintFromText(playback.playbackState?.track?.artistName ?? null);

  const transitionCandidates = candidateTracks
    .map((candidateTrack) => {
      const candidateKeyHint = candidateTrack.camelotKey ?? extractCamelotHintFromTrack(candidateTrack);
      const candidateKey = candidateKeyHint;
      const scored = scoreTransitionCandidate({
        currentTrack,
        candidateTrack,
        currentKey: currentTrackKey,
        candidateKey,
        memoryPatterns,
      });

      return {
        candidateTrack,
        candidateKey,
        sourceTrackId: candidateTrack.spotifyTrackId ?? null,
        ...scored,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);

  const topTransitionCandidate = transitionCandidates[0] ?? null;
  const topRecommendation = topTransitionCandidate
    ? {
        id: `${topTransitionCandidate.candidateTrack.title}-${topTransitionCandidate.candidateTrack.artist}`,
        name: topTransitionCandidate.candidateTrack.title,
        artistName: topTransitionCandidate.candidateTrack.artist,
        bpm: topTransitionCandidate.candidateTrack.bpm,
        energy: topTransitionCandidate.candidateTrack.energy,
        aiConfidence: Math.round(topTransitionCandidate.confidence),
      }
    : null;
  const cooldownBlocked = recentTransitionCooldown(liveState.activities);
  const duplicateTransition = Boolean(
    topTransitionCandidate &&
      topTransitionCandidate.candidateTrack.title === playback.playbackState?.track?.name &&
      topTransitionCandidate.candidateTrack.artist === playback.playbackState?.track?.artistName,
  );
  const unsafeEnergySpike =
    session && topRecommendation ? topRecommendation.energy - session.current_energy > 2.5 : false;
    const bpmCompatibilityScore = topTransitionCandidate?.bpmScore ?? 60;
  
  const energyFlowScore = topTransitionCandidate?.energyScore ?? 60;
  
  const harmonicCompatibilityScore = topTransitionCandidate?.harmonicCompatibilityScore ?? 65;
  const camelotCompatibility = topTransitionCandidate?.camelotCompatibility ?? "unknown";
  const keyMatchConfidence = topTransitionCandidate?.keyMatchConfidence ?? 38;
  const harmonicRisk = topTransitionCandidate?.harmonicRisk ?? "neutral_missing_key_metadata";
  
  const vocalClashScore =
    scoreVocalClash(
      {
        speechiness: 0.2,
      },
      {
        speechiness: topTransitionCandidate?.speechiness ?? 0.2,
      },
    );
  
  const transitionBlendScore =
    computeTransitionBlendScore({
      bpmScore:
        bpmCompatibilityScore,
  
      energyScore:
        energyFlowScore,
  
      harmonicScore:
        harmonicCompatibilityScore,
  
      vocalScore:
        vocalClashScore,
    });
  const reasons: string[] = [];
  if (!params.assistedAutonomousEnabled) reasons.push("Assisted-autonomous mode disabled.");
  if (cooldownBlocked) reasons.push("Transition cooldown active.");
  if (duplicateTransition) reasons.push("Duplicate transition prevented.");
  if (unsafeEnergySpike) reasons.push("Energy spike protection triggered.");
  if (telemetry?.invalidationStatus === "invalidated") reasons.push("Telemetry indicates invalidated state.");
  if (!topRecommendation) reasons.push("No AI-enhanced track available.");
  if (topTransitionCandidate?.memoryBias.rationale.length) {
    reasons.push(...topTransitionCandidate.memoryBias.rationale);
  }
  if (topTransitionCandidate?.memoryBias.confidenceBias && topTransitionCandidate.memoryBias.confidenceBias > 1.5) {
    reasons.push("Reinforced by prior successful simulations.");
  }
  if (topTransitionCandidate?.memoryBias.confidenceBias && topTransitionCandidate.memoryBias.confidenceBias < -1.5) {
    reasons.push("Penalized by unstable continuity history.");
  }
  if (topTransitionCandidate?.memoryBias.riskDelta && topTransitionCandidate.memoryBias.riskDelta > 0.2) {
    reasons.push("Timing window historically risky.");
  }
  if (topTransitionCandidate?.memoryBias.riskDelta && topTransitionCandidate.memoryBias.riskDelta < -0.2) {
    reasons.push("Harmonic continuity historically stable.");
  }
  if (feedbackSummary.transitionTrustScore < 40)
    reasons.push("Low transition trust score from crowd feedback.");
  if (feedbackSummary.operatorInterventionRate > 65)
    reasons.push("High operator intervention frequency suggests caution.");
  if (audioState.drift.silenceDetected) reasons.push("Audio sensing detected silence/drop period.");
  if (audioState.drift.spikeDetected) reasons.push("Audio sensing detected energy spike.");
  if (harmonicRisk === "harmonic_safe_transition") reasons.push("Harmonic-safe transition detected.");
  if (harmonicRisk === "adjacent_camelot_transition") reasons.push("Adjacent Camelot transition is harmonically safe.");
  if (harmonicRisk === "incompatible_harmonic_jump") reasons.push("Incompatible harmonic jump risk detected.");
  if (harmonicRisk === "neutral_missing_key_metadata") reasons.push("Missing key metadata; using neutral harmonic weighting.");
  if ((topTransitionCandidate?.phraseCompatibility ?? "neutral") === "intro_outro_aligned") {
    reasons.push("Phrase-safe intro-to-outro transition window detected.");
  }
  if ((topTransitionCandidate?.phraseCompatibility ?? "neutral") === "instrumental_to_vocal_drop") {
    reasons.push("Instrumental intro to vocal drop alignment looks favorable.");
  }
  if ((topTransitionCandidate?.phraseCompatibility ?? "neutral") === "drop_collision") {
    reasons.push("Abrupt drop collision risk detected in phrase structure.");
  }
  if ((topTransitionCandidate?.phraseCompatibility ?? "neutral") === "vocal_overlap_risk") {
    reasons.push("Vocal overlap risk requires guarded blend timing.");
  }
  if ((topTransitionCandidate?.syncCompatibility ?? "matched_bar_window") === "aligned_downbeat") {
    reasons.push("Downbeat alignment is strong for execution timing.");
  }
  if ((topTransitionCandidate?.syncCompatibility ?? "matched_bar_window") === "drop_collision") {
    reasons.push("Drop-on-drop collision timing risk detected.");
  }
  if ((topTransitionCandidate?.syncCompatibility ?? "matched_bar_window") === "unstable_window") {
    reasons.push("Transition window stability is low; timing risk elevated.");
  }
  if ((topTransitionCandidate?.crowdMomentumProjection ?? 0) > 0) {
    reasons.push(
      `Crowd momentum projection is ${crowdMomentumBucketFromProjection(
        topTransitionCandidate?.crowdMomentumProjection ?? 50,
      )}.`,
    );
  }
  if ((topTransitionCandidate?.vocalDensityScore ?? 0) >= 55)
    reasons.push("High vocal density candidate; potential vocal overlap risk.");
  if ((topTransitionCandidate?.instrumentalBlendConfidence ?? 0) >= 70)
    reasons.push("Instrumental blend confidence is favorable for layering.");

  let score = 86;
  if (!params.assistedAutonomousEnabled) score -= 35;
  if (cooldownBlocked) score -= 22;
  if (duplicateTransition) score -= 16;
  if (unsafeEnergySpike) score -= 30;
  if (telemetry?.invalidationStatus === "invalidated") score -= 24;
  if (!topRecommendation) score -= 30;
  score += (feedbackSummary.transitionTrustScore - 50) * 0.12;
  score += feedbackSummary.energyAdaptationTrend * 2.4;
  score -= Math.max(0, feedbackSummary.operatorInterventionRate - 45) * 0.45;
  score += (audioState.engagement.engagementScore - 50) * 0.16;
  score +=
  ((topTransitionCandidate?.confidence ?? transitionBlendScore) - 70) *
  0.45;

score +=
  (bpmCompatibilityScore - 70) *
  0.18;

score +=
  (energyFlowScore - 70) *
  0.22;

score +=
  (harmonicCompatibilityScore -
    70) *
  0.15;
  score += topTransitionCandidate?.memoryBias.confidenceBias ?? 0;
  score += audioState.drift.silenceDetected ? -8 : 0;
  score += audioState.drift.spikeDetected ? -4 : 0;
  score += memoryBias.confidenceBias * 0.45;
  score += memoryBias.crowdBias * 0.25;
  score -= memoryBias.operatorBias * 0.2;
  const confidence = clamp(
    (topTransitionCandidate?.confidence ?? score) + (topTransitionCandidate?.memoryBias.confidenceBias ?? 0) * 0.4,
    0,
    100,
  );
  const baselineRiskLevel = computeRiskLevel({ confidence, telemetry });
  const riskLevel = applyRiskDelta(baselineRiskLevel, topTransitionCandidate?.memoryBias.riskDelta ?? 0);

  const shouldTransition =
    params.assistedAutonomousEnabled &&
    !cooldownBlocked &&
    !duplicateTransition &&
    !unsafeEnergySpike &&
    Boolean(topRecommendation);
  const holdEnergy = !shouldTransition || (session ? session.current_energy >= 8.6 : false);
  const rampEnergy = shouldTransition && Boolean(session && session.current_energy <= 6.8);
  const cooldownEnergy = shouldTransition && Boolean(session && session.current_energy >= 8.8);
  const nextAction: TransitionExecutionPlan["nextAction"] = !params.assistedAutonomousEnabled
    ? "hold_state"
    : shouldTransition
      ? "queue_next_track"
      : unsafeEnergySpike
        ? "reject_unsafe_transition"
        : "hold_state";

  const executionPlan: TransitionExecutionPlan = {
    nextAction,
    targetTrackId: topRecommendation?.id ?? null,
    targetTrackLabel: topRecommendation
      ? `${topRecommendation.name} - ${topRecommendation.artistName}`
      : null,
    targetPhase: session?.current_phase ?? "social",
    targetEnergy: clamp(
      (topRecommendation?.energy ?? session?.current_energy ?? 5) + memoryBias.energyBias * 0.12,
      0,
      10,
    ),
    targetBpm: topRecommendation?.bpm ?? session?.current_bpm ?? 110,
  };

  const decision: TransitionDecision = {
    shouldTransition,
    holdEnergy,
    rampEnergy,
    cooldownEnergy,
    reason: reasons[0] ?? "Transition lane is healthy.",
  };

  const result: TransitionEvaluationResult = {
    autonomousReadiness: shouldTransition ? "ready" : params.assistedAutonomousEnabled ? "needs_review" : "blocked",
    decision,
    confidence: { score: confidence, reasons: reasons.length ? reasons : ["Healthy transition profile."] },
    riskLevel,
    executionPlan,
    telemetry,
    currentState: {
      sessionId: session?.id ?? null,
      phase: session?.current_phase ?? null,
      energy: session?.current_energy ?? null,
      bpm: session?.current_bpm ?? null,
      playbackActive: Boolean(playback.playbackState?.isPlaying),
    },
    crowdFeedbackInfluence: {
      crowdSentiment: feedbackSummary.crowdSentiment,
      transitionTrustScore: feedbackSummary.transitionTrustScore,
      energyAdaptationTrend: feedbackSummary.energyAdaptationTrend,
      operatorInterventionRate: feedbackSummary.operatorInterventionRate,
    },
    audioEnergyInfluence: {
      roomEnergy: audioState.latest?.energy_level ?? audioState.drift.shortTermAverage,
      crowdIntensity: audioState.latest?.crowd_intensity ?? audioState.engagement.crowdNoiseIntensity,
      silenceDetected: audioState.drift.silenceDetected,
      spikeDetected: audioState.drift.spikeDetected,
      driftScore: audioState.drift.driftScore,
      engagementScore: audioState.engagement.engagementScore,
    },
    learnedMemoryInfluence: memoryBias,
    transitionDiagnostics: {
      bpmCompatibilityScore,

      energyFlowScore,

      harmonicCompatibilityScore,

      camelotCompatibility,

      keyMatchConfidence,

      vocalClashScore,

      transitionBlendScore,

      phraseAlignmentScore: topTransitionCandidate?.phraseAlignmentScore ?? 68,

      phraseRisk:
        (topTransitionCandidate?.phraseRisk as "safe" | "watch" | "risky" | undefined) ?? "watch",

      transitionWindowConfidence: topTransitionCandidate?.transitionWindowConfidence ?? 64,

      phraseCompatibility: topTransitionCandidate?.phraseCompatibility ?? "neutral",

      vocalOverlapRisk: topTransitionCandidate?.vocalOverlapRisk ?? 40,

      transitionBlendType:
        (topTransitionCandidate?.transitionBlendType as
          | "instrumental_blend"
          | "vocal_guarded_blend"
          | "percussive_blend"
          | undefined) ?? "percussive_blend",

      beatSyncScore: topTransitionCandidate?.beatSyncScore ?? 66,

      beatRisk:
        (topTransitionCandidate?.beatRisk as "safe" | "watch" | "risky" | undefined) ?? "watch",

      downbeatAlignmentConfidence: topTransitionCandidate?.downbeatAlignmentConfidence ?? 64,

      transitionTimingConfidence: topTransitionCandidate?.transitionTimingConfidence ?? 64,

      syncCompatibility:
        (topTransitionCandidate?.syncCompatibility as
          | "aligned_downbeat"
          | "matched_bar_window"
          | "late_phrase_alignment"
          | "drop_collision"
          | "unstable_window"
          | undefined) ?? "matched_bar_window",

      estimatedMixInTiming: topTransitionCandidate?.estimatedMixInTiming ?? 8,

      estimatedSwapWindow: topTransitionCandidate?.estimatedSwapWindow ?? "8-16 bars",

      estimatedBlendDuration: topTransitionCandidate?.estimatedBlendDuration ?? 12,

      downbeatAlignmentQuality:
        (topTransitionCandidate?.downbeatAlignmentQuality as "high" | "medium" | "low" | undefined) ?? "medium",

      transitionExecutionStyle:
        (topTransitionCandidate?.transitionExecutionStyle as
          | "smooth_blend"
          | "fast_cut"
          | "percussive_swap"
          | "harmonic_overlay"
          | "vocal_guarded_transition"
          | undefined) ?? "percussive_swap",

      transitionSignature: topTransitionCandidate?.memoryBias.signature ?? null,

      memoryConfidenceBias: topTransitionCandidate?.memoryBias.confidenceBias ?? 0,

      memoryRiskDelta: topTransitionCandidate?.memoryBias.riskDelta ?? 0,

      transitionReasoning: [
        bpmCompatibilityScore >= 85
          ? "Strong BPM alignment."
          : "BPM drift detected.",

        energyFlowScore >= 85
          ? "Smooth energy transition."
          : "Energy progression risk.",

        harmonicCompatibilityScore >= 85
          ? "Harmonic compatibility strong."
          : "Possible harmonic mismatch.",
        camelotCompatibility === "adjacent"
          ? "Adjacent Camelot transition retained."
          : camelotCompatibility === "distant"
            ? "Distant-key risk: incompatible harmonic jump."
            : camelotCompatibility === "relative"
              ? "Relative major/minor compatibility is acceptable."
              : camelotCompatibility === "match"
                ? "Same-key transition is harmonic-safe."
                : "Harmonic metadata unavailable; neutral fallback used.",

        vocalClashScore >= 80
          ? "Low vocal overlap risk."
          : "Potential vocal clash detected.",
        (topTransitionCandidate?.vocalDensityScore ?? 0) >= 55
          ? "Vocal density elevated; monitor clash window."
          : "Vocal density stays within blend-safe range.",
        (topTransitionCandidate?.instrumentalBlendConfidence ?? 0) >= 70
          ? "Instrumental blend confidence is strong."
          : "Instrumental blend confidence is moderate.",
        (topTransitionCandidate?.phraseCompatibility ?? "neutral") === "intro_outro_aligned"
          ? "Phrase alignment: intro and outro bars are aligned."
          : (topTransitionCandidate?.phraseCompatibility ?? "neutral") === "instrumental_to_vocal_drop"
            ? "Phrase alignment: instrumental intro supports vocal drop prep."
            : (topTransitionCandidate?.phraseCompatibility ?? "neutral") === "drop_collision"
              ? "Phrase alignment risk: abrupt drop collision possible."
              : (topTransitionCandidate?.phraseCompatibility ?? "neutral") === "vocal_overlap_risk"
                ? "Phrase alignment risk: vocal-to-vocal overlap requires guarded timing."
                : "Phrase alignment is neutral with safe fallback.",
        (topTransitionCandidate?.syncCompatibility ?? "matched_bar_window") === "aligned_downbeat"
          ? "Beat-grid sync: aligned downbeat transition."
          : (topTransitionCandidate?.syncCompatibility ?? "matched_bar_window") === "drop_collision"
            ? "Beat-grid sync risk: drop-on-drop collision."
            : (topTransitionCandidate?.syncCompatibility ?? "matched_bar_window") === "unstable_window"
              ? "Beat-grid sync risk: unstable transition windows."
              : (topTransitionCandidate?.syncCompatibility ?? "matched_bar_window") === "late_phrase_alignment"
                ? "Beat-grid sync warning: late phrase alignment penalty applied."
                : "Beat-grid sync: matched bar window detected.",
        ...(topTransitionCandidate?.memoryBias.rationale ?? []),
      ],
    },
  };
  return result;
}

export async function executeTransitionEnginePlan(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  mode: "review_only" | "execute";
}) {
  console.log("[ExecutePlan] before executeTransitionEnginePlan");
  const { evaluation } = params;
  if (params.mode === "review_only" || evaluation.executionPlan.nextAction === "hold_state") {
    console.log("[ExecutePlan] review-only-or-hold: returning without mutations");
    console.log("[ExecutePlan] after executeTransitionEnginePlan");
    return {
      ok: true,
      message: "Review-only mode or hold-state selected; no playback mutation executed.",
      execution: null,
    };
  }
  if (evaluation.executionPlan.nextAction === "reject_unsafe_transition") {
    console.log("[ExecutePlan] reject_unsafe_transition: returning blocked result");
    console.log("[ExecutePlan] after executeTransitionEnginePlan");
    return {
      ok: false,
      message: "Unsafe transition rejected by engine guardrails.",
      execution: null,
    };
  }
  if (!evaluation.executionPlan.targetTrackId) {
    console.log("[ExecutePlan] missing targetTrackId: returning blocked result");
    console.log("[ExecutePlan] after executeTransitionEnginePlan");
    return {
      ok: false,
      message: "No target track available for transition execution.",
      execution: null,
    };
  }

  console.log("[ExecutePlan] before queue executeGuardedPlaybackCommand");
  const queueResult = await Promise.race([
    executeGuardedPlaybackCommand({
      userId: params.userId,
      sessionId: evaluation.currentState.sessionId,
      commandType: "queue",
      executionSource: "live_session_sync",
      trackUri: `spotify:track:${evaluation.executionPlan.targetTrackId}`,
      commandPayload: {
        source: "transition_engine",
        confidence: evaluation.confidence.score,
        riskLevel: evaluation.riskLevel,
      },
      execute: () =>
        queueAiRecommendedTrack({
          userId: params.userId,
          spotifyTrackId: evaluation.executionPlan.targetTrackId as string,
        }),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Execute timeout")), 8000),
    ),
  ]);
  console.log("[ExecutePlan] after queue executeGuardedPlaybackCommand");
  if (!queueResult.ok) {
    console.log("[ExecutePlan] queue command failed: returning blocked result");
    console.log("[ExecutePlan] after executeTransitionEnginePlan");
    return {
      ok: false,
      message: queueResult.message ?? "Failed to queue transition track.",
      execution: { queueResult },
    };
  }

  console.log("[ExecutePlan] before play executeGuardedPlaybackCommand");
  const startPlaybackResult = await Promise.race([
    executeGuardedPlaybackCommand({
      userId: params.userId,
      sessionId: evaluation.currentState.sessionId,
      commandType: "play",
      executionSource: "live_session_sync",
      commandPayload: { source: "transition_engine" },
      execute: () => startSpotifyPlayback({ userId: params.userId }),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Execute timeout")), 8000),
    ),
  ]);
  console.log("[ExecutePlan] after play executeGuardedPlaybackCommand");

  if (evaluation.currentState.sessionId) {
    console.log("[ExecutePlan] before updateDjSession");
    await Promise.race([
      updateDjSession(params.userId, {
        sessionId: evaluation.currentState.sessionId,
        action: "queue_transition",
        track: evaluation.executionPlan.targetTrackLabel ?? undefined,
        bpm: evaluation.executionPlan.targetBpm,
        energy: evaluation.executionPlan.targetEnergy,
        aiDecision: `Transition Engine executed ${evaluation.executionPlan.nextAction} (${evaluation.confidence.score}% confidence, ${evaluation.riskLevel} risk).`,
        fallbackReason: startPlaybackResult.ok
          ? undefined
          : startPlaybackResult.message ?? undefined,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Execute timeout")), 8000),
      ),
    ]);
    console.log("[ExecutePlan] after updateDjSession");
  }

  void (async () => {
    console.log("[ExecutePlan] before storeRuntimeMemoryPattern");
    await Promise.race([
      storeRuntimeMemoryPattern({
        userId: params.userId,
        patternType: "successful_transition",
        patternContext:
          evaluation.transitionDiagnostics.transitionSignature ??
          `${evaluation.executionPlan.targetPhase}:unknown_signature`,
        successScore: queueResult.ok && startPlaybackResult.ok ? 78 : 28,
        confidenceScore: evaluation.confidence.score,
        learnedSignals: [
          {
            source: "transition_engine",
            signal: "transition_confidence",
            category: "confidence",
            value: evaluation.confidence.score / 100,
            weight: 0.9,
            polarity: queueResult.ok ? "positive" : "negative",
          },
          {
            source: "crowd_feedback",
            signal: "crowd_trust",
            category: "crowd",
            value: evaluation.crowdFeedbackInfluence.transitionTrustScore / 100,
            weight: 0.8,
            polarity: evaluation.crowdFeedbackInfluence.transitionTrustScore >= 50 ? "positive" : "negative",
          },
          {
            source: "audio_energy",
            signal: "audio_energy_drift",
            category: "energy",
            value: evaluation.audioEnergyInfluence.driftScore / 10,
            weight: 0.55,
            polarity: evaluation.audioEnergyInfluence.silenceDetected ? "negative" : "neutral",
          },
          {
            source: "operator",
            signal: "operator_intervention",
            category: "operator",
            value: evaluation.crowdFeedbackInfluence.operatorInterventionRate / 100,
            weight: 0.6,
            polarity: evaluation.crowdFeedbackInfluence.operatorInterventionRate > 60 ? "negative" : "neutral",
          },
          {
            source: "transition_engine",
            signal: "bpm_transition_quality",
            category: "bpm",
            value:
      evaluation.transitionDiagnostics
        .bpmCompatibilityScore / 100,
            weight: 0.92,
            polarity:
            evaluation.transitionDiagnostics
            .bpmCompatibilityScore >= 80
                ? "positive"
                : "negative",
          },

          {
            source: "transition_engine",
            signal: "energy_flow_quality",
            category: "energy",
            value:
              evaluation.transitionDiagnostics
                .energyFlowScore / 100,
            weight: 0.88,
            polarity:
              evaluation.transitionDiagnostics
                .energyFlowScore >= 80
                ? "positive"
                : "negative",
          },
          
          {
            source: "transition_engine",
            signal: "harmonic_transition_quality",
            category: "harmonic",
            value:
              evaluation.transitionDiagnostics
                .harmonicCompatibilityScore /
              100,
            weight: 0.82,
            polarity:
              evaluation.transitionDiagnostics
                .harmonicCompatibilityScore >=
              80
                ? "positive"
                : "negative",
          },

          {
            source: "transition_engine",
            signal: "vocal_transition_safety",
            category: "vocal",
            value: evaluation.transitionDiagnostics.vocalClashScore / 100,
            weight: 0.72,
            polarity:
            evaluation.transitionDiagnostics.vocalClashScore >= 75
                ? "positive"
                : "negative",
          },

          {
            source: "transition_engine",
            signal: "transition_blend_quality",
            category: "confidence",
            value:
            evaluation.transitionDiagnostics.transitionBlendScore / 100,
            weight: 0.96,
            polarity:
            evaluation.transitionDiagnostics.transitionBlendScore >= 80
                ? "positive"
                : "negative",
          },
        ],

        reinforce: queueResult.ok && startPlaybackResult.ok,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Execute timeout")), 8000),
      ),
    ]);
    console.log("[ExecutePlan] after storeRuntimeMemoryPattern");
  })().catch((error) => {
    console.log("[ExecutePlan] storeRuntimeMemoryPattern failed", error);
  });

  console.log("[ExecutePlan] after executeTransitionEnginePlan");
  return {
    ok: true,
    message: "Transition plan executed in supervised mode.",
    execution: {
      queueResult,
      startPlaybackResult,
    },
  };
}

