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
  evaluateTelemetryFreshness,
  refreshDeviceHeartbeat,
  refreshPlaybackHeartbeat,
  refreshQueueHeartbeat,
} from "@/lib/runtime/telemetry-heartbeat";
import {
  computeLearnedOrchestrationBias,
  getRuntimeMemoryPatterns,
  RuntimeMemoryPattern,
  storeRuntimeMemoryPattern,
} from "@/lib/ai/runtime-memory";
import {
  analyzeTransitionCompatibility,
  TrackPhraseProfile,
  TransitionCompatibilityResult,
} from "@/lib/ai/transition-patterns";
import {
  applyTransitionLearningObservation,
  computeCrowdAdaptationBias,
  computeExecutionStabilityBias,
  computeRecoveryLearningBias,
  computeTransitionLearningBias,
  createDefaultTransitionLearningProfile,
} from "@/lib/ai/transition-learning";

export type TransitionRiskLevel = "low" | "medium" | "high";
export type ExecutionStrategy =
  | "smooth_blend"
  | "harmonic_overlay"
  | "vocal_guarded_transition"
  | "percussive_swap"
  | "fast_cut"
  | "energy_ramp_blend"
  | "hold_state";
export type ExecutionReadinessState = "ready" | "prepare" | "guarded" | "blocked";
export type ExecutionWindowState = "stable_window" | "narrow_window" | "unstable_window" | "expired_window";
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
  nextAction:
    | "queue_next_track"
    | "advance_playback"
    | "hold_state"
    | "reject_unsafe_transition"
    | "prepare_fast_swap"
    | "guarded_transition"
    | "prepare_queue"
    | "prepare_execution_window"
    | "refresh_transport_state"
    | "recover_playback_sync";
  targetTrackId: string | null;
  targetTrackLabel: string | null;
  targetPhase: string;
  targetEnergy: number;
  targetBpm: number;
  blendDuration: "none" | "short" | "controlled" | "long";
  transitionStyle: "continuous" | "aggressive" | "vocal_safe" | "recovery";
};

