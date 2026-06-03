import "server-only";

import { AIEnhancedTrackRecommendation, QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { getRuntimeMemoryPatterns } from "@/lib/ai/runtime-memory";
import {
  evaluateExecutionReadiness,
  ExecutionStrategy,
  determineExecutionStrategy,
  scoreTransitionCandidate,
  TransitionEvaluationResult,
  TransitionRiskLevel,
} from "@/lib/ai/transition-engine";
import { RecommendationTelemetryItem } from "@/lib/spotify/telemetry-types";

export type TransitionSimulationStep = {
  index: 1 | 2 | 3;
  predictedAction: "hold_state" | "ramp_transition" | "cooldown_transition";
  predictedTrackLabel: string | null;
  candidateTrackName: string | null;
  candidateTrackArtist: string | null;
  candidateTrackBpm: number | null;
  candidateTrackEnergy: number | null;
  candidateTrackKey: string | null;
  camelotCompatibility: "unknown" | "match" | "adjacent" | "relative" | "distant";
  harmonicScore: number;
  danceability: number | null;
  speechiness: number | null;
  instrumentalness: number | null;
  crowdMomentumProjection: number | null;
  phraseCompatibility: "intro_outro_aligned" | "instrumental_to_vocal_drop" | "neutral" | "vocal_overlap_risk" | "drop_collision";
  transitionWindowConfidence: number;
  structuralContinuityProjection: number;
  beatSyncScore: number;
  transitionTimingConfidence: number;
  projectedBeatContinuity: number;
  estimatedBlendDuration: number;
  projectedEnergy: number;
  projectedBpm: number;
  projectedMomentum: "low" | "steady" | "rising" | "surging";
  projectedPhase: string;
  executionStrategy: ExecutionStrategy;
  transitionAggressiveness: number;
  transitionComplexity: number;
  operatorAttentionRequired: boolean;
  executionReadiness: "ready" | "prepare" | "guarded" | "blocked";
  executionReadinessScore: number;
  transportStability: number;
  executionWindowState: "stable_window" | "narrow_window" | "unstable_window" | "expired_window";
  rollbackReadiness: number;
  deviceSynchronizationConfidence: number;
  confidence: number;
  riskLevel: TransitionRiskLevel;
  interventionHint: string | null;
};

export type TransitionSimulationTimeline = {
  steps: TransitionSimulationStep[];
  projectedEnergyCurve: number[];
  projectedBpmFlow: number[];
  projectedMomentumFlow: Array<TransitionSimulationStep["projectedMomentum"]>;
  projectedHarmonicFlow: string[];
  projectedStructuralFlow: string[];
  projectedBeatFlow: string[];
  projectedExecutionStability: number[];
  projectedExecutionReadiness: number[];
};

export type SimulationRiskForecast = {
  currentRisk: TransitionRiskLevel;
  nextRisk: TransitionRiskLevel;
  escalationProbability: number;
  riskReasons: string[];
};

export type SimulationConfidenceForecast = {
  currentConfidence: number;
  projectedConfidenceSeries: number[];
  confidenceDrift: number;
};

export type TransitionSimulationResult = {
  timeline: TransitionSimulationTimeline;
  riskForecast: SimulationRiskForecast;
  confidenceForecast: SimulationConfidenceForecast;
  holdRampCooldownPrediction: {
    holdCount: number;
    rampCount: number;
    cooldownCount: number;
  };
};

export type SimulationOutcomeAnalysis = {
  reinforcementType: "reinforce" | "penalize" | "neutral";
  reinforcementStrength: number;
  reinforcementReason: string;
  confidenceAdjustment: number;
  riskAdjustment: number;
  continuityScore: number;
  stabilityScore: number;
  orchestrationSignature: string;
  telemetry: {
    successfulSimulationCount: number;
    riskySimulationCount: number;
    strongestReinforcedSignature: string;
    weakestOrchestrationPattern: string;
    continuityAverage: number;
    stabilityAverage: number;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function momentumFromEnergy(energy: number): TransitionSimulationStep["projectedMomentum"] {
  if (energy >= 8.8) return "surging";
  if (energy >= 6.8) return "rising";
  if (energy <= 3.8) return "low";
  return "steady";
}

function nextRiskLevelFromConfidence(confidence: number, invalidated: boolean): TransitionRiskLevel {
  if (invalidated || confidence < 55) return "high";
  if (confidence < 75) return "medium";
  return "low";
}

function extractCamelotKeyFromSignature(signature: string | null, role: "current" | "candidate") {
  if (!signature || !signature.includes("|keys:")) return null;
  const keySection = signature.split("|keys:")[1]?.split("|")[0] ?? "";
  const [currentKey, candidateKey] = keySection.split(":");
  return role === "current" ? currentKey ?? null : candidateKey ?? null;
}

function extractCamelotHintFromTrackReason(reason: string) {
  const camelotMatch = reason.match(/\b(1[0-2]|[1-9])[AB]\b/i);
  return camelotMatch ? camelotMatch[0].toUpperCase() : null;
}

function computeAverage(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type SimulationCandidateTrack = {
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  energy: number;
  moodPhase: "warmup" | "social" | "build" | "peak" | "cooldown";
  transitionCompatibility: { score: number; reason: string };
  camelotKey?: string | null;
  danceability?: number | null;
  speechiness?: number | null;
  instrumentalness?: number | null;
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

function toSimulationCandidateFromEnhanced(track: AIEnhancedTrackRecommendation): SimulationCandidateTrack {
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
    camelotKey: track.audioFeatures?.camelotKey ?? null,
    danceability: track.audioFeatures?.danceability ?? null,
    speechiness: track.audioFeatures?.speechiness ?? null,
    instrumentalness: track.audioFeatures?.instrumentalness ?? null,
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

export function simulateTransitionTimeline(params: {
  queueRecommendations: QueueRecommendationWithMeta[];
  telemetry: RecommendationTelemetryItem | null;
  evaluation: TransitionEvaluationResult;
  memoryPatterns?: Awaited<ReturnType<typeof getRuntimeMemoryPatterns>>;
}) {
  const candidateTracks = (
    params.queueRecommendations.flatMap((item) =>
      item.spotifyEnhancedRecommendations?.length
        ? item.spotifyEnhancedRecommendations.map(toSimulationCandidateFromEnhanced)
        : item.recommendedQueue.map((track) => ({
            ...track,
            camelotKey: extractCamelotHintFromTrackReason(track.transitionCompatibility.reason ?? ""),
            danceability: null,
            speechiness: null,
            instrumentalness: null,
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
          })),
    )
  ).slice(0, 12);

  const baseEnergy = params.evaluation.currentState.energy ?? 5;
  const baseBpm = params.evaluation.currentState.bpm ?? 110;
  const invalidated = params.telemetry?.invalidationStatus === "invalidated";
  const trustBias = params.evaluation.crowdFeedbackInfluence.transitionTrustScore;
  const interventionBias = params.evaluation.crowdFeedbackInfluence.operatorInterventionRate;
  const audioBias = params.evaluation.audioEnergyInfluence.engagementScore;
  const audioDrift = params.evaluation.audioEnergyInfluence.driftScore;
  const steps: TransitionSimulationStep[] = [];
  const projectedConfidenceSeries: number[] = [];
  let energy = baseEnergy;
  let bpm = baseBpm;
  let confidence = params.evaluation.confidence.score;
  let phase = params.evaluation.currentState.phase ?? "social";
  let previousKey: string | null = extractCamelotKeyFromSignature(
    params.evaluation.transitionDiagnostics.transitionSignature,
    "current",
  );
  let simulatedQueueFreshness = params.evaluation.executionReadinessScore;

  for (let i = 0; i < 3; i += 1) {
    const currentTrack = {
      title: params.evaluation.executionPlan.targetTrackLabel ?? "Current Track",
      artist: "Runtime",
      genre: "mixed",
      bpm,
      energy,
      moodPhase:
        phase === "warmup" ||
        phase === "social" ||
        phase === "build" ||
        phase === "peak" ||
        phase === "cooldown"
          ? phase
          : "social",
      transitionCompatibility: {
        score: 100,
        reason: "Simulation current context",
      },
    } as const;

    const rankedCandidates = candidateTracks
      .map((candidateTrack) => ({
        candidateTrack,
        scored: scoreTransitionCandidate({
          currentTrack,
          candidateTrack,
          currentKey: previousKey,
          candidateKey: extractCamelotHintFromTrackReason(candidateTrack.transitionCompatibility.reason ?? ""),
          memoryPatterns: params.memoryPatterns,
        }),
      }))
      .sort((a, b) => b.scored.confidence - a.scored.confidence);
    const pickedCandidate = rankedCandidates[i] ?? rankedCandidates[0] ?? null;
    const track = pickedCandidate?.candidateTrack ?? null;
    const action =
      energy >= 8.8
        ? "cooldown_transition"
        : energy <= 6.2
          ? "ramp_transition"
          : "hold_state";
    const targetEnergy = track?.energy ?? energy;
    const targetBpm = track?.bpm ?? bpm;

    energy =
      action === "ramp_transition"
        ? clamp((energy + targetEnergy) / 2 + 0.35, 1, 10)
        : action === "cooldown_transition"
          ? clamp((energy + targetEnergy) / 2 - 0.45, 1, 10)
          : clamp((energy + targetEnergy) / 2, 1, 10);
    bpm = clamp(Math.round((bpm + targetBpm) / 2), 70, 180);

    confidence = clamp(
      pickedCandidate?.scored.confidence ??
        confidence -
        (invalidated ? 7 : 2) -
        (action === "hold_state" ? 3 : 0) +
        (track ? 1 : -4) +
        (trustBias - 50) * 0.08 -
        Math.max(0, interventionBias - 45) * 0.12 +
        (audioBias - 50) * 0.06 -
        Math.abs(audioDrift) * 0.2,
      0,
      100,
    );
    projectedConfidenceSeries.push(confidence);
    const risk = nextRiskLevelFromConfidence(confidence, invalidated);
    const candidateTrackKey = extractCamelotHintFromTrackReason(track?.transitionCompatibility.reason ?? "");
    const resolvedCandidateKey = track?.camelotKey ?? candidateTrackKey;
    const camelotCompatibility = pickedCandidate?.scored.camelotCompatibility ?? "unknown";
    const harmonicScore = pickedCandidate?.scored.harmonicCompatibilityScore ?? 65;
    const phraseCompatibility = pickedCandidate?.scored.phraseCompatibility ?? "neutral";
    const transitionWindowConfidence = pickedCandidate?.scored.transitionWindowConfidence ?? 64;
    const structuralContinuityProjection = Number(
      clamp(
        (pickedCandidate?.scored.phraseAlignmentScore ?? 68) * 0.7 +
          transitionWindowConfidence * 0.3,
        0,
        100,
      ).toFixed(2),
    );
    const beatSyncScore = pickedCandidate?.scored.beatSyncScore ?? 66;
    const transitionTimingConfidence = pickedCandidate?.scored.transitionTimingConfidence ?? 64;
    const projectedBeatContinuity = Number(
      clamp(beatSyncScore * 0.65 + transitionTimingConfidence * 0.35, 0, 100).toFixed(2),
    );
    const estimatedBlendDuration = pickedCandidate?.scored.estimatedBlendDuration ?? 12;
    const strategyDecision = determineExecutionStrategy({
      harmonicCompatibility: camelotCompatibility,
      phraseCompatibility,
      syncCompatibility: pickedCandidate?.scored.syncCompatibility ?? "matched_bar_window",
      vocalOverlapRisk: pickedCandidate?.scored.vocalOverlapRisk ?? 40,
      beatRisk: pickedCandidate?.scored.beatRisk ?? "watch",
      harmonicRisk: pickedCandidate?.scored.harmonicRisk ?? "neutral_missing_key_metadata",
      phraseRisk: pickedCandidate?.scored.phraseRisk ?? "watch",
      currentEnergy: energy,
      targetEnergy,
      crowdMomentum:
        (pickedCandidate?.scored.crowdMomentumProjection ?? 50) >= 78
          ? "surging"
          : (pickedCandidate?.scored.crowdMomentumProjection ?? 50) >= 62
            ? "rising"
            : (pickedCandidate?.scored.crowdMomentumProjection ?? 50) <= 38
              ? "low"
              : "steady",
      confidence: pickedCandidate?.scored.confidence ?? confidence,
    });
    const simulatedSignalConflicts: string[] = [];
    if (strategyDecision.operatorAttentionRequired) simulatedSignalConflicts.push("operator_attention_required");
    if ((pickedCandidate?.scored.beatRisk ?? "watch") === "risky") simulatedSignalConflicts.push("beat_sync_instability");
    if (simulatedQueueFreshness < 50) simulatedSignalConflicts.push("stale_playback_telemetry");
    const readiness = evaluateExecutionReadiness({
      playbackState: {
        activeDevice:
          params.evaluation.deviceSynchronizationConfidence >= 45
            ? { id: "simulated-device", is_restricted: false }
            : null,
        playbackState: { isPlaying: true, progressMs: 1_000 + i * 2_500 },
        queueStatus: {
          syncStatus: params.evaluation.deviceSynchronizationConfidence >= 55 ? "synced" : "no_active_device",
        },
      },
      executionStrategy: strategyDecision.executionStrategy,
      confidence: pickedCandidate?.scored.confidence ?? confidence,
      riskLevel: risk,
      transitionTimingConfidence,
      downbeatAlignmentConfidence: pickedCandidate?.scored.downbeatAlignmentConfidence ?? 60,
      operatorAttentionRequired: strategyDecision.operatorAttentionRequired,
      signalConflicts: simulatedSignalConflicts,
      playbackDeviceReady: params.evaluation.deviceSynchronizationConfidence >= 45,
      queueFreshnessScore: simulatedQueueFreshness,
    });
    simulatedQueueFreshness = clamp(
      simulatedQueueFreshness -
        (readiness.executionReadiness === "ready" ? 2 : readiness.executionReadiness === "prepare" ? 4 : 8),
      20,
      100,
    );

    steps.push({
      index: (i + 1) as 1 | 2 | 3,
      predictedAction: action,
      predictedTrackLabel: track ? `${track.title} - ${track.artist}` : null,
      candidateTrackName: track?.title ?? null,
      candidateTrackArtist: track?.artist ?? null,
      candidateTrackBpm: track?.bpm ?? null,
      candidateTrackEnergy: track?.energy ?? null,
      candidateTrackKey: resolvedCandidateKey ?? null,
      camelotCompatibility,
      harmonicScore,
      danceability: track?.danceability ?? null,
      speechiness: track?.speechiness ?? null,
      instrumentalness: track?.instrumentalness ?? null,
      crowdMomentumProjection: pickedCandidate?.scored.crowdMomentumProjection ?? track?.crowdMomentumProjection ?? null,
      phraseCompatibility,
      transitionWindowConfidence,
      structuralContinuityProjection,
      beatSyncScore,
      transitionTimingConfidence,
      projectedBeatContinuity,
      estimatedBlendDuration,
      projectedEnergy: Number(energy.toFixed(2)),
      projectedBpm: bpm,
      projectedMomentum: momentumFromEnergy(energy),
      projectedPhase: energy >= 8.6 ? "peak" : energy <= 4 ? "cooldown" : "build",
      executionStrategy: strategyDecision.executionStrategy,
      transitionAggressiveness: strategyDecision.aggressiveness,
      transitionComplexity: strategyDecision.transitionComplexity,
      operatorAttentionRequired: strategyDecision.operatorAttentionRequired,
      executionReadiness: readiness.executionReadiness,
      executionReadinessScore: readiness.executionReadinessScore,
      transportStability: readiness.transportStability,
      executionWindowState: readiness.executionWindowState,
      rollbackReadiness: readiness.rollbackReadiness,
      deviceSynchronizationConfidence: readiness.deviceSynchronizationConfidence,
      confidence,
      riskLevel: risk,
      interventionHint:
        risk === "high"
          ? "Operator should review before execution."
          : action === "cooldown_transition"
            ? "Consider energy hold if crowd still rising."
            : null,
    });
    phase = energy >= 8.6 ? "peak" : energy <= 4 ? "cooldown" : "build";
    previousKey = resolvedCandidateKey ?? null;
  }

  const riskReasons: string[] = [];
  if (invalidated) riskReasons.push("Recommendation telemetry is invalidated.");
  if (steps.some((step) => step.riskLevel === "high")) riskReasons.push("Projected confidence trend degrades.");
  if (steps.some((step) => step.predictedAction === "cooldown_transition"))
    riskReasons.push("Cooldown transitions detected in forecast.");
  if (steps.some((step) => step.camelotCompatibility === "distant")) {
    riskReasons.push("Distant-key harmonic jumps detected in simulation.");
  }
  if (steps.some((step) => step.phraseCompatibility === "drop_collision")) {
    riskReasons.push("Structural continuity risk: projected drop collision.");
  }
  if (steps.some((step) => step.phraseCompatibility === "vocal_overlap_risk")) {
    riskReasons.push("Vocal overlap risk detected in phrase windows.");
  }
  if (steps.some((step) => step.beatSyncScore < 58)) {
    riskReasons.push("Beat-grid continuity degrades in projected transitions.");
  }
  if (steps.filter((step) => step.executionStrategy === "fast_cut").length >= 2) {
    riskReasons.push("Repeated fast-cut strategy switching indicates instability.");
  }
  if (steps.some((step) => step.executionReadiness === "blocked")) {
    riskReasons.push("Execution readiness degrades to blocked in projected horizon.");
  }
  if (steps.some((step) => step.deviceSynchronizationConfidence < 45)) {
    riskReasons.push("Playback synchronization instability escalates in simulation.");
  }
  if (steps.some((step) => step.executionWindowState === "expired_window")) {
    riskReasons.push("Execution window expires under projected timing drift.");
  }

  const timeline: TransitionSimulationTimeline = {
    steps,
    projectedEnergyCurve: steps.map((step) => step.projectedEnergy),
    projectedBpmFlow: steps.map((step) => step.projectedBpm),
    projectedMomentumFlow: steps.map((step) => step.projectedMomentum),
    projectedHarmonicFlow: steps.map((step) => `${step.camelotCompatibility}:${step.harmonicScore.toFixed(0)}`),
    projectedStructuralFlow: steps.map(
      (step) => `${step.phraseCompatibility}:${step.transitionWindowConfidence.toFixed(0)}`,
    ),
    projectedBeatFlow: steps.map(
      (step) => `${step.beatSyncScore.toFixed(0)}:${step.transitionTimingConfidence.toFixed(0)}`,
    ),
    projectedExecutionStability: steps.map((step) =>
      Number(clamp(100 - step.transitionAggressiveness * 0.55, 0, 100).toFixed(2)),
    ),
    projectedExecutionReadiness: steps.map((step) => Number(step.executionReadinessScore.toFixed(2))),
  };
  const riskForecast: SimulationRiskForecast = {
    currentRisk: params.evaluation.riskLevel,
    nextRisk: steps[0]?.riskLevel ?? params.evaluation.riskLevel,
    escalationProbability: Number(
      (
        (steps.filter((step) => step.riskLevel === "high").length / Math.max(steps.length, 1)) *
        100
      ).toFixed(2),
    ),
    riskReasons,
  };
  const confidenceForecast: SimulationConfidenceForecast = {
    currentConfidence: params.evaluation.confidence.score,
    projectedConfidenceSeries,
    confidenceDrift: Number(
      (
        (projectedConfidenceSeries[projectedConfidenceSeries.length - 1] ?? params.evaluation.confidence.score) -
        params.evaluation.confidence.score
      ).toFixed(2),
    ),
  };

  return {
    timeline,
    riskForecast,
    confidenceForecast,
    holdRampCooldownPrediction: {
      holdCount: steps.filter((step) => step.predictedAction === "hold_state").length,
      rampCount: steps.filter((step) => step.predictedAction === "ramp_transition").length,
      cooldownCount: steps.filter((step) => step.predictedAction === "cooldown_transition").length,
    },
  } satisfies TransitionSimulationResult;
}

export function analyzeSimulationOutcome(params: {
  simulation: TransitionSimulationResult;
  evaluation: TransitionEvaluationResult;
}) {
  const { simulation, evaluation } = params;
  const steps = simulation.timeline.steps;
  const confidenceDrift = simulation.confidenceForecast.confidenceDrift;
  const escalatedRisk = simulation.riskForecast.escalationProbability;
  const harmonicSafeRatio =
    steps.filter((step) => step.camelotCompatibility === "match" || step.camelotCompatibility === "adjacent").length /
    Math.max(steps.length, 1);
  const phraseSafeRatio =
    steps.filter(
      (step) =>
        step.phraseCompatibility === "intro_outro_aligned" ||
        step.phraseCompatibility === "instrumental_to_vocal_drop" ||
        step.phraseCompatibility === "neutral",
    ).length / Math.max(steps.length, 1);
  const beatSafeRatio = steps.filter((step) => step.beatSyncScore >= 62).length / Math.max(steps.length, 1);
  const downbeatAvg = computeAverage(steps.map((step) => step.transitionTimingConfidence));
  const continuityScore = Number(
    (
      harmonicSafeRatio * 25 +
      phraseSafeRatio * 25 +
      beatSafeRatio * 25 +
      clamp(100 - Math.max(0, escalatedRisk - 20), 0, 100) * 0.25
    ).toFixed(2),
  );
  const stabilityScore = Number(
    (
      clamp(100 + Math.min(0, confidenceDrift * 2.4), 0, 100) * 0.35 +
      downbeatAvg * 0.25 +
      computeAverage(steps.map((step) => step.projectedBeatContinuity)) * 0.2 +
      computeAverage(steps.map((step) => step.structuralContinuityProjection)) * 0.13 +
      computeAverage(steps.map((step) => step.executionReadinessScore)) * 0.07
    ).toFixed(2),
  );

  const majorRiskSpikes = steps.filter((step) => step.riskLevel === "high").length;
  const hasDropCollision = steps.some((step) => step.phraseCompatibility === "drop_collision");
  const hasVocalEscalation = steps.some((step) => step.phraseCompatibility === "vocal_overlap_risk");
  const unstableBeat = steps.some((step) => step.beatSyncScore < 55 || step.transitionTimingConfidence < 55);
  const harmonicDegrade = steps.some((step) => step.camelotCompatibility === "distant");
  const blockedReadinessCount = steps.filter((step) => step.executionReadiness === "blocked").length;
  const desyncCount = steps.filter((step) => step.deviceSynchronizationConfidence < 45).length;

  const successConditionsMet =
    confidenceDrift >= -10 &&
    majorRiskSpikes <= 1 &&
    !hasDropCollision &&
    !hasVocalEscalation &&
    !unstableBeat &&
    !harmonicDegrade &&
    blockedReadinessCount === 0 &&
    desyncCount <= 1 &&
    continuityScore >= 68 &&
    stabilityScore >= 68;
  const failureConditionsMet =
    confidenceDrift <= -16 ||
    majorRiskSpikes >= 2 ||
    hasDropCollision ||
    hasVocalEscalation ||
    unstableBeat ||
    harmonicDegrade ||
    blockedReadinessCount >= 1 ||
    desyncCount >= 2 ||
    continuityScore <= 52 ||
    stabilityScore <= 52;

  let reinforcementType: SimulationOutcomeAnalysis["reinforcementType"] = "neutral";
  let reinforcementStrength = 0;
  let reinforcementReason = "Simulation outcome is mixed; neutral reinforcement.";
  let confidenceAdjustment = 0;
  let riskAdjustment = 0;
  const strategyFastCutCount = steps.filter((step) => step.executionStrategy === "fast_cut").length;
  const strategyOverlayCount = steps.filter((step) => step.executionStrategy === "harmonic_overlay").length;
  const strategySwitches = steps.reduce((count, step, index, arr) => {
    if (index === 0) return 0;
    return count + (arr[index - 1]?.executionStrategy !== step.executionStrategy ? 1 : 0);
  }, 0);
  const executionStabilityAverage = computeAverage(simulation.timeline.projectedExecutionStability);
  const readinessAverage = computeAverage(steps.map((step) => step.executionReadinessScore));
  const cadenceStabilityWindowCount = steps.filter(
    (step) => step.executionWindowState === "stable_window" && step.executionReadiness !== "blocked",
  ).length;
  const healthyCadenceWindowRatio = cadenceStabilityWindowCount / Math.max(steps.length, 1);
  const fastCutInstabilityAmplifier = Math.max(
    0,
    strategyFastCutCount >= 2
      ? strategyFastCutCount - 1 - (healthyCadenceWindowRatio >= 0.5 ? 1 : 0)
      : 0,
  );
  const boundedInstabilityDecay = Number(
    clamp(
      healthyCadenceWindowRatio * 0.16 +
        (executionStabilityAverage >= 68 ? 0.08 : 0) +
        (readinessAverage >= 68 ? 0.06 : 0),
      0,
      0.26,
    ).toFixed(3),
  );

  if (successConditionsMet) {
    reinforcementType = "reinforce";
    reinforcementStrength = Number(clamp((continuityScore + stabilityScore) / 2 / 100, 0.08, 0.32).toFixed(3));
    confidenceAdjustment = Number(clamp(continuityScore * 0.12, 1.5, 8).toFixed(2));
    riskAdjustment = Number(clamp(-stabilityScore * 0.008 - boundedInstabilityDecay, -0.35, -0.06).toFixed(2));
    reinforcementReason =
      "Stable continuity chain: harmonic, phrase, beat, and timing windows remained safe across simulation.";
    if (strategyOverlayCount >= 2) {
      reinforcementReason += " Harmonic overlay strategy remained consistently effective.";
    }
    if (readinessAverage >= 72) {
      reinforcementReason += " Stable execution readiness continuity improved preparation quality.";
    }
  } else if (failureConditionsMet) {
    reinforcementType = "penalize";
    reinforcementStrength = Number(clamp((100 - Math.min(continuityScore, stabilityScore)) / 100, 0.1, 0.34).toFixed(3));
    confidenceAdjustment = Number(clamp(-((100 - continuityScore) * 0.1), -10, -2).toFixed(2));
    riskAdjustment = Number(
      clamp((100 - stabilityScore) * 0.01 + fastCutInstabilityAmplifier * 0.03 - boundedInstabilityDecay, 0.08, 0.4).toFixed(2),
    );
    reinforcementReason =
      "Risky continuity detected: harmonic/phrase/beat instability or timing-window degradation appeared.";
    if (strategyFastCutCount >= 2 || strategySwitches >= 2) {
      reinforcementReason += " Strategy instability and repeated recovery behavior increased risk.";
    }
    if (boundedInstabilityDecay > 0.12) {
      reinforcementReason += " Healthy cadence windows provided bounded instability decay.";
    }
    if (blockedReadinessCount > 0 || desyncCount > 0) {
      reinforcementReason += " Execution readiness degraded from stale telemetry or device desynchronization.";
    }
  }

  const weakPattern =
    hasDropCollision
      ? "drop_collision"
      : hasVocalEscalation
        ? "vocal_overlap_risk"
        : harmonicDegrade
          ? "harmonic_jump"
          : unstableBeat
            ? "beat_instability"
            : "mixed_continuity";
  const strongestPattern =
    harmonicSafeRatio >= 0.66 && phraseSafeRatio >= 0.66
      ? "harmonic_phrase_safe_chain"
      : beatSafeRatio >= 0.66
        ? "stable_beat_timing_chain"
        : "balanced_transition_chain";
  const orchestrationSignature = `sim:${evaluation.transitionDiagnostics.transitionSignature ?? "unknown"}|${reinforcementType}|c:${continuityScore.toFixed(0)}|s:${stabilityScore.toFixed(0)}|r:${simulation.riskForecast.escalationProbability.toFixed(0)}|exec:${steps[0]?.executionStrategy ?? "unknown"}|switch:${strategySwitches}|stab:${executionStabilityAverage.toFixed(0)}`;
  const extendedOrchestrationSignature = `${orchestrationSignature}|ready:${steps[0]?.executionReadiness ?? "unknown"}|window:${steps[0]?.executionWindowState ?? "unknown"}|transport:${computeAverage(steps.map((step) => step.transportStability)).toFixed(0)}|rollback:${computeAverage(steps.map((step) => step.rollbackReadiness)).toFixed(0)}`;

  return {
    reinforcementType,
    reinforcementStrength,
    reinforcementReason,
    confidenceAdjustment,
    riskAdjustment,
    continuityScore,
    stabilityScore,
    orchestrationSignature: extendedOrchestrationSignature,
    telemetry: {
      successfulSimulationCount: reinforcementType === "reinforce" ? 1 : 0,
      riskySimulationCount: reinforcementType === "penalize" ? 1 : 0,
      strongestReinforcedSignature: strongestPattern,
      weakestOrchestrationPattern:
        strategyFastCutCount >= 2 || strategySwitches >= 2 ? "strategy_instability" : weakPattern,
      continuityAverage: Number(continuityScore.toFixed(2)),
      stabilityAverage: Number(stabilityScore.toFixed(2)),
    },
  } satisfies SimulationOutcomeAnalysis;
}