type PlaybackOrchestrationState = {
  activeDevice: { id: string; is_restricted?: boolean } | null;
  playbackState: { isPlaying?: boolean; progressMs?: number } | null;
  queueStatus?: { syncStatus?: string } | null;
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
  executionStrategy: ExecutionStrategy;
  executionStrategyReasoning: string[];
  transitionAggressiveness: number;
  transitionComplexity: number;
  operatorAttentionRequired: boolean;
  executionReadiness: ExecutionReadinessState;
  executionReadinessScore: number;
  executionBlockers: string[];
  transportStability: number;
  cuePreparationConfidence: number;
  rollbackReadiness: number;
  deviceSynchronizationConfidence: number;
  executionWindowState: ExecutionWindowState;
  estimatedCueLeadTime: number;
  blendEntryConfidence: number;
  rollbackSafetyMargin: number;
  playbackFreshnessAgeMs: number;
  heartbeatContinuity: number;
  heartbeatDrift: number;
  freshnessRecoveryState: "stable" | "recovering" | "degraded";
  graceStabilizationActive: boolean;
  currentPhrasePosition: number;
  currentPhraseLength: number;
  phraseAlignmentConfidence: number;
  phraseTransitionWindow: "intro" | "buildup" | "phrase_boundary" | "chorus" | "outro" | "unstable";
  phraseMomentum: number;
  phraseStability: number;
  phraseTimingRisk: number;
  transitionPressure: number;
  transitionTimingConfidence: number;
  phraseHistory: Array<{
    timestamp: number;
    phrasePosition: number;
    alignmentConfidence: number;
    momentum: number;
    stability: number;
    timingRisk: number;
    transitionWindow: "intro" | "buildup" | "phrase_boundary" | "chorus" | "outro" | "unstable";
  }>;
  transitionPressureHistory: Array<{ timestamp: number; pressure: number; reason: string }>;
  phraseTimingReasoning: string[];
  harmonicCompatibility: number;
  emotionalContinuity: number;
  tonalStability: number;
  emotionalMomentum: number;
  harmonicTension: number;
  emotionalTransitionRisk: number;
  crowdEmotionalAlignment: number;
  emotionalEnergyDrift: number;
  harmonicResolutionConfidence: number;
  harmonicHistory: Array<{ timestamp: number; harmonicCompatibility: number; tonalStability: number; resolutionConfidence: number }>;
  emotionalMomentumHistory: Array<{ timestamp: number; momentum: number; continuity: number; crowdAlignment: number }>;
  harmonicTensionHistory: Array<{ timestamp: number; tension: number; emotionalRisk: number; reason: string }>;
  harmonicEmotionReasoning: string[];
  crowdEnergyState: "rising" | "stable" | "saturated" | "fatigued" | "recovering" | "unstable";
  crowdMomentumScore: number;
  crowdFatiguePressure: number;
  crowdRecoveryState: "stable" | "recovering" | "degraded";
  crowdEngagementConfidence: number;
  crowdEnergyVolatility: number;
  crowdHypeSaturation: number;
  crowdRecoveryConfidence: number;
  crowdAdaptationConfidence: number;
  crowdMomentumHistory: Array<{ timestamp: number; momentum: number; engagement: number; adaptationConfidence: number }>;
  crowdFatigueHistory: Array<{ timestamp: number; pressure: number; state: "rising" | "stable" | "saturated" | "fatigued" | "recovering" | "unstable" }>;
  crowdRecoveryHistory: Array<{ timestamp: number; recoveryConfidence: number; recoveryState: "stable" | "recovering" | "degraded" }>;
  crowdVolatilityHistory: Array<{ timestamp: number; volatility: number; hypeSaturation: number }>;
  crowdAdaptationReasoning: string[];
  narrativeFlowState: "build" | "rise" | "peak" | "sustain" | "release" | "recovery" | "unstable";
  narrativeMomentum: number;
  narrativeTension: number;
  narrativeRecoveryPressure: number;
  narrativeProgressionConfidence: number;
  narrativeContinuity: number;
  narrativeEnergyArc: number;
  narrativeResolutionConfidence: number;
  narrativeFatigueRisk: number;
  narrativeJourneyAlignment: number;
  narrativeMomentumHistory: Array<{ timestamp: number; momentum: number; continuity: number; progression: number }>;
  narrativeTensionHistory: Array<{ timestamp: number; tension: number; state: "build" | "rise" | "peak" | "sustain" | "release" | "recovery" | "unstable" }>;
  narrativeRecoveryHistory: Array<{ timestamp: number; recoveryPressure: number; resolutionConfidence: number; state: "build" | "rise" | "peak" | "sustain" | "release" | "recovery" | "unstable" }>;
  narrativeEnergyArcHistory: Array<{ timestamp: number; energyArc: number; fatigueRisk: number; journeyAlignment: number }>;
  narrativeReasoning: string[];
  cadenceState: "restrained" | "balanced" | "escalating" | "aggressive" | "saturated" | "recovering" | "unstable";
  cadenceDensity: number;
  cadenceAggression: number;
  cadenceRecoverySpacing: number;
  cadenceEscalationPressure: number;
  cadenceBreathingRoom: number;
  cadenceStability: number;
  cadenceAdaptationConfidence: number;
  cadenceFatigueLoad: number;
  cadenceNarrativeBalance: number;
  cadenceDensityHistory: Array<{ timestamp: number; density: number; state: "restrained" | "balanced" | "escalating" | "aggressive" | "saturated" | "recovering" | "unstable" }>;
  cadenceAggressionHistory: Array<{ timestamp: number; aggression: number; escalationPressure: number }>;
  cadenceRecoveryHistory: Array<{ timestamp: number; recoverySpacing: number; breathingRoom: number }>;
  cadenceStabilityHistory: Array<{ timestamp: number; stability: number; adaptationConfidence: number; fatigueLoad: number }>;
  cadenceReasoning: string[];
  orchestrationBalanceScore: number;
  orchestrationConflictPressure: number;
  orchestrationStability: number;
  orchestrationAlignment: number;
  orchestrationRecoveryPriority: number;
  orchestrationEscalationPriority: number;
  orchestrationContinuityPriority: number;
  orchestrationFatiguePriority: number;
  orchestrationNarrativePriority: number;
  orchestrationSynthesisConfidence: number;
  orchestrationBalanceHistory: Array<{ timestamp: number; balance: number; confidence: number }>;
  orchestrationConflictHistory: Array<{ timestamp: number; conflictPressure: number; recoveryPriority: number; escalationPriority: number }>;
  orchestrationAlignmentHistory: Array<{ timestamp: number; alignment: number; continuityPriority: number; narrativePriority: number }>;
  orchestrationStabilityHistory: Array<{ timestamp: number; stability: number; fatiguePriority: number; synthesisConfidence: number }>;
  orchestrationSynthesisReasoning: string[];

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

    transitionExecutionStyle: ExecutionStrategy;

    transitionSignature: string | null;

    memoryConfidenceBias: number;

    memoryRiskDelta: number;

    learningConfidenceBias: number;

    learningRiskBias: number;

    stabilizationPriority: number;

    escalationClamp: number;

    learningReasons: string[];

    compatibilityScore: number;

    compatibilityHarmonicScore: number;

    compatibilityPhraseAlignmentScore: number;

    compatibilityVocalClashScore: number;

    compatibilityEnergyFlowScore: number;

    compatibilityTensionContinuityScore: number;

    recommendedArchetype:
      | "smooth_blend"
      | "fast_cut"
      | "echo_exit"
      | "tension_swap"
      | "energy_slam"
      | "vocal_swap"
      | "halftime_reset"
      | "atmospheric_bridge"
      | "percussion_overlay";

    compatibilityRiskLevel: "safe" | "moderate" | "risky" | "dangerous";

    compatibilityReasoning: string[];

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

function derivePhraseSection(params: {
  phase: string | null;
  speechiness?: number | null;
  instrumentalness?: number | null;
  energy?: number | null;
  valence?: number | null;
  dropIntensity?: number | null;
  breakdownPresence?: boolean | null;
}): TrackPhraseProfile["phraseSection"] {
  const phase = (params.phase ?? "").toLowerCase();
  const speechiness = params.speechiness ?? 0.2;
  const instrumentalness = params.instrumentalness ?? 0.35;
  const energy = params.energy ?? 5;
  const valence = params.valence ?? 0.5;
  const dropIntensity = params.dropIntensity ?? 5;
  if (phase.includes("warmup")) return "intro";
  if (phase.includes("cooldown") || phase.includes("closing")) return "outro";
  if (params.breakdownPresence || (instrumentalness >= 0.6 && energy <= 5.5)) return "breakdown";
  if (dropIntensity >= 7.2 && energy >= 7) return "drop";
  if (energy >= 6.4 && valence >= 0.55) return "buildup";
  if (speechiness >= 0.38) return "verse";
  if (instrumentalness >= 0.5) return "bridge";
  return "verse";
}

function deriveVocalDensity(speechiness?: number | null): TrackPhraseProfile["vocalDensity"] {
  const s = speechiness ?? 0.2;
  if (s < 0.14) return "none";
  if (s < 0.28) return "light";
  if (s < 0.44) return "medium";
  return "heavy";
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

const phraseTimingStore = new Map<
  string,
  {
    phraseHistory: TransitionEvaluationResult["phraseHistory"];
    transitionPressureHistory: TransitionEvaluationResult["transitionPressureHistory"];
    transitionPressure: number;
  }
>();

const harmonicEmotionStore = new Map<
  string,
  {
    harmonicHistory: TransitionEvaluationResult["harmonicHistory"];
    emotionalMomentumHistory: TransitionEvaluationResult["emotionalMomentumHistory"];
    harmonicTensionHistory: TransitionEvaluationResult["harmonicTensionHistory"];
    unresolvedTransitionCount: number;
  }
>();

const crowdAdaptationStore = new Map<
  string,
  {
    crowdMomentumHistory: TransitionEvaluationResult["crowdMomentumHistory"];
    crowdFatigueHistory: TransitionEvaluationResult["crowdFatigueHistory"];
    crowdRecoveryHistory: TransitionEvaluationResult["crowdRecoveryHistory"];
    crowdVolatilityHistory: TransitionEvaluationResult["crowdVolatilityHistory"];
    fatiguePressure: number;
  }
>();

const narrativeFlowStore = new Map<
  string,
  {
    narrativeMomentumHistory: TransitionEvaluationResult["narrativeMomentumHistory"];
    narrativeTensionHistory: TransitionEvaluationResult["narrativeTensionHistory"];
    narrativeRecoveryHistory: TransitionEvaluationResult["narrativeRecoveryHistory"];
    narrativeEnergyArcHistory: TransitionEvaluationResult["narrativeEnergyArcHistory"];
    narrativeFlowState: TransitionEvaluationResult["narrativeFlowState"];
    lastStateChangedAt: number;
  }
>();

const adaptiveCadenceStore = new Map<
  string,
  {
    cadenceDensityHistory: TransitionEvaluationResult["cadenceDensityHistory"];
    cadenceAggressionHistory: TransitionEvaluationResult["cadenceAggressionHistory"];
    cadenceRecoveryHistory: TransitionEvaluationResult["cadenceRecoveryHistory"];
    cadenceStabilityHistory: TransitionEvaluationResult["cadenceStabilityHistory"];
    cadenceState: TransitionEvaluationResult["cadenceState"];
    cadenceEscalationPressure: number;
    lastStateChangedAt: number;
  }
>();

const orchestrationSynthesisStore = new Map<
  string,
  {
    orchestrationBalanceHistory: TransitionEvaluationResult["orchestrationBalanceHistory"];
    orchestrationConflictHistory: TransitionEvaluationResult["orchestrationConflictHistory"];
    orchestrationAlignmentHistory: TransitionEvaluationResult["orchestrationAlignmentHistory"];
    orchestrationStabilityHistory: TransitionEvaluationResult["orchestrationStabilityHistory"];
    orchestrationRecoveryPriority: number;
    orchestrationEscalationPriority: number;
    orchestrationContinuityPriority: number;
    orchestrationFatiguePriority: number;
    orchestrationNarrativePriority: number;
  }
>();

function boundedPush<T>(list: T[], next: T, max = 32) {
  const merged = [...list, next];
  return merged.length > max ? merged.slice(merged.length - max) : merged;
}

function evaluatePhraseTiming(params: {
  userId: string;
  playbackProgressMs: number;
  bpm: number;
  energy: number;
  transitionAggressiveness: number;
  executionWindowState: ExecutionWindowState;
  playbackFreshnessAgeMs: number;
  runtimeConvergenceScore: number;
  crowdMomentumProjection?: number;
  phraseLengthHint?: number | null;
  phraseRisk?: "safe" | "watch" | "risky";
  vocalOverlapRisk?: number;
  heartbeatDrift?: number;
}) {
  const now = Date.now();
  const previous = phraseTimingStore.get(params.userId) ?? {
    phraseHistory: [],
    transitionPressureHistory: [],
    transitionPressure: 28,
  };
  const phraseLength = clamp(params.phraseLengthHint ?? 32, 16, 64);
  const beatMs = 60_000 / Math.max(1, params.bpm);
  const barMs = beatMs * 4;
  const phraseDurationMs = barMs * phraseLength;
  const phrasePosition = Number(
    clamp(((params.playbackProgressMs % phraseDurationMs) / Math.max(phraseDurationMs, 1)) * 100, 0, 100).toFixed(2),
  );
  const phraseTransitionWindow: TransitionEvaluationResult["phraseTransitionWindow"] =
    params.executionWindowState === "unstable_window" || params.executionWindowState === "expired_window"
      ? "unstable"
      : phrasePosition < 14
        ? "intro"
        : phrasePosition < 34
          ? "buildup"
          : phrasePosition >= 46 && phrasePosition <= 54
            ? "phrase_boundary"
            : phrasePosition < 78
              ? "chorus"
              : "outro";
  const windowBoost =
    phraseTransitionWindow === "phrase_boundary"
      ? 20
      : phraseTransitionWindow === "outro"
        ? 14
        : phraseTransitionWindow === "buildup" && phrasePosition >= 28
          ? 10
          : phraseTransitionWindow === "unstable"
            ? -20
            : 0;
  const phraseAlignmentConfidence = Number(
    clamp(
      params.runtimeConvergenceScore * 0.3 +
        (100 - Math.min(100, params.playbackFreshnessAgeMs / 300)) * 0.2 +
        (params.executionWindowState === "stable_window" ? 88 : params.executionWindowState === "narrow_window" ? 68 : 35) *
          0.2 +
        (100 - (params.vocalOverlapRisk ?? 42)) * 0.12 +
        (params.phraseRisk === "safe" ? 86 : params.phraseRisk === "watch" ? 64 : 36) * 0.18 +
        windowBoost,
      0,
      100,
    ).toFixed(2),
  );
  const phraseMomentum = Number(
    clamp(
      params.energy * 8 * 0.45 +
        (params.crowdMomentumProjection ?? 50) * 0.45 +
        (phraseTransitionWindow === "buildup" || phraseTransitionWindow === "chorus" ? 6 : 0),
      0,
      100,
    ).toFixed(2),
  );
  const phraseStability = Number(
    clamp(
      phraseAlignmentConfidence * 0.42 +
        (100 - (params.heartbeatDrift ?? 25)) * 0.18 +
        (params.executionWindowState === "stable_window" ? 88 : params.executionWindowState === "narrow_window" ? 62 : 34) *
          0.24 +
        (params.runtimeConvergenceScore * 0.16),
      0,
      100,
    ).toFixed(2),
  );
  const staleFreshnessRecurring =
    previous.phraseHistory.slice(-3).filter((entry) => entry.timingRisk >= 62).length >= 2 &&
    params.playbackFreshnessAgeMs >= 18_000;
  const pressureIncrease =
    (params.energy <= 4.6 ? 5 : 0) +
    ((params.crowdMomentumProjection ?? 50) < 46 ? 6 : 0) +
    (phraseTransitionWindow === "chorus" && phrasePosition > 68 ? 4 : 0) +
    (phraseTransitionWindow === "unstable" ? 8 : 0) +
    (params.executionWindowState === "narrow_window" ? 4 : params.executionWindowState === "stable_window" ? -4 : 7) +
    (staleFreshnessRecurring ? 4 : 0);
  const pressureDecay =
    phraseTransitionWindow === "phrase_boundary" && phraseStability >= 70 && params.runtimeConvergenceScore >= 65 ? 5 : 0;
  const transitionPressure = Number(clamp(previous.transitionPressure + pressureIncrease - pressureDecay, 0, 100).toFixed(2));
  const transitionTimingConfidence = Number(
    clamp(
      phraseAlignmentConfidence * 0.36 +
        phraseStability * 0.3 +
        (100 - transitionPressure) * 0.18 +
        (phraseTransitionWindow === "phrase_boundary" || phraseTransitionWindow === "outro" ? 82 : 56) * 0.16,
      0,
      100,
    ).toFixed(2),
  );
  const phraseTimingRisk = Number(
    clamp(
      (100 - transitionTimingConfidence) * 0.6 +
        (phraseTransitionWindow === "unstable" ? 24 : 0) +
        ((params.vocalOverlapRisk ?? 42) * 0.2) +
        ((params.heartbeatDrift ?? 25) * 0.2),
      0,
      100,
    ).toFixed(2),
  );
  const phraseHistory = boundedPush(previous.phraseHistory, {
    timestamp: now,
    phrasePosition,
    alignmentConfidence: phraseAlignmentConfidence,
    momentum: phraseMomentum,
    stability: phraseStability,
    timingRisk: phraseTimingRisk,
    transitionWindow: phraseTransitionWindow,
  });
  const transitionPressureHistory = boundedPush(previous.transitionPressureHistory, {
    timestamp: now,
    pressure: transitionPressure,
    reason:
      pressureIncrease > pressureDecay
        ? "Transition pressure rising from phrase instability or missed timing opportunities."
        : "Transition pressure eased by stable boundary execution conditions.",
  });
  phraseTimingStore.set(params.userId, {
    phraseHistory,
    transitionPressureHistory,
    transitionPressure,
  });
  const phraseTimingReasoning: string[] = [];
  if (transitionTimingConfidence >= 78) phraseTimingReasoning.push("Transition timing improved with favorable phrase window.");
  if (phraseTransitionWindow === "phrase_boundary") phraseTimingReasoning.push("Phrase boundary favorable for supervised transition timing.");
  if (phraseTransitionWindow === "unstable") phraseTimingReasoning.push("Phrase timing unstable due to execution window instability.");
  if (transitionPressure >= 62) phraseTimingReasoning.push("Transition pressure rising from repeated timing friction.");
  if (phraseTimingRisk >= 62) phraseTimingReasoning.push("Timing risk elevated by drift, vocal overlap, or unstable phrase context.");
  return {
    currentPhrasePosition: phrasePosition,
    currentPhraseLength: phraseLength,
    phraseAlignmentConfidence,
    phraseTransitionWindow,
    phraseMomentum,
    phraseStability,
    phraseTimingRisk,
    transitionPressure,
    transitionTimingConfidence,
    phraseHistory,
    transitionPressureHistory,
    phraseTimingReasoning,
  };
}

function evaluateHarmonicEmotion(params: {
  userId: string;
  camelotCompatibility: CamelotCompatibility;
  bpmContinuityScore: number;
  phraseTimingConfidence: number;
  transitionAggressiveness: number;
  vocalOverlapRisk: number;
  energyTrajectory: number;
  crowdMomentum: number;
  transitionPressure: number;
  phraseStability: number;
  runtimeConvergenceScore: number;
}) {
  const now = Date.now();
  const previous = harmonicEmotionStore.get(params.userId) ?? {
    harmonicHistory: [],
    emotionalMomentumHistory: [],
    harmonicTensionHistory: [],
    unresolvedTransitionCount: 0,
  };
  const camelotScore =
    params.camelotCompatibility === "match"
      ? 95
      : params.camelotCompatibility === "adjacent"
        ? 86
        : params.camelotCompatibility === "relative"
          ? 74
          : params.camelotCompatibility === "unknown"
            ? 58
            : 34;
  const energyDrift = Number(clamp(Math.abs(params.energyTrajectory) * 14.5, 0, 100).toFixed(2));
  const crowdEmotionalAlignment = Number(
    clamp(
      params.crowdMomentum * 0.5 +
        (100 - params.transitionPressure) * 0.2 +
        params.phraseStability * 0.18 +
        params.runtimeConvergenceScore * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const emotionalMomentum = Number(
    clamp(
      params.crowdMomentum * 0.45 +
        (100 - energyDrift) * 0.2 +
        params.phraseTimingConfidence * 0.2 +
        (100 - params.transitionAggressiveness) * 0.15,
      0,
      100,
    ).toFixed(2),
  );
  const tonalStability = Number(
    clamp(
      camelotScore * 0.4 +
        params.bpmContinuityScore * 0.22 +
        params.phraseStability * 0.2 +
        (100 - params.vocalOverlapRisk) * 0.18,
      0,
      100,
    ).toFixed(2),
  );
  const previousHarmonicTension = previous.harmonicTensionHistory[previous.harmonicTensionHistory.length - 1]?.tension ?? 42;
  const tensionIncrease =
    (camelotScore < 52 ? 7 : 0) +
    (params.bpmContinuityScore < 60 ? 5 : 0) +
    (params.phraseTimingConfidence < 58 ? 5 : 0) +
    (energyDrift > 62 ? 4 : 0) +
    (params.vocalOverlapRisk > 58 ? 4 : 0) +
    (params.transitionAggressiveness > 70 ? 4 : 0) +
    (previous.unresolvedTransitionCount >= 2 ? 2 : 0);
  const tensionDecrease =
    tonalStability >= 70 && params.phraseTimingConfidence >= 68 && params.transitionPressure <= 56 ? 9 : 3;
  const tensionCarryover =
    previousHarmonicTension *
    (tonalStability >= 72 && params.phraseTimingConfidence >= 70 && params.transitionPressure <= 54 ? 0.84 : 0.9);
  const harmonicTension = Number(
    clamp(
      tensionCarryover + tensionIncrease - tensionDecrease,
      0,
      100,
    ).toFixed(2),
  );
  const harmonicCompatibility = Number(
    clamp(
      camelotScore * 0.55 + params.bpmContinuityScore * 0.15 + params.phraseTimingConfidence * 0.15 + tonalStability * 0.15,
      0,
      100,
    ).toFixed(2),
  );
  const emotionalContinuity = Number(
    clamp(
      harmonicCompatibility * 0.26 +
        params.phraseTimingConfidence * 0.2 +
        crowdEmotionalAlignment * 0.18 +
        (100 - params.transitionPressure) * 0.12 +
        params.bpmContinuityScore * 0.12 +
        (100 - harmonicTension) * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const emotionalTransitionRisk = Number(
    clamp(
      harmonicTension * 0.35 +
        (100 - emotionalContinuity) * 0.3 +
        params.transitionAggressiveness * 0.15 +
        energyDrift * 0.1 +
        params.vocalOverlapRisk * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const harmonicResolutionConfidence = Number(
    clamp(
      (100 - harmonicTension) * 0.4 +
        harmonicCompatibility * 0.2 +
        emotionalContinuity * 0.16 +
        params.phraseStability * 0.14 +
        params.runtimeConvergenceScore * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const unresolvedTransitionCount =
    emotionalTransitionRisk >= 62
      ? previous.unresolvedTransitionCount + 1
      : Math.max(0, previous.unresolvedTransitionCount - 2);
  const harmonicHistory = boundedPush(previous.harmonicHistory, {
    timestamp: now,
    harmonicCompatibility,
    tonalStability,
    resolutionConfidence: harmonicResolutionConfidence,
  });
  const emotionalMomentumHistory = boundedPush(previous.emotionalMomentumHistory, {
    timestamp: now,
    momentum: emotionalMomentum,
    continuity: emotionalContinuity,
    crowdAlignment: crowdEmotionalAlignment,
  });
  const harmonicTensionHistory = boundedPush(previous.harmonicTensionHistory, {
    timestamp: now,
    tension: harmonicTension,
    emotionalRisk: emotionalTransitionRisk,
    reason:
      emotionalTransitionRisk >= 62
        ? "Harmonic tension elevated by tonal mismatch, instability, or unresolved emotional cadence."
        : "Harmonic tension easing through stable progression and phrase-aligned timing.",
  });
  harmonicEmotionStore.set(params.userId, {
    harmonicHistory,
    emotionalMomentumHistory,
    harmonicTensionHistory,
    unresolvedTransitionCount,
  });
  const harmonicEmotionReasoning: string[] = [];
  if (harmonicCompatibility >= 78) harmonicEmotionReasoning.push("Harmonic compatibility improved with stable tonal progression.");
  if (energyDrift >= 58) harmonicEmotionReasoning.push("Emotional energy drift increased due to trajectory overshoot.");
  if (harmonicTension >= 62) harmonicEmotionReasoning.push("Harmonic tension elevated from unresolved transition pressure.");
  if (harmonicTension <= previousHarmonicTension - 4) {
    harmonicEmotionReasoning.push("Harmonic tension relaxed as resolution recovery outweighed carry-over pressure.");
  }
  if (emotionalContinuity >= 72) harmonicEmotionReasoning.push("Emotional continuity stabilized under phrase-aligned cadence.");
  if (emotionalTransitionRisk >= 62) harmonicEmotionReasoning.push("Harmonic-emotional transition currently risky; supervision advised.");
  return {
    harmonicCompatibility,
    emotionalContinuity,
    tonalStability,
    emotionalMomentum,
    harmonicTension,
    emotionalTransitionRisk,
    crowdEmotionalAlignment,
    emotionalEnergyDrift: energyDrift,
    harmonicResolutionConfidence,
    harmonicHistory,
    emotionalMomentumHistory,
    harmonicTensionHistory,
    harmonicEmotionReasoning,
  };
}

function evaluateCrowdAdaptation(params: {
  userId: string;
  emotionalContinuity: number;
  transitionPressure: number;
  phraseTimingConfidence: number;
  harmonicTension: number;
  recentTransitionCadence: number;
  runtimeConvergence: number;
  crowdEmotionalAlignment: number;
  energyTrajectory: number;
  bpmMovement: number;
  recentStabilizationSuccess: number;
  heartbeatDrift: number;
}) {
  const now = Date.now();
  const previous = crowdAdaptationStore.get(params.userId) ?? {
    crowdMomentumHistory: [],
    crowdFatigueHistory: [],
    crowdRecoveryHistory: [],
    crowdVolatilityHistory: [],
    fatiguePressure: 30,
  };
  const previousFatiguePressure = previous.fatiguePressure;
  const previousVolatility = previous.crowdVolatilityHistory[previous.crowdVolatilityHistory.length - 1]?.volatility ?? 42;
  const healthySpacingConfidence = Number(
    clamp(
      (100 - params.recentTransitionCadence) * 0.55 +
        params.phraseTimingConfidence * 0.25 +
        params.recentStabilizationSuccess * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const momentumScore = Number(
    clamp(
      params.crowdEmotionalAlignment * 0.35 +
        params.emotionalContinuity * 0.25 +
        (100 - params.transitionPressure) * 0.12 +
        params.runtimeConvergence * 0.16 +
        params.recentStabilizationSuccess * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const hypeSaturation = Number(
    clamp(
      Math.max(0, params.energyTrajectory) * 10.5 +
        params.recentTransitionCadence * 0.35 +
        Math.max(0, 65 - params.phraseTimingConfidence) * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const fatigueIncrease =
    (params.recentTransitionCadence > 72 ? 4 : 0) +
    (params.energyTrajectory > 1.2 ? 3 : 0) +
    (hypeSaturation > 68 ? 5 : 0) +
    (params.emotionalContinuity < 58 ? 4 : 0) +
    (params.harmonicTension > 60 ? 4 : 0) +
    (params.recentTransitionCadence > 84 ? 3 : 0);
  const fatigueDecay =
    params.phraseTimingConfidence >= 70 &&
    params.emotionalContinuity >= 68 &&
    params.transitionPressure <= 56 &&
    params.energyTrajectory <= 0.8
      ? 8
      : healthySpacingConfidence >= 64
        ? 5
        : 2;
  const crowdFatiguePressure = Number(clamp(previous.fatiguePressure + fatigueIncrease - fatigueDecay, 0, 100).toFixed(2));
  const rawVolatility = Number(
    clamp(
      params.heartbeatDrift * 0.18 +
        Math.min(100, params.bpmMovement * 9) * 0.17 +
        (100 - params.runtimeConvergence) * 0.16 +
        Math.max(0, 100 - params.emotionalContinuity) * 0.15 +
        Math.max(0, 100 - params.recentStabilizationSuccess) * 0.15,
      0,
      100,
    ).toFixed(2),
  );
  const crowdEnergyVolatility = Number(
    clamp(
      rawVolatility * 0.74 +
        previousVolatility * 0.26 -
        (healthySpacingConfidence >= 65 ? 4 : 0),
      0,
      100,
    ).toFixed(2),
  );
  const crowdRecoveryConfidence = Number(
    clamp(
      params.recentStabilizationSuccess * 0.3 +
        params.emotionalContinuity * 0.22 +
        (100 - hypeSaturation) * 0.16 +
        params.phraseTimingConfidence * 0.12 +
        (100 - params.transitionPressure) * 0.12 +
        healthySpacingConfidence * 0.08,
      0,
      100,
    ).toFixed(2),
  );
  const crowdEngagementConfidence = Number(
    clamp(
      momentumScore * 0.42 +
        params.crowdEmotionalAlignment * 0.24 +
        (100 - crowdFatiguePressure) * 0.16 +
        (100 - crowdEnergyVolatility) * 0.18,
      0,
      100,
    ).toFixed(2),
  );
  const crowdRecoveryState: TransitionEvaluationResult["crowdRecoveryState"] =
    crowdRecoveryConfidence >= 70 ? "stable" : crowdRecoveryConfidence >= 52 ? "recovering" : "degraded";
  const crowdEnergyState: TransitionEvaluationResult["crowdEnergyState"] =
    crowdEnergyVolatility >= 76 && crowdRecoveryConfidence < 62
      ? "unstable"
      : crowdFatiguePressure >= 72
        ? "fatigued"
        : crowdRecoveryState === "recovering" && crowdEnergyVolatility <= 72
          ? "recovering"
          : hypeSaturation >= 72
            ? "saturated"
            : momentumScore >= 68
              ? "rising"
              : "stable";
  const crowdAdaptationConfidence = Number(
    clamp(
      momentumScore * 0.22 +
        (100 - crowdFatiguePressure) * 0.22 +
        crowdRecoveryConfidence * 0.2 +
        (100 - crowdEnergyVolatility) * 0.16 +
        params.emotionalContinuity * 0.1 +
        params.runtimeConvergence * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const crowdMomentumHistory = boundedPush(previous.crowdMomentumHistory, {
    timestamp: now,
    momentum: momentumScore,
    engagement: crowdEngagementConfidence,
    adaptationConfidence: crowdAdaptationConfidence,
  }, 40);
  const crowdFatigueHistory = boundedPush(previous.crowdFatigueHistory, {
    timestamp: now,
    pressure: crowdFatiguePressure,
    state: crowdEnergyState,
  }, 40);
  const crowdRecoveryHistory = boundedPush(previous.crowdRecoveryHistory, {
    timestamp: now,
    recoveryConfidence: crowdRecoveryConfidence,
    recoveryState: crowdRecoveryState,
  }, 40);
  const crowdVolatilityHistory = boundedPush(previous.crowdVolatilityHistory, {
    timestamp: now,
    volatility: crowdEnergyVolatility,
    hypeSaturation,
  }, 40);
  crowdAdaptationStore.set(params.userId, {
    crowdMomentumHistory,
    crowdFatigueHistory,
    crowdRecoveryHistory,
    crowdVolatilityHistory,
    fatiguePressure: crowdFatiguePressure,
  });
  const crowdAdaptationReasoning: string[] = [];
  if (crowdFatiguePressure >= 64) crowdAdaptationReasoning.push("Crowd fatigue pressure increased from dense or aggressive transition cadence.");
  if (crowdFatiguePressure <= previousFatiguePressure - 3) {
    crowdAdaptationReasoning.push("Fatigue pressure reduced as spacing and stabilization support improved.");
  }
  if (crowdRecoveryConfidence >= 70) crowdAdaptationReasoning.push("Crowd recovery stabilized under healthy emotional continuity.");
  if (healthySpacingConfidence >= 66 && crowdRecoveryConfidence >= 64) {
    crowdAdaptationReasoning.push("Healthy spacing improved recovery confidence and relaxed adaptation pressure.");
  }
  if (hypeSaturation >= 70) crowdAdaptationReasoning.push("Crowd hype saturation elevated; avoid excessive escalation.");
  if (crowdEnergyState === "unstable") crowdAdaptationReasoning.push("Crowd state unstable due to volatility and unresolved timing pressure.");
  if (crowdEnergyVolatility <= previousVolatility - 4) {
    crowdAdaptationReasoning.push("Volatility relaxed after cadence spacing and recovery gains held steady.");
  }
  if (crowdAdaptationConfidence >= 72) crowdAdaptationReasoning.push("Crowd adaptation confidence improved under stable momentum/recovery balance.");
  return {
    crowdEnergyState,
    crowdMomentumScore: momentumScore,
    crowdFatiguePressure,
    crowdRecoveryState,
    crowdEngagementConfidence,
    crowdEnergyVolatility,
    crowdHypeSaturation: hypeSaturation,
    crowdRecoveryConfidence,
    crowdAdaptationConfidence,
    crowdMomentumHistory,
    crowdFatigueHistory,
    crowdRecoveryHistory,
    crowdVolatilityHistory,
    crowdAdaptationReasoning,
  };
}

function evaluateNarrativeFlow(params: {
  userId: string;
  crowdAdaptation: {
    crowdMomentumScore: number;
    crowdFatiguePressure: number;
    crowdRecoveryConfidence: number;
    crowdEnergyVolatility: number;
    crowdHypeSaturation: number;
    crowdAdaptationConfidence: number;
  };
  emotionalContinuity: number;
  harmonicTension: number;
  phraseTimingConfidence: number;
  runtimeConvergence: number;
  recentTransitionCadence: number;
  bpmMovementTrajectory: number;
  recentRecoveryCycles: number;
  transitionPressure: number;
  emotionalDrift: number;
  recentStabilizationSuccess: number;
}) {
  const now = Date.now();
  const previous = narrativeFlowStore.get(params.userId) ?? {
    narrativeMomentumHistory: [],
    narrativeTensionHistory: [],
    narrativeRecoveryHistory: [],
    narrativeEnergyArcHistory: [],
    narrativeFlowState: "build" as const,
    lastStateChangedAt: now,
  };
  const narrativeMomentum = Number(
    clamp(
      params.crowdAdaptation.crowdMomentumScore * 0.32 +
        params.emotionalContinuity * 0.2 +
        params.crowdAdaptation.crowdAdaptationConfidence * 0.16 +
        params.runtimeConvergence * 0.16 +
        params.recentStabilizationSuccess * 0.16,
      0,
      100,
    ).toFixed(2),
  );
  const cadenceStabilitySignal = Number(
    clamp(
      (100 - params.recentTransitionCadence) * 0.55 +
        params.phraseTimingConfidence * 0.25 +
        params.recentStabilizationSuccess * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const tensionIncrease =
    (params.transitionPressure > 66 ? 7 : 0) +
    (params.harmonicTension > 62 ? 6 : 0) +
    (params.crowdAdaptation.crowdHypeSaturation > 72 ? 5 : 0) +
    (params.recentTransitionCadence > 76 ? 4 : 0) +
    (params.emotionalContinuity < 58 ? 4 : 0) +
    (params.recentRecoveryCycles >= 3 ? 2 : 0);
  const tensionDecay =
    params.phraseTimingConfidence >= 70 &&
    params.emotionalContinuity >= 70 &&
    params.runtimeConvergence >= 68 &&
    params.transitionPressure <= 56
      ? 10
      : cadenceStabilitySignal >= 64
        ? 6
        : 3;
  const previousNarrativeTension = previous.narrativeTensionHistory[previous.narrativeTensionHistory.length - 1]?.tension ?? 44;
  const narrativeTension = Number(clamp(previousNarrativeTension + tensionIncrease - tensionDecay, 0, 100).toFixed(2));
  const sustainedPeakPenalty = previous.narrativeTensionHistory.slice(-5).filter((item) => item.tension >= 72).length >= 3 ? 8 : 0;
  const narrativeEnergyArc = Number(
    clamp(
      (100 - Math.abs(params.bpmMovementTrajectory - 6) * 8) * 0.2 +
        (100 - params.crowdAdaptation.crowdHypeSaturation) * 0.18 +
        params.emotionalContinuity * 0.22 +
        params.phraseTimingConfidence * 0.2 +
        (100 - params.transitionPressure) * 0.2 -
        sustainedPeakPenalty,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeContinuity = Number(
    clamp(
      params.emotionalContinuity * 0.28 +
        params.crowdAdaptation.crowdAdaptationConfidence * 0.18 +
        (100 - params.harmonicTension) * 0.14 +
        params.phraseTimingConfidence * 0.16 +
        (100 - params.crowdAdaptation.crowdEnergyVolatility) * 0.1 +
        params.runtimeConvergence * 0.08 +
        cadenceStabilitySignal * 0.06,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeFatigueRisk = Number(
    clamp(
      params.crowdAdaptation.crowdFatiguePressure * 0.36 +
        params.crowdAdaptation.crowdHypeSaturation * 0.2 +
        narrativeTension * 0.2 +
        params.recentTransitionCadence * 0.14 +
        Math.max(0, 100 - params.recentStabilizationSuccess) * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeJourneyAlignment = Number(
    clamp(
      narrativeMomentum * 0.2 +
        narrativeEnergyArc * 0.2 +
        narrativeContinuity * 0.2 +
        (100 - narrativeFatigueRisk) * 0.16 +
        params.runtimeConvergence * 0.14 +
        params.crowdAdaptation.crowdRecoveryConfidence * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeRecoveryPressure = Number(
    clamp(
      narrativeTension * 0.34 +
        narrativeFatigueRisk * 0.28 +
        params.crowdAdaptation.crowdEnergyVolatility * 0.16 +
        (100 - params.phraseTimingConfidence) * 0.12 +
        (100 - params.recentStabilizationSuccess) * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeResolutionConfidence = Number(
    clamp(
      (100 - narrativeTension) * 0.26 +
        (100 - narrativeRecoveryPressure) * 0.2 +
        params.crowdAdaptation.crowdRecoveryConfidence * 0.22 +
        narrativeContinuity * 0.18 +
        params.runtimeConvergence * 0.14,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeProgressionConfidence = Number(
    clamp(
      narrativeJourneyAlignment * 0.3 +
        narrativeEnergyArc * 0.2 +
        narrativeContinuity * 0.18 +
        narrativeResolutionConfidence * 0.16 +
        (100 - narrativeFatigueRisk) * 0.16,
      0,
      100,
    ).toFixed(2),
  );
  const unstableRecentCount = previous.narrativeTensionHistory.slice(-4).filter((item) => item.state === "unstable").length;
  const candidateState: TransitionEvaluationResult["narrativeFlowState"] =
    params.crowdAdaptation.crowdEnergyVolatility >= 76 || narrativeContinuity < 42
      ? "unstable"
      : narrativeRecoveryPressure >= 72 || narrativeFatigueRisk >= 74
        ? "recovery"
        : params.crowdAdaptation.crowdHypeSaturation >= 78 && narrativeTension >= 72
          ? "peak"
          : narrativeMomentum >= 72 && narrativeTension >= 60
            ? "rise"
            : narrativeMomentum >= 58 && narrativeContinuity >= 64 && narrativeTension < 68
              ? "sustain"
              : narrativeTension <= 46 && narrativeResolutionConfidence >= 68
                ? "release"
                : "build";
  const minStateHoldMs = 14_000;
  const recentlyChanged = now - previous.lastStateChangedAt < minStateHoldMs;
  const flipBlocked =
    recentlyChanged &&
    ((previous.narrativeFlowState === "peak" && (candidateState === "recovery" || candidateState === "unstable")) ||
      (previous.narrativeFlowState === "recovery" && (candidateState === "peak" || candidateState === "unstable")) ||
      (previous.narrativeFlowState === "unstable" && (candidateState === "peak" || candidateState === "recovery")));
  const unstableLoopRecovered =
    unstableRecentCount >= 3 &&
    narrativeRecoveryPressure <= 66 &&
    narrativeContinuity >= 56 &&
    params.crowdAdaptation.crowdEnergyVolatility <= 64;
  const narrativeFlowState = unstableLoopRecovered
    ? "recovery"
    : flipBlocked
      ? previous.narrativeFlowState
      : candidateState;
  const stateChanged = narrativeFlowState !== previous.narrativeFlowState;
  const lastStateChangedAt = stateChanged ? now : previous.lastStateChangedAt;
  const narrativeMomentumHistory = boundedPush(
    previous.narrativeMomentumHistory,
    { timestamp: now, momentum: narrativeMomentum, continuity: narrativeContinuity, progression: narrativeProgressionConfidence },
    48,
  );
  const narrativeTensionHistory = boundedPush(
    previous.narrativeTensionHistory,
    { timestamp: now, tension: narrativeTension, state: narrativeFlowState },
    48,
  );
  const narrativeRecoveryHistory = boundedPush(
    previous.narrativeRecoveryHistory,
    { timestamp: now, recoveryPressure: narrativeRecoveryPressure, resolutionConfidence: narrativeResolutionConfidence, state: narrativeFlowState },
    48,
  );
  const narrativeEnergyArcHistory = boundedPush(
    previous.narrativeEnergyArcHistory,
    { timestamp: now, energyArc: narrativeEnergyArc, fatigueRisk: narrativeFatigueRisk, journeyAlignment: narrativeJourneyAlignment },
    48,
  );
  narrativeFlowStore.set(params.userId, {
    narrativeMomentumHistory,
    narrativeTensionHistory,
    narrativeRecoveryHistory,
    narrativeEnergyArcHistory,
    narrativeFlowState,
    lastStateChangedAt,
  });
  const narrativeReasoning: string[] = [];
  if (narrativeMomentum >= 72) narrativeReasoning.push("Narrative momentum improved with healthy crowd adaptation and convergence.");
  if (narrativeFatigueRisk >= 66) narrativeReasoning.push("Narrative fatigue pressure increasing from sustained hype and dense cadence.");
  if (params.emotionalDrift >= 56 || params.crowdAdaptation.crowdEnergyVolatility >= 62) {
    narrativeReasoning.push("Narrative emotional pacing unstable due to drift and volatility pressure.");
  }
  if (narrativeContinuity >= 70) narrativeReasoning.push("Narrative continuity healthy under stable timing and harmonic recovery.");
  if (narrativeContinuity >= 66 && cadenceStabilitySignal >= 64) {
    narrativeReasoning.push("Narrative continuity recovered as cadence stability improved and tension growth slowed.");
  }
  if (narrativeFlowState === "recovery") narrativeReasoning.push("Narrative recovery phase necessary to avoid unresolved tension stacking.");
  if (unstableLoopRecovered) {
    narrativeReasoning.push("Stability recovered by biasing recovery/release over repeated unstable escalation.");
  }
  if (params.crowdAdaptation.crowdHypeSaturation >= 78 && narrativeTension >= 70) {
    narrativeReasoning.push("Peak saturation becoming risky; supervised release pacing recommended.");
  }
  return {
    narrativeFlowState,
    narrativeMomentum,
    narrativeTension,
    narrativeRecoveryPressure,
    narrativeProgressionConfidence,
    narrativeContinuity,
    narrativeEnergyArc,
    narrativeResolutionConfidence,
    narrativeFatigueRisk,
    narrativeJourneyAlignment,
    narrativeMomentumHistory,
    narrativeTensionHistory,
    narrativeRecoveryHistory,
    narrativeEnergyArcHistory,
    narrativeReasoning,
  };
}

function evaluateAdaptiveCadence(params: {
  userId: string;
  narrativeMomentum: number;
  crowdFatiguePressure: number;
  transitionPressure: number;
  emotionalContinuity: number;
  phraseTimingConfidence: number;
  runtimeConvergence: number;
  transitionCadenceFrequency: number;
  recentRecoveryCycles: number;
  hypeSaturation: number;
  volatility: number;
  energyArcQuality: number;
  stabilizationSuccess: number;
  narrativeRecoveryPressure: number;
  narrativeContinuity: number;
}) {
  const now = Date.now();
  const previous = adaptiveCadenceStore.get(params.userId) ?? {
    cadenceDensityHistory: [],
    cadenceAggressionHistory: [],
    cadenceRecoveryHistory: [],
    cadenceStabilityHistory: [],
    cadenceState: "balanced" as const,
    cadenceEscalationPressure: 36,
    lastStateChangedAt: now,
  };
  const cadenceDensity = Number(
    clamp(
      params.transitionCadenceFrequency * 0.52 +
        params.transitionPressure * 0.2 +
        params.hypeSaturation * 0.14 +
        (100 - params.phraseTimingConfidence) * 0.14,
      0,
      100,
    ).toFixed(2),
  );
  const cadenceAggression = Number(
    clamp(
      params.narrativeMomentum * 0.32 +
        params.transitionPressure * 0.2 +
        params.hypeSaturation * 0.18 +
        params.volatility * 0.12 +
        Math.max(0, 100 - params.emotionalContinuity) * 0.08 -
        (params.runtimeConvergence >= 70 ? 5 : 0),
      0,
      100,
    ).toFixed(2),
  );
  const escalationIncrease =
    (params.narrativeMomentum >= 72 ? 5 : 0) +
    (params.hypeSaturation >= 72 ? 6 : 0) +
    (cadenceAggression >= 66 ? 5 : 0) +
    (cadenceDensity >= 68 ? 4 : 0) +
    (params.transitionPressure >= 64 ? 4 : 0);
  const escalationDecay =
    params.narrativeRecoveryPressure <= 54 &&
    params.crowdFatiguePressure <= 58 &&
    params.stabilizationSuccess >= 68
      ? 10
      : params.runtimeConvergence >= 68 && params.volatility <= 62
        ? 6
        : 3;
  const cadenceEscalationPressure = Number(
    clamp(previous.cadenceEscalationPressure + escalationIncrease - escalationDecay, 0, 100).toFixed(2),
  );
  const cadenceRecoverySpacing = Number(
    clamp(
      (100 - cadenceDensity) * 0.34 +
        (100 - cadenceAggression) * 0.2 +
        params.narrativeRecoveryPressure * 0.18 +
        params.stabilizationSuccess * 0.16 +
        params.phraseTimingConfidence * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const cadenceBreathingRoom = Number(
    clamp(
      (100 - cadenceDensity) * 0.24 +
        (100 - cadenceEscalationPressure) * 0.2 +
        (100 - params.hypeSaturation) * 0.18 +
        params.emotionalContinuity * 0.12 +
        cadenceRecoverySpacing * 0.2 +
        params.runtimeConvergence * 0.06,
      0,
      100,
    ).toFixed(2),
  );
  const cadenceFatigueLoad = Number(
    clamp(
      params.crowdFatiguePressure * 0.34 +
        cadenceDensity * 0.18 +
        cadenceEscalationPressure * 0.2 +
        params.hypeSaturation * 0.18 +
        Math.max(0, 100 - cadenceBreathingRoom) * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const cadenceNarrativeBalance = Number(
    clamp(
      params.narrativeContinuity * 0.24 +
        params.energyArcQuality * 0.24 +
        cadenceBreathingRoom * 0.18 +
        cadenceRecoverySpacing * 0.14 +
        (100 - cadenceFatigueLoad) * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const cadenceStability = Number(
    clamp(
      (100 - params.volatility) * 0.22 +
        (100 - cadenceAggression) * 0.12 +
        (100 - cadenceDensity) * 0.12 +
        cadenceBreathingRoom * 0.2 +
        cadenceRecoverySpacing * 0.14 +
        params.runtimeConvergence * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const cadenceAdaptationConfidence = Number(
    clamp(
      cadenceNarrativeBalance * 0.25 +
        cadenceStability * 0.25 +
        cadenceBreathingRoom * 0.2 +
        cadenceRecoverySpacing * 0.14 +
        (100 - cadenceEscalationPressure) * 0.08 +
        params.runtimeConvergence * 0.08,
      0,
      100,
    ).toFixed(2),
  );
  const candidateState: TransitionEvaluationResult["cadenceState"] =
    params.volatility >= 70
      ? "unstable"
      : cadenceEscalationPressure >= 78 && cadenceBreathingRoom <= 34
        ? "saturated"
        : cadenceAggression >= 72 || cadenceDensity >= 74
          ? "aggressive"
          : cadenceEscalationPressure >= 64
            ? "escalating"
            : cadenceRecoverySpacing >= 68 && cadenceBreathingRoom >= 62
              ? "recovering"
              : cadenceDensity <= 38
                ? "restrained"
                : "balanced";
  const minHoldMs = 15_000;
  const recentlyChanged = now - previous.lastStateChangedAt < minHoldMs;
  const flipBlocked =
    recentlyChanged &&
    ((previous.cadenceState === "aggressive" && (candidateState === "recovering" || candidateState === "unstable")) ||
      (previous.cadenceState === "recovering" && (candidateState === "aggressive" || candidateState === "saturated")) ||
      (previous.cadenceState === "unstable" && (candidateState === "aggressive" || candidateState === "recovering")));
  const cadenceState = flipBlocked ? previous.cadenceState : candidateState;
  const previousBreathingRoom = previous.cadenceRecoveryHistory[previous.cadenceRecoveryHistory.length - 1]?.breathingRoom ?? cadenceBreathingRoom;
  const lastStateChangedAt = cadenceState === previous.cadenceState ? previous.lastStateChangedAt : now;
  const cadenceDensityHistory = boundedPush(
    previous.cadenceDensityHistory,
    { timestamp: now, density: cadenceDensity, state: cadenceState },
    64,
  );
  const cadenceAggressionHistory = boundedPush(
    previous.cadenceAggressionHistory,
    { timestamp: now, aggression: cadenceAggression, escalationPressure: cadenceEscalationPressure },
    64,
  );
  const cadenceRecoveryHistory = boundedPush(
    previous.cadenceRecoveryHistory,
    { timestamp: now, recoverySpacing: cadenceRecoverySpacing, breathingRoom: cadenceBreathingRoom },
    64,
  );
  const cadenceStabilityHistory = boundedPush(
    previous.cadenceStabilityHistory,
    { timestamp: now, stability: cadenceStability, adaptationConfidence: cadenceAdaptationConfidence, fatigueLoad: cadenceFatigueLoad },
    64,
  );
  adaptiveCadenceStore.set(params.userId, {
    cadenceDensityHistory,
    cadenceAggressionHistory,
    cadenceRecoveryHistory,
    cadenceStabilityHistory,
    cadenceState,
    cadenceEscalationPressure,
    lastStateChangedAt,
  });
  const cadenceReasoning: string[] = [];
  if (cadenceState === "aggressive" || cadenceState === "saturated") {
    cadenceReasoning.push("Cadence becoming aggressive due to sustained density and escalation pressure.");
  }
  if (cadenceBreathingRoom <= 38) {
    cadenceReasoning.push("Cadence breathing room collapsing from dense pacing and unresolved escalation.");
  }
  if (cadenceRecoverySpacing >= 68) {
    cadenceReasoning.push("Cadence recovery spacing healthy with stable release windows.");
  }
  if (cadenceEscalationPressure >= 70) {
    cadenceReasoning.push("Cadence escalation pressure elevated by momentum/hype persistence.");
  }
  if (cadenceBreathingRoom >= previousBreathingRoom + 4) {
    cadenceReasoning.push("Cadence breathing room preserved longer under stable transport and recovery spacing.");
  }
  if (cadenceStability >= 70 && cadenceAdaptationConfidence >= 70) {
    cadenceReasoning.push("Cadence stabilized under balanced pacing and convergence support.");
  }
  return {
    cadenceState,
    cadenceDensity,
    cadenceAggression,
    cadenceRecoverySpacing,
    cadenceEscalationPressure,
    cadenceBreathingRoom,
    cadenceStability,
    cadenceAdaptationConfidence,
    cadenceFatigueLoad,
    cadenceNarrativeBalance,
    cadenceDensityHistory,
    cadenceAggressionHistory,
    cadenceRecoveryHistory,
    cadenceStabilityHistory,
    cadenceReasoning,
  };
}

function evaluateOrchestrationSynthesis(params: {
  userId: string;
  cadence: {
    cadenceDensity: number;
    cadenceAggression: number;
    cadenceRecoverySpacing: number;
    cadenceEscalationPressure: number;
    cadenceBreathingRoom: number;
    cadenceStability: number;
    cadenceFatigueLoad: number;
    cadenceNarrativeBalance: number;
    cadenceAdaptationConfidence: number;
  };
  crowd: {
    crowdFatiguePressure: number;
    crowdEnergyVolatility: number;
    crowdAdaptationConfidence: number;
    crowdRecoveryConfidence: number;
    crowdHypeSaturation: number;
  };
  narrative: {
    narrativeMomentum: number;
    narrativeRecoveryPressure: number;
    narrativeContinuity: number;
    narrativeEnergyArc: number;
    narrativeFatigueRisk: number;
  };
  harmonic: {
    emotionalContinuity: number;
    harmonicTension: number;
    emotionalEnergyDrift: number;
  };
  phrase: {
    transitionPressure: number;
    timingConfidence: number;
    timingRisk: number;
  };
  runtime: {
    convergence: number;
    transportStability: number;
    deviceSynchronizationConfidence: number;
    heartbeatContinuity: number;
    heartbeatDrift: number;
  };
  mutation: {
    rollbackReadiness: number;
    rollbackSafetyMargin: number;
    executionWindowState: ExecutionWindowState;
  };
}) {
  const now = Date.now();
  const previous = orchestrationSynthesisStore.get(params.userId) ?? {
    orchestrationBalanceHistory: [],
    orchestrationConflictHistory: [],
    orchestrationAlignmentHistory: [],
    orchestrationStabilityHistory: [],
    orchestrationRecoveryPriority: 52,
    orchestrationEscalationPriority: 48,
    orchestrationContinuityPriority: 56,
    orchestrationFatiguePriority: 50,
    orchestrationNarrativePriority: 54,
  };
  const orchestrationConflictPressure = Number(
    clamp(
      (params.cadence.cadenceAggression >= 70 && params.crowd.crowdFatiguePressure >= 62 ? 18 : 0) +
        (params.narrative.narrativeMomentum >= 70 && params.narrative.narrativeRecoveryPressure >= 62 ? 16 : 0) +
        (params.phrase.timingConfidence < 56 && params.cadence.cadenceEscalationPressure >= 66 ? 14 : 0) +
        (params.harmonic.harmonicTension >= 64 && params.phrase.transitionPressure >= 64 ? 14 : 0) +
        (params.runtime.convergence < 58 && params.cadence.cadenceAggression >= 66 ? 12 : 0) +
        (params.runtime.transportStability < 56 && params.cadence.cadenceDensity >= 68 ? 12 : 0) +
        (params.cadence.cadenceEscalationPressure * 0.14) +
        (params.crowd.crowdEnergyVolatility * 0.16) +
        ((100 - params.runtime.convergence) * 0.14) +
        ((100 - params.harmonic.emotionalContinuity) * 0.12),
      0,
      100,
    ).toFixed(2),
  );
  const orchestrationAlignment = Number(
    clamp(
      params.phrase.timingConfidence * 0.15 +
        params.harmonic.emotionalContinuity * 0.18 +
        params.narrative.narrativeContinuity * 0.17 +
        params.cadence.cadenceNarrativeBalance * 0.16 +
        params.crowd.crowdAdaptationConfidence * 0.12 +
        params.runtime.convergence * 0.12 +
        params.runtime.transportStability * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const orchestrationBalanceScore = Number(
    clamp(
      (100 - Math.abs(params.cadence.cadenceAggression - params.cadence.cadenceRecoverySpacing)) * 0.18 +
        (100 - Math.abs(params.narrative.narrativeMomentum - params.narrative.narrativeRecoveryPressure)) * 0.16 +
        params.cadence.cadenceBreathingRoom * 0.14 +
        params.narrative.narrativeEnergyArc * 0.14 +
        params.crowd.crowdRecoveryConfidence * 0.1 +
        (100 - params.crowd.crowdFatiguePressure) * 0.12 +
        params.runtime.convergence * 0.16,
      0,
      100,
    ).toFixed(2),
  );
  const orchestrationStability = Number(
    clamp(
      params.cadence.cadenceStability * 0.22 +
        (100 - orchestrationConflictPressure) * 0.18 +
        params.runtime.heartbeatContinuity * 0.16 +
        (100 - params.runtime.heartbeatDrift) * 0.1 +
        params.runtime.transportStability * 0.14 +
        params.runtime.deviceSynchronizationConfidence * 0.1 +
        params.runtime.convergence * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const targetRecoveryPriority = clamp(
    params.cadence.cadenceRecoverySpacing * 0.24 +
      params.narrative.narrativeRecoveryPressure * 0.22 +
      params.crowd.crowdFatiguePressure * 0.14 +
      orchestrationConflictPressure * 0.2 +
      (100 - params.runtime.convergence) * 0.2,
    0,
    100,
  );
  const targetEscalationPriority = clamp(
    params.narrative.narrativeMomentum * 0.26 +
      params.cadence.cadenceEscalationPressure * 0.26 +
      params.crowd.crowdHypeSaturation * 0.16 +
      (100 - params.cadence.cadenceBreathingRoom) * 0.14 +
      (100 - params.crowd.crowdFatiguePressure) * 0.18,
    0,
    100,
  );
  const targetContinuityPriority = clamp(
    params.harmonic.emotionalContinuity * 0.3 +
      params.phrase.timingConfidence * 0.2 +
      params.narrative.narrativeContinuity * 0.2 +
      params.runtime.convergence * 0.15 +
      params.runtime.transportStability * 0.15,
    0,
    100,
  );
  const targetFatiguePriority = clamp(
    params.cadence.cadenceFatigueLoad * 0.28 +
      params.crowd.crowdFatiguePressure * 0.26 +
      params.narrative.narrativeFatigueRisk * 0.2 +
      params.crowd.crowdEnergyVolatility * 0.14 +
      params.harmonic.emotionalEnergyDrift * 0.12,
    0,
    100,
  );
  const targetNarrativePriority = clamp(
    params.narrative.narrativeMomentum * 0.2 +
      params.narrative.narrativeContinuity * 0.22 +
      params.narrative.narrativeEnergyArc * 0.2 +
      params.cadence.cadenceNarrativeBalance * 0.18 +
      params.phrase.timingConfidence * 0.2,
    0,
    100,
  );
  const smooth = 0.22;
  const orchestrationRecoveryPriority = Number(
    clamp(previous.orchestrationRecoveryPriority + (targetRecoveryPriority - previous.orchestrationRecoveryPriority) * smooth, 0, 100).toFixed(2),
  );
  const orchestrationEscalationPriority = Number(
    clamp(previous.orchestrationEscalationPriority + (targetEscalationPriority - previous.orchestrationEscalationPriority) * smooth, 0, 100).toFixed(2),
  );
  const orchestrationContinuityPriority = Number(
    clamp(previous.orchestrationContinuityPriority + (targetContinuityPriority - previous.orchestrationContinuityPriority) * smooth, 0, 100).toFixed(2),
  );
  const orchestrationFatiguePriority = Number(
    clamp(previous.orchestrationFatiguePriority + (targetFatiguePriority - previous.orchestrationFatiguePriority) * smooth, 0, 100).toFixed(2),
  );
  const orchestrationNarrativePriority = Number(
    clamp(previous.orchestrationNarrativePriority + (targetNarrativePriority - previous.orchestrationNarrativePriority) * smooth, 0, 100).toFixed(2),
  );
  const orchestrationSynthesisConfidence = Number(
    clamp(
      orchestrationAlignment * 0.24 +
        orchestrationBalanceScore * 0.22 +
        orchestrationStability * 0.2 +
        params.cadence.cadenceAdaptationConfidence * 0.12 +
        params.crowd.crowdAdaptationConfidence * 0.1 +
        params.runtime.convergence * 0.12 -
        orchestrationConflictPressure * 0.14,
      0,
      100,
    ).toFixed(2),
  );
  const orchestrationBalanceHistory = boundedPush(
    previous.orchestrationBalanceHistory,
    { timestamp: now, balance: orchestrationBalanceScore, confidence: orchestrationSynthesisConfidence },
    72,
  );
  const orchestrationConflictHistory = boundedPush(
    previous.orchestrationConflictHistory,
    {
      timestamp: now,
      conflictPressure: orchestrationConflictPressure,
      recoveryPriority: orchestrationRecoveryPriority,
      escalationPriority: orchestrationEscalationPriority,
    },
    72,
  );
  const orchestrationAlignmentHistory = boundedPush(
    previous.orchestrationAlignmentHistory,
    {
      timestamp: now,
      alignment: orchestrationAlignment,
      continuityPriority: orchestrationContinuityPriority,
      narrativePriority: orchestrationNarrativePriority,
    },
    72,
  );
  const orchestrationStabilityHistory = boundedPush(
    previous.orchestrationStabilityHistory,
    {
      timestamp: now,
      stability: orchestrationStability,
      fatiguePriority: orchestrationFatiguePriority,
      synthesisConfidence: orchestrationSynthesisConfidence,
    },
    72,
  );
  orchestrationSynthesisStore.set(params.userId, {
    orchestrationBalanceHistory,
    orchestrationConflictHistory,
    orchestrationAlignmentHistory,
    orchestrationStabilityHistory,
    orchestrationRecoveryPriority,
    orchestrationEscalationPriority,
    orchestrationContinuityPriority,
    orchestrationFatiguePriority,
    orchestrationNarrativePriority,
  });
  const orchestrationSynthesisReasoning: string[] = [];
  if (orchestrationBalanceScore >= 72) orchestrationSynthesisReasoning.push("Orchestration balanced as pacing, timing, and recovery are currently aligned.");
  if (orchestrationConflictPressure >= 64) orchestrationSynthesisReasoning.push("Orchestration conflict pressure elevated from competing escalation, fatigue, and timing demands.");
  if (orchestrationRecoveryPriority >= 62) orchestrationSynthesisReasoning.push("Recovery priority increased to relieve accumulated multi-layer pressure.");
  if (orchestrationEscalationPriority <= 44) orchestrationSynthesisReasoning.push("Escalation priority reduced to preserve continuity and avoid saturation.");
  if (orchestrationSynthesisConfidence <= 52) orchestrationSynthesisReasoning.push("Synthesis confidence unstable under unresolved cross-layer conflicts.");
  if (orchestrationAlignment >= 70) orchestrationSynthesisReasoning.push("Orchestration alignment improved as cadence, narrative, timing, and emotion converge.");
  return {
    orchestrationBalanceScore,
    orchestrationConflictPressure,
    orchestrationStability,
    orchestrationAlignment,
    orchestrationRecoveryPriority,
    orchestrationEscalationPriority,
    orchestrationContinuityPriority,
    orchestrationFatiguePriority,
    orchestrationNarrativePriority,
    orchestrationSynthesisConfidence,
    orchestrationBalanceHistory,
    orchestrationConflictHistory,
    orchestrationAlignmentHistory,
    orchestrationStabilityHistory,
    orchestrationSynthesisReasoning,
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

export function determineExecutionStrategy(params: {
  harmonicCompatibility: string;
  phraseCompatibility: string;
  syncCompatibility: string;
  vocalOverlapRisk: number;
  beatRisk: string;
  harmonicRisk: string;
  phraseRisk: string;
  currentEnergy: number;
  targetEnergy: number;
  crowdMomentum?: string;
  confidence: number;
}) {
  const energyDelta = params.targetEnergy - params.currentEnergy;
  const strongHarmonic =
    params.harmonicCompatibility === "match" || params.harmonicCompatibility === "adjacent";
  const safePhrase =
    params.phraseCompatibility === "intro_outro_aligned" ||
    params.phraseCompatibility === "instrumental_to_vocal_drop";
  const stableSync =
    params.syncCompatibility === "aligned_downbeat" || params.syncCompatibility === "matched_bar_window";
  const unsafeSignals =
    params.confidence < 56 ||
    params.syncCompatibility === "unstable_window" ||
    params.syncCompatibility === "drop_collision" ||
    params.harmonicRisk === "incompatible_harmonic_jump" ||
    params.phraseCompatibility === "drop_collision";
  const conflictingSignals =
    params.beatRisk === "risky" ||
    params.phraseRisk === "risky" ||
    params.harmonicRisk === "incompatible_harmonic_jump";
  const momentumRising = params.crowdMomentum === "rising" || params.crowdMomentum === "surging";

  let executionStrategy:
    | "smooth_blend"
    | "harmonic_overlay"
    | "vocal_guarded_transition"
    | "percussive_swap"
    | "fast_cut"
    | "energy_ramp_blend"
    | "hold_state" = "smooth_blend";
  const executionReasoning: string[] = [];

  if (unsafeSignals || params.confidence < 52) {
    executionStrategy = params.confidence < 46 ? "hold_state" : "fast_cut";
    executionReasoning.push(
      executionStrategy === "hold_state"
        ? "Confidence weak or conflicting continuity signals; hold state to preserve safety."
        : "Confidence degradation triggered recovery-oriented fast cut.",
    );
  } else if (params.vocalOverlapRisk >= 62 || params.phraseCompatibility === "vocal_overlap_risk") {
    executionStrategy = "vocal_guarded_transition";
    executionReasoning.push("Vocal overlap risk elevated; guarded transition selected.");
  } else if (energyDelta >= 1.4 && momentumRising && params.beatRisk !== "risky") {
    executionStrategy = "energy_ramp_blend";
    executionReasoning.push("Energy escalation path detected with stable continuity.");
  } else if (strongHarmonic && safePhrase && stableSync) {
    executionStrategy =
      params.harmonicCompatibility === "match" || params.harmonicCompatibility === "adjacent"
        ? "harmonic_overlay"
        : "smooth_blend";
    executionReasoning.push("Harmonic-safe melodic continuity detected.");
  } else if (stableSync && !strongHarmonic) {
    executionStrategy = "percussive_swap";
    executionReasoning.push("Beat continuity strong but harmonic continuity weak.");
  } else if (conflictingSignals) {
    executionStrategy = "hold_state";
    executionReasoning.push("Signal conflicts detected; hold state selected.");
  } else {
    executionStrategy = "smooth_blend";
    executionReasoning.push("Default smooth blend selected for continuity preservation.");
  }

  const transitionAggressiveness = Number(
    clamp(
      executionStrategy === "fast_cut"
        ? 84
        : executionStrategy === "percussive_swap"
          ? 66
          : executionStrategy === "energy_ramp_blend"
            ? 62
            : executionStrategy === "vocal_guarded_transition"
              ? 54
              : executionStrategy === "hold_state"
                ? 18
                : 48,
      0,
      100,
    ).toFixed(2),
  );
  const transitionComplexity = Number(
    clamp(
      executionStrategy === "harmonic_overlay"
        ? 74
        : executionStrategy === "vocal_guarded_transition"
          ? 78
          : executionStrategy === "energy_ramp_blend"
            ? 68
            : executionStrategy === "percussive_swap"
              ? 58
              : executionStrategy === "fast_cut"
                ? 46
                : executionStrategy === "hold_state"
                  ? 24
                  : 52,
      0,
      100,
    ).toFixed(2),
  );
  const operatorAttentionRequired =
    executionStrategy === "fast_cut" ||
    executionStrategy === "hold_state" ||
    executionStrategy === "vocal_guarded_transition" ||
    params.vocalOverlapRisk >= 62 ||
    params.syncCompatibility === "unstable_window" ||
    conflictingSignals;

  return {
    executionStrategy,
    executionReasoning,
    aggressiveness: transitionAggressiveness,
    transitionComplexity,
    operatorAttentionRequired,
  };
}

function evaluateExecutionWindow(params: {
  transitionTimingConfidence: number;
  downbeatAlignmentConfidence: number;
  signalConflicts?: string[];
  playbackDeviceReady?: boolean;
}) {
  const conflictPenalty = (params.signalConflicts?.length ?? 0) * 7;
  const baseWindowScore = clamp(
    params.transitionTimingConfidence * 0.55 +
      params.downbeatAlignmentConfidence * 0.35 +
      (params.playbackDeviceReady ? 10 : -15) -
      conflictPenalty,
    0,
    100,
  );
  const executionWindowState: ExecutionWindowState =
    !params.playbackDeviceReady
      ? "expired_window"
      : baseWindowScore >= 78
        ? "stable_window"
        : baseWindowScore >= 62
          ? "narrow_window"
          : "unstable_window";
  const estimatedCueLeadTime = Number(
    clamp(executionWindowState === "stable_window" ? 9 : executionWindowState === "narrow_window" ? 6 : 3, 2, 12).toFixed(2),
  );
  const blendEntryConfidence = Number(clamp(baseWindowScore * 0.92, 0, 100).toFixed(2));
  const rollbackSafetyMargin = Number(
    clamp(
      (executionWindowState === "stable_window" ? 78 : executionWindowState === "narrow_window" ? 58 : 32) -
        conflictPenalty * 0.45,
      0,
      100,
    ).toFixed(2),
  );
  return {
    executionWindowState,
    estimatedCueLeadTime,
    blendEntryConfidence,
    rollbackSafetyMargin,
  };
}

export function evaluateExecutionReadiness(params: {
  userId?: string;
  playbackState: PlaybackOrchestrationState | null;
  executionStrategy: ExecutionStrategy;
  confidence: number;
  riskLevel: string;
  transitionTimingConfidence: number;
  downbeatAlignmentConfidence: number;
  operatorAttentionRequired: boolean;
  signalConflicts?: string[];
  playbackDeviceReady?: boolean;
  queueFreshnessScore?: number;
}) {
  const playbackDeviceReady =
    params.playbackDeviceReady ??
    Boolean(params.playbackState?.activeDevice && !params.playbackState?.activeDevice?.is_restricted);
  const playbackProgressStable = typeof params.playbackState?.playbackState?.progressMs === "number";
  const playbackSynced = params.playbackState?.queueStatus?.syncStatus === "synced";
  const queueFreshnessScore = clamp(params.queueFreshnessScore ?? 65, 0, 100);
  if (params.userId) {
    if (params.playbackState?.playbackState?.isPlaying) refreshPlaybackHeartbeat(params.userId);
    if (params.playbackState?.activeDevice) refreshDeviceHeartbeat(params.userId);
    if (queueFreshnessScore >= 55) refreshQueueHeartbeat(params.userId);
  }
  const heartbeat = evaluateTelemetryFreshness(params.userId ?? "anonymous");
  const activePlaybackProtection =
    Boolean(params.playbackState?.playbackState?.isPlaying) &&
    Boolean(params.playbackState?.activeDevice) &&
    heartbeat.heartbeatContinuityScore >= 68 &&
    (params.playbackState?.queueStatus?.syncStatus === "synced");
  const conflictCount = params.signalConflicts?.length ?? 0;

  const deviceSynchronizationConfidence = Number(
    clamp(
      (playbackDeviceReady ? 45 : 10) + (playbackProgressStable ? 28 : 8) + (playbackSynced ? 22 : 6),
      0,
      100,
    ).toFixed(2),
  );
  const transportStability = Number(
    clamp(deviceSynchronizationConfidence * 0.62 + params.downbeatAlignmentConfidence * 0.18 + queueFreshnessScore * 0.2, 0, 100).toFixed(2),
  );
  const rawWindowIntel = evaluateExecutionWindow({
    transitionTimingConfidence: params.transitionTimingConfidence,
    downbeatAlignmentConfidence: params.downbeatAlignmentConfidence,
    signalConflicts: params.signalConflicts,
    playbackDeviceReady,
  });
  const windowIntel =
    activePlaybackProtection &&
    deviceSynchronizationConfidence > 75 &&
    rawWindowIntel.executionWindowState === "unstable_window"
      ? {
          ...rawWindowIntel,
          executionWindowState: "narrow_window" as const,
          blendEntryConfidence: Number(clamp(rawWindowIntel.blendEntryConfidence + 6, 0, 100).toFixed(2)),
        }
      : rawWindowIntel;
  const cuePreparationConfidence = Number(
    clamp(
      params.transitionTimingConfidence * 0.45 +
        windowIntel.blendEntryConfidence * 0.35 +
        queueFreshnessScore * 0.2 -
        conflictCount * 4,
      0,
      100,
    ).toFixed(2),
  );
  const rollbackReadiness = Number(
    clamp(
      windowIntel.rollbackSafetyMargin * 0.5 +
        (100 - (params.executionStrategy === "fast_cut" ? 72 : params.executionStrategy === "hold_state" ? 32 : 48)) *
          0.3 +
        (params.operatorAttentionRequired ? -8 : 6),
      0,
      100,
    ).toFixed(2),
  );
  const executionBlockers: string[] = [];
  if (!playbackDeviceReady) executionBlockers.push("no_active_device");
  if (queueFreshnessScore < 40 && !activePlaybackProtection) executionBlockers.push("stale_telemetry");
  if (windowIntel.executionWindowState === "unstable_window" || windowIntel.executionWindowState === "expired_window")
    executionBlockers.push("unstable_execution_window");
  if (conflictCount >= 3) executionBlockers.push("conflicting_runtime_signals");
  if (params.confidence < 48) executionBlockers.push("low_confidence");

  const executionReadinessScore = Number(
    clamp(
      params.confidence * 0.24 +
        transportStability * 0.22 +
        cuePreparationConfidence * 0.24 +
        rollbackReadiness * 0.14 +
        queueFreshnessScore * 0.16 -
        conflictCount * 4.5,
      0,
      100,
    ).toFixed(2),
  );
  const executionReadiness: ExecutionReadinessState =
    executionBlockers.length > 0
      ? "blocked"
      : params.operatorAttentionRequired || params.riskLevel === "high"
        ? "guarded"
        : executionReadinessScore >= 76
          ? "ready"
          : "prepare";
  const graceStabilizationActive = activePlaybackProtection && executionReadiness === "blocked";
  const stabilizedReadiness: ExecutionReadinessState =
    graceStabilizationActive &&
    !executionBlockers.includes("no_active_device") &&
    !executionBlockers.includes("unstable_execution_window")
      ? "prepare"
      : executionReadiness;

  return {
    executionReadinessScore,
    executionReadiness: stabilizedReadiness,
    executionBlockers,
    transportStability,
    cuePreparationConfidence,
    rollbackReadiness,
    deviceSynchronizationConfidence,
    executionWindowState: windowIntel.executionWindowState,
    estimatedCueLeadTime: windowIntel.estimatedCueLeadTime,
    blendEntryConfidence: windowIntel.blendEntryConfidence,
    rollbackSafetyMargin: windowIntel.rollbackSafetyMargin,
    playbackFreshnessAgeMs: heartbeat.playbackAgeMs,
    heartbeatContinuity: heartbeat.heartbeatContinuityScore,
    heartbeatDrift: heartbeat.heartbeatDrift,
    freshnessRecoveryState:
      heartbeat.playbackFreshness === "stale" || heartbeat.deviceFreshness === "stale"
        ? ("recovering" as const)
        : heartbeat.playbackFreshness === "expired" || heartbeat.deviceFreshness === "expired"
          ? ("degraded" as const)
          : ("stable" as const),
    graceStabilizationActive,
  };
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
    executionStrategy?: string;
    transitionAggressiveness?: number;
    transitionComplexity?: number;
    executionReadiness?: ExecutionReadinessState;
    executionWindowState?: ExecutionWindowState;
    transportStability?: number;
    rollbackReadiness?: number;
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
  const strategySig = toTrackSignaturePart(phrase?.executionStrategy ?? "unknown");
  const aggressivenessSig = toTrackSignaturePart(String(Math.round(phrase?.transitionAggressiveness ?? 0)));
  const complexitySig = toTrackSignaturePart(String(Math.round(phrase?.transitionComplexity ?? 0)));
  const readinessSig = toTrackSignaturePart(phrase?.executionReadiness ?? "unknown");
  const windowSig = toTrackSignaturePart(phrase?.executionWindowState ?? "unknown");
  const transportSig = toTrackSignaturePart(String(Math.round(phrase?.transportStability ?? 0)));
  const rollbackSig = toTrackSignaturePart(String(Math.round(phrase?.rollbackReadiness ?? 0)));
  return `${current}->${candidate}|keys:${currentKeySig}:${candidateKeySig}|camelot:${camelotSig}|phrase:${phraseCompatibilitySig}:${dropAlignmentSig}:${vocalOverlapSig}|sync:${syncCompatibilitySig}:${beatRiskSig}|strategy:${strategySig}:${aggressivenessSig}:${complexitySig}|readiness:${readinessSig}:${windowSig}:${transportSig}:${rollbackSig}`;
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
  executionStrategy?: string;
  transitionAggressiveness?: number;
  transitionComplexity?: number;
  executionReasoning?: string[];
  operatorAttentionRequired?: boolean;
  executionReadiness?: ExecutionReadinessState;
  executionWindowState?: ExecutionWindowState;
  transportStability?: number;
  rollbackReadiness?: number;
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
        executionStrategy: params.executionStrategy,
        transitionAggressiveness: params.transitionAggressiveness,
        transitionComplexity: params.transitionComplexity,
        executionReadiness: params.executionReadiness,
        executionWindowState: params.executionWindowState,
        transportStability: params.transportStability,
        rollbackReadiness: params.rollbackReadiness,
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
    executionStrategy: params.executionStrategy,
    transitionAggressiveness: params.transitionAggressiveness,
    transitionComplexity: params.transitionComplexity,
    executionReadiness: params.executionReadiness,
    executionWindowState: params.executionWindowState,
    transportStability: params.transportStability,
    rollbackReadiness: params.rollbackReadiness,
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
  let strategySuccessMatches = 0;
  let strategyPenaltyMatches = 0;

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
    const context = pattern.pattern_context.toLowerCase();
    if (context.includes("|strategy:harmonic_overlay")) strategySuccessMatches += 1;
    if (context.includes("|strategy:fast_cut")) strategyPenaltyMatches += 1;
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
  if (strategySuccessMatches > 0) {
    rationale.push("Execution strategy continuity reinforced by prior outcomes.");
  }
  if (strategyPenaltyMatches > 0) {
    rationale.push("Repeated fast-cut history increases caution for strategy stability.");
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
  const strategyDecision = determineExecutionStrategy({
    harmonicCompatibility: harmonic.camelotCompatibility,
    phraseCompatibility: phrase.phraseCompatibility,
    syncCompatibility: beatSync.syncCompatibility,
    vocalOverlapRisk: phrase.vocalOverlapRisk,
    beatRisk: beatSync.beatRisk,
    harmonicRisk: harmonic.harmonicRisk,
    phraseRisk: phrase.phraseRisk,
    currentEnergy: params.currentTrack.energy,
    targetEnergy: params.candidateTrack.energy,
    crowdMomentum:
      (params.candidateTrack.crowdMomentumProjection ?? 50) >= 78
        ? "surging"
        : (params.candidateTrack.crowdMomentumProjection ?? 50) >= 62
          ? "rising"
          : (params.candidateTrack.crowdMomentumProjection ?? 50) <= 38
            ? "low"
            : "steady",
    confidence:
      bpmScore * 0.15 +
      enrichedEnergyScore * 0.15 +
      moodScore * 0.1 +
      harmonic.harmonicCompatibilityScore * 0.2 +
      phrase.phraseAlignmentScore * 0.2 +
      beatSync.beatSyncScore * 0.2,
  });
  const strategyDecisionReasoning = strategyDecision.executionReasoning;
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
    executionStrategy: strategyDecision.executionStrategy,
    transitionAggressiveness: strategyDecision.aggressiveness,
    transitionComplexity: strategyDecision.transitionComplexity,
    executionReadiness: "prepare",
    executionWindowState: beatSync.syncCompatibility === "unstable_window" ? "unstable_window" : "narrow_window",
    transportStability: Number(clamp((beatSync.transitionTimingConfidence + beatSync.downbeatAlignmentConfidence) / 2, 0, 100).toFixed(2)),
    rollbackReadiness: Number(clamp(100 - strategyDecision.aggressiveness * 0.6, 0, 100).toFixed(2)),
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
    transitionExecutionStyle: strategyDecision.executionStrategy,
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
  const currentTrackProfile: TrackPhraseProfile = {
    phraseLength: 16,
    currentPhrase: Math.max(0, Math.round((playback.playbackState?.progressMs ?? 0) / 2000)),
    phraseSection: derivePhraseSection({
      phase: session?.current_phase ?? null,
      speechiness: topTransitionCandidate?.speechiness ?? 0.2,
      instrumentalness: topTransitionCandidate?.instrumentalness ?? 0.35,
      energy: session?.current_energy ?? 5,
      valence: (topTransitionCandidate?.candidateTrack as RuntimeCandidateTrack | undefined)?.valence ?? 0.5,
      breakdownPresence: false,
    }),
    energyLevel: clamp((session?.current_energy ?? 5) * 10, 0, 100),
    vocalDensity: deriveVocalDensity(topTransitionCandidate?.speechiness ?? 0.2),
    instrumentalIntensity: clamp((topTransitionCandidate?.instrumentalness ?? 0.35) * 100, 0, 100),
    harmonicKey: currentTrackKey ?? "unknown",
    bpm: session?.current_bpm ?? 110,
    danceability: clamp((topTransitionCandidate?.danceability ?? 0.62) * 100, 0, 100),
    tensionLevel: clamp(
      (100 - (harmonicCompatibilityScore ?? 65)) * 0.35 +
        (100 - (energyFlowScore ?? 60)) * 0.2 +
        (session?.current_energy ?? 5) * 6 +
        (topTransitionCandidate?.speechiness ?? 0.2) * 20,
      0,
      100,
    ),
  };
  const nextTrackProfile: TrackPhraseProfile = {
    phraseLength: topTransitionCandidate?.candidateTrack.phraseLength ?? 16,
    currentPhrase: Math.max(0, Math.round(topTransitionCandidate?.estimatedMixInTiming ?? 8)),
    phraseSection: derivePhraseSection({
      phase: session?.current_phase ?? null,
      speechiness: topTransitionCandidate?.speechiness ?? 0.2,
      instrumentalness: topTransitionCandidate?.instrumentalness ?? 0.35,
      energy: topTransitionCandidate?.candidateTrack.energy ?? session?.current_energy ?? 5,
      valence: (topTransitionCandidate?.candidateTrack as RuntimeCandidateTrack | undefined)?.valence ?? 0.5,
      dropIntensity: (topTransitionCandidate?.candidateTrack as RuntimeCandidateTrack | undefined)?.dropIntensity ?? 5,
      breakdownPresence: (topTransitionCandidate?.candidateTrack as RuntimeCandidateTrack | undefined)?.breakdownPresence ?? false,
    }),
    energyLevel: clamp((topTransitionCandidate?.candidateTrack.energy ?? session?.current_energy ?? 5) * 10, 0, 100),
    vocalDensity: deriveVocalDensity(topTransitionCandidate?.speechiness ?? 0.2),
    instrumentalIntensity: clamp((topTransitionCandidate?.instrumentalness ?? 0.35) * 100, 0, 100),
    harmonicKey: topTransitionCandidate?.candidateKey ?? "unknown",
    bpm: topTransitionCandidate?.candidateTrack.bpm ?? session?.current_bpm ?? 110,
    danceability: clamp(((topTransitionCandidate?.danceability ?? 0.62) as number) * 100, 0, 100),
    tensionLevel: clamp(
      (100 - harmonicCompatibilityScore) * 0.35 +
        (100 - energyFlowScore) * 0.2 +
        (topTransitionCandidate?.candidateTrack.energy ?? session?.current_energy ?? 5) * 6 +
        (topTransitionCandidate?.speechiness ?? 0.2) * 20,
      0,
      100,
    ),
  };
  const transitionCompatibility: TransitionCompatibilityResult = analyzeTransitionCompatibility(
    currentTrackProfile,
    nextTrackProfile,
  );
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
  reasons.push(
    `DJ compatibility ${transitionCompatibility.compatibilityScore.toFixed(1)} (${transitionCompatibility.riskLevel}) with ${transitionCompatibility.recommendedArchetype.replace(/_/g, " ")} archetype.`,
  );
  reasons.push(...transitionCompatibility.reasoning.slice(0, 4));

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
  score += (transitionCompatibility.compatibilityScore - 70) * 0.36;
  score += (transitionCompatibility.phraseAlignmentScore - 70) * 0.16;
  score += (transitionCompatibility.harmonicScore - 70) * 0.14;
  score += (transitionCompatibility.vocalClashScore - 70) * 0.14;
  score += (transitionCompatibility.tensionContinuityScore - 70) * 0.12;
  if (transitionCompatibility.riskLevel === "dangerous") score -= 24;
  else if (transitionCompatibility.riskLevel === "risky") score -= 11;
  else if (transitionCompatibility.riskLevel === "safe") score += 6;
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
  const djRiskDelta =
    transitionCompatibility.riskLevel === "dangerous"
      ? 1.6
      : transitionCompatibility.riskLevel === "risky"
        ? 0.9
        : transitionCompatibility.riskLevel === "moderate"
          ? 0.25
          : -0.5;
  const riskLevel = applyRiskDelta(
    baselineRiskLevel,
    (topTransitionCandidate?.memoryBias.riskDelta ?? 0) + djRiskDelta,
  );

  const shouldTransition =
    params.assistedAutonomousEnabled &&
    !cooldownBlocked &&
    !duplicateTransition &&
    !unsafeEnergySpike &&
    Boolean(topRecommendation) &&
    (topTransitionCandidate?.transitionExecutionStyle ?? "smooth_blend") !== "hold_state";
  const holdEnergy = !shouldTransition || (session ? session.current_energy >= 8.6 : false);
  const rampEnergy = shouldTransition && Boolean(session && session.current_energy <= 6.8);
  const cooldownEnergy = shouldTransition && Boolean(session && session.current_energy >= 8.8);
  const strategyAssessment = determineExecutionStrategy({
    harmonicCompatibility: topTransitionCandidate?.camelotCompatibility ?? "unknown",
    phraseCompatibility: topTransitionCandidate?.phraseCompatibility ?? "neutral",
    syncCompatibility: topTransitionCandidate?.syncCompatibility ?? "matched_bar_window",
    vocalOverlapRisk: topTransitionCandidate?.vocalOverlapRisk ?? 40,
    beatRisk: topTransitionCandidate?.beatRisk ?? "watch",
    harmonicRisk: topTransitionCandidate?.harmonicRisk ?? "neutral_missing_key_metadata",
    phraseRisk: (topTransitionCandidate?.phraseRisk as "safe" | "watch" | "risky" | undefined) ?? "watch",
    currentEnergy: session?.current_energy ?? 5,
    targetEnergy: topRecommendation?.energy ?? session?.current_energy ?? 5,
    crowdMomentum: crowdMomentumBucketFromProjection(topTransitionCandidate?.crowdMomentumProjection ?? 50),
    confidence,
  });
  const queueFreshnessScore =
    telemetry?.freshness === "fresh"
      ? 92
      : telemetry?.freshness === "stale"
        ? 66
        : telemetry?.freshness === "expired"
          ? 34
          : 52;
  const readinessAssessment = evaluateExecutionReadiness({
    userId: params.userId,
    playbackState: playback,
    executionStrategy: strategyAssessment.executionStrategy,
    confidence,
    riskLevel,
    transitionTimingConfidence: topTransitionCandidate?.transitionTimingConfidence ?? 64,
    downbeatAlignmentConfidence: topTransitionCandidate?.downbeatAlignmentConfidence ?? 64,
    operatorAttentionRequired: strategyAssessment.operatorAttentionRequired,
    signalConflicts: reasons.filter((reason) =>
      reason.toLowerCase().includes("conflict") ||
      reason.toLowerCase().includes("unstable") ||
      reason.toLowerCase().includes("risky"),
    ),
    playbackDeviceReady: Boolean(playback.activeDevice && !playback.activeDevice.is_restricted),
    queueFreshnessScore,
  });
  const runtimeConvergenceScore = clamp(
    readinessAssessment.heartbeatContinuity * 0.35 +
      readinessAssessment.transportStability * 0.35 +
      (100 - readinessAssessment.heartbeatDrift) * 0.15 +
      readinessAssessment.executionReadinessScore * 0.15,
    0,
    100,
  );
  const phraseTelemetry = evaluatePhraseTiming({
    userId: params.userId,
    playbackProgressMs: playback.playbackState?.progressMs ?? 0,
    bpm: session?.current_bpm ?? topRecommendation?.bpm ?? 120,
    energy: session?.current_energy ?? topRecommendation?.energy ?? 5,
    transitionAggressiveness: strategyAssessment.aggressiveness,
    executionWindowState: readinessAssessment.executionWindowState,
    playbackFreshnessAgeMs: readinessAssessment.playbackFreshnessAgeMs,
    runtimeConvergenceScore: Number(runtimeConvergenceScore.toFixed(2)),
    crowdMomentumProjection: topTransitionCandidate?.crowdMomentumProjection ?? 50,
    phraseLengthHint: topTransitionCandidate?.candidateTrack.phraseLength ?? null,
    phraseRisk: (topTransitionCandidate?.phraseRisk as "safe" | "watch" | "risky" | undefined) ?? "watch",
    vocalOverlapRisk: topTransitionCandidate?.vocalOverlapRisk ?? 42,
    heartbeatDrift: readinessAssessment.heartbeatDrift,
  });
  const harmonicEmotion = evaluateHarmonicEmotion({
    userId: params.userId,
    camelotCompatibility,
    bpmContinuityScore: bpmCompatibilityScore,
    phraseTimingConfidence: phraseTelemetry.transitionTimingConfidence,
    transitionAggressiveness: strategyAssessment.aggressiveness,
    vocalOverlapRisk: topTransitionCandidate?.vocalOverlapRisk ?? 42,
    energyTrajectory: (topRecommendation?.energy ?? session?.current_energy ?? 5) - (session?.current_energy ?? 5),
    crowdMomentum: topTransitionCandidate?.crowdMomentumProjection ?? 50,
    transitionPressure: phraseTelemetry.transitionPressure,
    phraseStability: phraseTelemetry.phraseStability,
    runtimeConvergenceScore: Number(runtimeConvergenceScore.toFixed(2)),
  });
  const crowdAdaptation = evaluateCrowdAdaptation({
    userId: params.userId,
    emotionalContinuity: harmonicEmotion.emotionalContinuity,
    transitionPressure: phraseTelemetry.transitionPressure,
    phraseTimingConfidence: phraseTelemetry.transitionTimingConfidence,
    harmonicTension: harmonicEmotion.harmonicTension,
    recentTransitionCadence: clamp((100 - readinessAssessment.estimatedCueLeadTime * 6.5), 0, 100),
    runtimeConvergence: Number(runtimeConvergenceScore.toFixed(2)),
    crowdEmotionalAlignment: harmonicEmotion.crowdEmotionalAlignment,
    energyTrajectory: (topRecommendation?.energy ?? session?.current_energy ?? 5) - (session?.current_energy ?? 5),
    bpmMovement: Math.abs((topRecommendation?.bpm ?? session?.current_bpm ?? 110) - (session?.current_bpm ?? 110)),
    recentStabilizationSuccess: clamp((100 - readinessAssessment.executionBlockers.length * 15), 0, 100),
    heartbeatDrift: readinessAssessment.heartbeatDrift,
  });
  const narrativeFlow = evaluateNarrativeFlow({
    userId: params.userId,
    crowdAdaptation: {
      crowdMomentumScore: crowdAdaptation.crowdMomentumScore,
      crowdFatiguePressure: crowdAdaptation.crowdFatiguePressure,
      crowdRecoveryConfidence: crowdAdaptation.crowdRecoveryConfidence,
      crowdEnergyVolatility: crowdAdaptation.crowdEnergyVolatility,
      crowdHypeSaturation: crowdAdaptation.crowdHypeSaturation,
      crowdAdaptationConfidence: crowdAdaptation.crowdAdaptationConfidence,
    },
    emotionalContinuity: harmonicEmotion.emotionalContinuity,
    harmonicTension: harmonicEmotion.harmonicTension,
    phraseTimingConfidence: phraseTelemetry.transitionTimingConfidence,
    runtimeConvergence: Number(runtimeConvergenceScore.toFixed(2)),
    recentTransitionCadence: clamp((100 - readinessAssessment.estimatedCueLeadTime * 6.5), 0, 100),
    bpmMovementTrajectory: Math.abs((topRecommendation?.bpm ?? session?.current_bpm ?? 110) - (session?.current_bpm ?? 110)),
    recentRecoveryCycles: clamp((100 - readinessAssessment.rollbackReadiness) / 20, 0, 6),
    transitionPressure: phraseTelemetry.transitionPressure,
    emotionalDrift: harmonicEmotion.emotionalEnergyDrift,
    recentStabilizationSuccess: clamp((100 - readinessAssessment.executionBlockers.length * 15), 0, 100),
  });
  const adaptiveCadence = evaluateAdaptiveCadence({
    userId: params.userId,
    narrativeMomentum: narrativeFlow.narrativeMomentum,
    crowdFatiguePressure: crowdAdaptation.crowdFatiguePressure,
    transitionPressure: phraseTelemetry.transitionPressure,
    emotionalContinuity: harmonicEmotion.emotionalContinuity,
    phraseTimingConfidence: phraseTelemetry.transitionTimingConfidence,
    runtimeConvergence: Number(runtimeConvergenceScore.toFixed(2)),
    transitionCadenceFrequency: clamp((100 - readinessAssessment.estimatedCueLeadTime * 6.5), 0, 100),
    recentRecoveryCycles: clamp((100 - readinessAssessment.rollbackReadiness) / 20, 0, 6),
    hypeSaturation: crowdAdaptation.crowdHypeSaturation,
    volatility: crowdAdaptation.crowdEnergyVolatility,
    energyArcQuality: narrativeFlow.narrativeEnergyArc,
    stabilizationSuccess: clamp((100 - readinessAssessment.executionBlockers.length * 15), 0, 100),
    narrativeRecoveryPressure: narrativeFlow.narrativeRecoveryPressure,
    narrativeContinuity: narrativeFlow.narrativeContinuity,
  });
  const orchestrationSynthesis = evaluateOrchestrationSynthesis({
    userId: params.userId,
    cadence: {
      cadenceDensity: adaptiveCadence.cadenceDensity,
      cadenceAggression: adaptiveCadence.cadenceAggression,
      cadenceRecoverySpacing: adaptiveCadence.cadenceRecoverySpacing,
      cadenceEscalationPressure: adaptiveCadence.cadenceEscalationPressure,
      cadenceBreathingRoom: adaptiveCadence.cadenceBreathingRoom,
      cadenceStability: adaptiveCadence.cadenceStability,
      cadenceFatigueLoad: adaptiveCadence.cadenceFatigueLoad,
      cadenceNarrativeBalance: adaptiveCadence.cadenceNarrativeBalance,
      cadenceAdaptationConfidence: adaptiveCadence.cadenceAdaptationConfidence,
    },
    crowd: {
      crowdFatiguePressure: crowdAdaptation.crowdFatiguePressure,
      crowdEnergyVolatility: crowdAdaptation.crowdEnergyVolatility,
      crowdAdaptationConfidence: crowdAdaptation.crowdAdaptationConfidence,
      crowdRecoveryConfidence: crowdAdaptation.crowdRecoveryConfidence,
      crowdHypeSaturation: crowdAdaptation.crowdHypeSaturation,
    },
    narrative: {
      narrativeMomentum: narrativeFlow.narrativeMomentum,
      narrativeRecoveryPressure: narrativeFlow.narrativeRecoveryPressure,
      narrativeContinuity: narrativeFlow.narrativeContinuity,
      narrativeEnergyArc: narrativeFlow.narrativeEnergyArc,
      narrativeFatigueRisk: narrativeFlow.narrativeFatigueRisk,
    },
    harmonic: {
      emotionalContinuity: harmonicEmotion.emotionalContinuity,
      harmonicTension: harmonicEmotion.harmonicTension,
      emotionalEnergyDrift: harmonicEmotion.emotionalEnergyDrift,
    },
    phrase: {
      transitionPressure: phraseTelemetry.transitionPressure,
      timingConfidence: phraseTelemetry.transitionTimingConfidence,
      timingRisk: phraseTelemetry.phraseTimingRisk,
    },
    runtime: {
      convergence: Number(runtimeConvergenceScore.toFixed(2)),
      transportStability: readinessAssessment.transportStability,
      deviceSynchronizationConfidence: readinessAssessment.deviceSynchronizationConfidence,
      heartbeatContinuity: readinessAssessment.heartbeatContinuity,
      heartbeatDrift: readinessAssessment.heartbeatDrift,
    },
    mutation: {
      rollbackReadiness: readinessAssessment.rollbackReadiness,
      rollbackSafetyMargin: readinessAssessment.rollbackSafetyMargin,
      executionWindowState: readinessAssessment.executionWindowState,
    },
  });
  const learningProfile = createDefaultTransitionLearningProfile();
  const learningObservation = applyTransitionLearningObservation({
    profile: learningProfile,
    observation: {
      transitionSucceeded:
        readinessAssessment.executionReadiness !== "blocked" &&
        transitionCompatibility.riskLevel !== "dangerous" &&
        readinessAssessment.rollbackSafetyMargin >= 40,
      harmonicStability: harmonicEmotion.harmonicCompatibility,
      phraseAlignment: phraseTelemetry.phraseAlignmentConfidence,
      crowdRecovery: crowdAdaptation.crowdRecoveryConfidence,
      operatorInterventions: clamp(Math.round(feedbackSummary.operatorInterventionRate / 20), 0, 5),
      executionStability: orchestrationSynthesis.orchestrationStability,
      emotionalContinuity: harmonicEmotion.emotionalContinuity,
      transportIntegrity: Number(
        clamp(
          readinessAssessment.transportStability * 0.55 +
            readinessAssessment.deviceSynchronizationConfidence * 0.25 +
            readinessAssessment.rollbackReadiness * 0.2,
          0,
          100,
        ).toFixed(2),
      ),
      rollbackTriggered: readinessAssessment.rollbackReadiness < 45 || readinessAssessment.rollbackSafetyMargin < 35,
    },
  });
  const transitionLearningBias = computeTransitionLearningBias(learningObservation.nextProfile);
  const recoveryLearningBias = computeRecoveryLearningBias(learningObservation.nextProfile);
  const crowdLearningBias = computeCrowdAdaptationBias(learningObservation.nextProfile);
  const executionLearningBias = computeExecutionStabilityBias(learningObservation.nextProfile);
  const boundedLearningConfidenceDelta = Number(
    clamp(
      transitionLearningBias.confidenceBias * 0.18 +
        recoveryLearningBias.recoveryBias * 0.06 +
        crowdLearningBias.crowdBias * 0.06 +
        executionLearningBias.stabilityBias * 0.08,
      -4,
      4,
    ).toFixed(2),
  );
  const boundedLearningRiskDelta = Number(
    clamp(
      transitionLearningBias.riskBias * 0.08 +
        (executionLearningBias.escalationClamp <= 0.32 ? 0.35 : -0.1),
      -0.8,
      0.8,
    ).toFixed(2),
  );
  const learningReadinessDelta = Number(
    clamp(
      (recoveryLearningBias.stabilizationPriority - 55) * 0.09 +
        (crowdLearningBias.crowdBias >= 0 ? 0.6 : -0.6),
      -3,
      3,
    ).toFixed(2),
  );
  const confidenceWithLearning = Number(clamp(confidence + boundedLearningConfidenceDelta, 0, 100).toFixed(2));
  const riskLevelWithLearning = applyRiskDelta(riskLevel, boundedLearningRiskDelta);
  const executionReadinessScoreWithLearning = Number(
    clamp(readinessAssessment.executionReadinessScore + learningReadinessDelta, 0, 100).toFixed(2),
  );
  reasons.push(
    boundedLearningConfidenceDelta >= 0
      ? "Stable supervised learning signals mildly reinforced transition confidence."
      : "Learning memory reduced confidence due to instability/intervention pressure.",
  );
  if (boundedLearningRiskDelta > 0.25) {
    reasons.push("Learning advisory raised risk posture to preserve supervised safety.");
  } else if (boundedLearningRiskDelta < -0.25) {
    reasons.push("Learning advisory relaxed risk posture under stable recovery conditions.");
  }
  reasons.push(...learningObservation.reasons.slice(0, 4));
  const executionStrategy = topTransitionCandidate?.transitionExecutionStyle ?? "hold_state";
  const strategyReasoning = strategyAssessment.executionReasoning;
  const transitionAggressiveness =
    (topTransitionCandidate as { aggressiveness?: number } | null)?.aggressiveness ??
    strategyAssessment.aggressiveness ??
    18;
  const transitionComplexity =
    (topTransitionCandidate as { transitionComplexity?: number } | null)?.transitionComplexity ?? 24;
  const operatorAttentionRequired =
    strategyAssessment.operatorAttentionRequired ??
    (topTransitionCandidate as { operatorAttentionRequired?: boolean } | null)?.operatorAttentionRequired ??
    (executionStrategy === "fast_cut" || executionStrategy === "hold_state");
  const nextAction: TransitionExecutionPlan["nextAction"] = readinessAssessment.executionReadiness === "blocked"
    ? "hold_state"
    : !params.assistedAutonomousEnabled
    ? "hold_state"
    : executionStrategy === "hold_state"
      ? "hold_state"
      : executionStrategy === "fast_cut"
        ? "prepare_fast_swap"
        : executionStrategy === "vocal_guarded_transition"
          ? "guarded_transition"
          : shouldTransition
            ? "queue_next_track"
            : unsafeEnergySpike
              ? "reject_unsafe_transition"
              : "hold_state";
  const blendDuration: TransitionExecutionPlan["blendDuration"] =
    executionStrategy === "hold_state"
      ? "none"
      : executionStrategy === "fast_cut" || executionStrategy === "percussive_swap"
        ? "short"
        : executionStrategy === "vocal_guarded_transition"
          ? "controlled"
          : "long";
  const transitionStyle: TransitionExecutionPlan["transitionStyle"] =
    executionStrategy === "fast_cut"
      ? "recovery"
      : executionStrategy === "vocal_guarded_transition"
        ? "vocal_safe"
        : executionStrategy === "percussive_swap"
          ? "aggressive"
          : "continuous";

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
    blendDuration,
    transitionStyle,
  };

  const decision: TransitionDecision = {
    shouldTransition,
    holdEnergy,
    rampEnergy,
    cooldownEnergy,
    reason: reasons[0] ?? "Transition lane is healthy.",
  };

  const result: TransitionEvaluationResult = {
    autonomousReadiness:
      !shouldTransition || transitionCompatibility.riskLevel === "dangerous"
        ? params.assistedAutonomousEnabled
          ? "needs_review"
          : "blocked"
        : transitionCompatibility.riskLevel === "risky"
          ? "needs_review"
          : "ready",
    decision,
    confidence: { score: confidenceWithLearning, reasons: reasons.length ? reasons : ["Healthy transition profile."] },
    riskLevel: riskLevelWithLearning,
    executionPlan,
    telemetry,
    executionStrategy,
    executionStrategyReasoning: strategyReasoning,
    transitionAggressiveness,
    transitionComplexity,
    operatorAttentionRequired,
    executionReadiness: readinessAssessment.executionReadiness,
    executionReadinessScore: executionReadinessScoreWithLearning,
    executionBlockers: readinessAssessment.executionBlockers,
    transportStability: readinessAssessment.transportStability,
    cuePreparationConfidence: readinessAssessment.cuePreparationConfidence,
    rollbackReadiness: readinessAssessment.rollbackReadiness,
    deviceSynchronizationConfidence: readinessAssessment.deviceSynchronizationConfidence,
    executionWindowState: readinessAssessment.executionWindowState,
    estimatedCueLeadTime: readinessAssessment.estimatedCueLeadTime,
    blendEntryConfidence: readinessAssessment.blendEntryConfidence,
    rollbackSafetyMargin: readinessAssessment.rollbackSafetyMargin,
    playbackFreshnessAgeMs: readinessAssessment.playbackFreshnessAgeMs,
    heartbeatContinuity: readinessAssessment.heartbeatContinuity,
    heartbeatDrift: readinessAssessment.heartbeatDrift,
    freshnessRecoveryState: readinessAssessment.freshnessRecoveryState,
    graceStabilizationActive: readinessAssessment.graceStabilizationActive,
    currentPhrasePosition: phraseTelemetry.currentPhrasePosition,
    currentPhraseLength: phraseTelemetry.currentPhraseLength,
    phraseAlignmentConfidence: phraseTelemetry.phraseAlignmentConfidence,
    phraseTransitionWindow: phraseTelemetry.phraseTransitionWindow,
    phraseMomentum: phraseTelemetry.phraseMomentum,
    phraseStability: phraseTelemetry.phraseStability,
    phraseTimingRisk: phraseTelemetry.phraseTimingRisk,
    transitionPressure: phraseTelemetry.transitionPressure,
    transitionTimingConfidence: phraseTelemetry.transitionTimingConfidence,
    phraseHistory: phraseTelemetry.phraseHistory,
    transitionPressureHistory: phraseTelemetry.transitionPressureHistory,
    phraseTimingReasoning: phraseTelemetry.phraseTimingReasoning,
    harmonicCompatibility: harmonicEmotion.harmonicCompatibility,
    emotionalContinuity: harmonicEmotion.emotionalContinuity,
    tonalStability: harmonicEmotion.tonalStability,
    emotionalMomentum: harmonicEmotion.emotionalMomentum,
    harmonicTension: harmonicEmotion.harmonicTension,
    emotionalTransitionRisk: harmonicEmotion.emotionalTransitionRisk,
    crowdEmotionalAlignment: harmonicEmotion.crowdEmotionalAlignment,
    emotionalEnergyDrift: harmonicEmotion.emotionalEnergyDrift,
    harmonicResolutionConfidence: harmonicEmotion.harmonicResolutionConfidence,
    harmonicHistory: harmonicEmotion.harmonicHistory,
    emotionalMomentumHistory: harmonicEmotion.emotionalMomentumHistory,
    harmonicTensionHistory: harmonicEmotion.harmonicTensionHistory,
    harmonicEmotionReasoning: harmonicEmotion.harmonicEmotionReasoning,
    crowdEnergyState: crowdAdaptation.crowdEnergyState,
    crowdMomentumScore: crowdAdaptation.crowdMomentumScore,
    crowdFatiguePressure: crowdAdaptation.crowdFatiguePressure,
    crowdRecoveryState: crowdAdaptation.crowdRecoveryState,
    crowdEngagementConfidence: crowdAdaptation.crowdEngagementConfidence,
    crowdEnergyVolatility: crowdAdaptation.crowdEnergyVolatility,
    crowdHypeSaturation: crowdAdaptation.crowdHypeSaturation,
    crowdRecoveryConfidence: crowdAdaptation.crowdRecoveryConfidence,
    crowdAdaptationConfidence: crowdAdaptation.crowdAdaptationConfidence,
    crowdMomentumHistory: crowdAdaptation.crowdMomentumHistory,
    crowdFatigueHistory: crowdAdaptation.crowdFatigueHistory,
    crowdRecoveryHistory: crowdAdaptation.crowdRecoveryHistory,
    crowdVolatilityHistory: crowdAdaptation.crowdVolatilityHistory,
    crowdAdaptationReasoning: crowdAdaptation.crowdAdaptationReasoning,
    narrativeFlowState: narrativeFlow.narrativeFlowState,
    narrativeMomentum: narrativeFlow.narrativeMomentum,
    narrativeTension: narrativeFlow.narrativeTension,
    narrativeRecoveryPressure: narrativeFlow.narrativeRecoveryPressure,
    narrativeProgressionConfidence: narrativeFlow.narrativeProgressionConfidence,
    narrativeContinuity: narrativeFlow.narrativeContinuity,
    narrativeEnergyArc: narrativeFlow.narrativeEnergyArc,
    narrativeResolutionConfidence: narrativeFlow.narrativeResolutionConfidence,
    narrativeFatigueRisk: narrativeFlow.narrativeFatigueRisk,
    narrativeJourneyAlignment: narrativeFlow.narrativeJourneyAlignment,
    narrativeMomentumHistory: narrativeFlow.narrativeMomentumHistory,
    narrativeTensionHistory: narrativeFlow.narrativeTensionHistory,
    narrativeRecoveryHistory: narrativeFlow.narrativeRecoveryHistory,
    narrativeEnergyArcHistory: narrativeFlow.narrativeEnergyArcHistory,
    narrativeReasoning: narrativeFlow.narrativeReasoning,
    cadenceState: adaptiveCadence.cadenceState,
    cadenceDensity: adaptiveCadence.cadenceDensity,
    cadenceAggression: adaptiveCadence.cadenceAggression,
    cadenceRecoverySpacing: adaptiveCadence.cadenceRecoverySpacing,
    cadenceEscalationPressure: adaptiveCadence.cadenceEscalationPressure,
    cadenceBreathingRoom: adaptiveCadence.cadenceBreathingRoom,
    cadenceStability: adaptiveCadence.cadenceStability,
    cadenceAdaptationConfidence: adaptiveCadence.cadenceAdaptationConfidence,
    cadenceFatigueLoad: adaptiveCadence.cadenceFatigueLoad,
    cadenceNarrativeBalance: adaptiveCadence.cadenceNarrativeBalance,
    cadenceDensityHistory: adaptiveCadence.cadenceDensityHistory,
    cadenceAggressionHistory: adaptiveCadence.cadenceAggressionHistory,
    cadenceRecoveryHistory: adaptiveCadence.cadenceRecoveryHistory,
    cadenceStabilityHistory: adaptiveCadence.cadenceStabilityHistory,
    cadenceReasoning: adaptiveCadence.cadenceReasoning,
    orchestrationBalanceScore: orchestrationSynthesis.orchestrationBalanceScore,
    orchestrationConflictPressure: orchestrationSynthesis.orchestrationConflictPressure,
    orchestrationStability: orchestrationSynthesis.orchestrationStability,
    orchestrationAlignment: orchestrationSynthesis.orchestrationAlignment,
    orchestrationRecoveryPriority: orchestrationSynthesis.orchestrationRecoveryPriority,
    orchestrationEscalationPriority: orchestrationSynthesis.orchestrationEscalationPriority,
    orchestrationContinuityPriority: orchestrationSynthesis.orchestrationContinuityPriority,
    orchestrationFatiguePriority: orchestrationSynthesis.orchestrationFatiguePriority,
    orchestrationNarrativePriority: orchestrationSynthesis.orchestrationNarrativePriority,
    orchestrationSynthesisConfidence: orchestrationSynthesis.orchestrationSynthesisConfidence,
    orchestrationBalanceHistory: orchestrationSynthesis.orchestrationBalanceHistory,
    orchestrationConflictHistory: orchestrationSynthesis.orchestrationConflictHistory,
    orchestrationAlignmentHistory: orchestrationSynthesis.orchestrationAlignmentHistory,
    orchestrationStabilityHistory: orchestrationSynthesis.orchestrationStabilityHistory,
    orchestrationSynthesisReasoning: orchestrationSynthesis.orchestrationSynthesisReasoning,
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
          | "energy_ramp_blend"
          | "hold_state"
          | undefined) ?? "percussive_swap",

      transitionSignature: topTransitionCandidate?.memoryBias.signature ?? null,

      memoryConfidenceBias: topTransitionCandidate?.memoryBias.confidenceBias ?? 0,

      memoryRiskDelta: topTransitionCandidate?.memoryBias.riskDelta ?? 0,

      learningConfidenceBias: boundedLearningConfidenceDelta,

      learningRiskBias: boundedLearningRiskDelta,

      stabilizationPriority: recoveryLearningBias.stabilizationPriority,

      escalationClamp: executionLearningBias.escalationClamp,

      learningReasons: learningObservation.reasons,

      compatibilityScore: transitionCompatibility.compatibilityScore,

      compatibilityHarmonicScore: transitionCompatibility.harmonicScore,

      compatibilityPhraseAlignmentScore: transitionCompatibility.phraseAlignmentScore,

      compatibilityVocalClashScore: transitionCompatibility.vocalClashScore,

      compatibilityEnergyFlowScore: transitionCompatibility.energyFlowScore,

      compatibilityTensionContinuityScore: transitionCompatibility.tensionContinuityScore,

      recommendedArchetype: transitionCompatibility.recommendedArchetype,

      compatibilityRiskLevel: transitionCompatibility.riskLevel,

      compatibilityReasoning: transitionCompatibility.reasoning,

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
        `DJ compatibility score ${transitionCompatibility.compatibilityScore.toFixed(2)} (${transitionCompatibility.riskLevel}).`,
        transitionCompatibility.riskLevel === "dangerous"
          ? "DJ risk model flags this transition as dangerous; autonomy confidence heavily reduced."
          : transitionCompatibility.riskLevel === "risky"
            ? "DJ risk model flags elevated risk; supervised transition recommended."
            : "DJ risk model indicates acceptable transition safety.",
        `Recommended DJ archetype: ${transitionCompatibility.recommendedArchetype.replace(/_/g, " ")}.`,
        ...transitionCompatibility.reasoning.slice(0, 4),
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
        readinessAssessment.executionWindowState === "stable_window"
          ? "Execution window stable for controlled blend."
          : readinessAssessment.executionWindowState === "expired_window"
            ? "Execution readiness blocked by stale playback state."
            : readinessAssessment.executionWindowState === "unstable_window"
              ? "Playback telemetry freshness degraded."
              : "Transition window narrow; preparation timing required.",
        readinessAssessment.rollbackSafetyMargin < 40
          ? "Rollback margin insufficient for aggressive transition."
          : "Cue preparation confidence elevated.",
        readinessAssessment.deviceSynchronizationConfidence < 50
          ? "Device synchronization unstable."
          : "Playback transport synchronization remains within bounded stability.",
        ...phraseTelemetry.phraseTimingReasoning,
        ...harmonicEmotion.harmonicEmotionReasoning,
        ...crowdAdaptation.crowdAdaptationReasoning,
        ...narrativeFlow.narrativeReasoning,
        ...adaptiveCadence.cadenceReasoning,
        ...orchestrationSynthesis.orchestrationSynthesisReasoning,
        ...learningObservation.reasons,
        ...strategyReasoning,
        ...(topTransitionCandidate?.memoryBias.rationale ?? []),
      ],
    },
  };
  if (readinessAssessment.executionReadiness === "blocked") {
    result.decision.shouldTransition = false;
    result.decision.holdEnergy = true;
    result.executionPlan.nextAction = "hold_state";
    result.executionStrategyReasoning = [
      ...result.executionStrategyReasoning,
      "Execution readiness blocked; forced hold-state for operator-supervised safety.",
    ];
  } else if (readinessAssessment.executionReadiness === "guarded" && result.executionPlan.nextAction === "queue_next_track") {
    result.executionPlan.nextAction = "guarded_transition";
    result.executionStrategyReasoning = [
      ...result.executionStrategyReasoning,
      "Guarded readiness state requires supervised transition path.",
    ];
  }
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

